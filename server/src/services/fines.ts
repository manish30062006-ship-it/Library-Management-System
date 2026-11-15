import type { FineStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { badRequest, conflict, notFound } from '../lib/errors';
import { overdueDays } from '../lib/time';
import { inr } from '../lib/money';
import { writeAudit } from './audit';
import { notifyMember } from './notifications';
import type { AuthUser } from '../types/auth';

export function computeOverdueFineCents(dueAt: Date, at: Date = new Date()): number {
  const days = overdueDays(dueAt, at);
  if (days === 0) return 0;
  return Math.min(days * env.FINE_PER_DAY_CENTS, env.MAX_FINE_CENTS);
}

export async function outstandingCents(memberId: string): Promise<number> {
  const fines = await prisma.fine.findMany({
    where: { memberId, status: { in: ['PENDING', 'PARTIAL'] } },
    select: { amount: true, paidAmount: true },
  });
  return fines.reduce((sum, fine) => sum + (fine.amount - fine.paidAmount), 0);
}

export async function listFinesForMember(memberId: string) {
  return prisma.fine.findMany({
    where: { memberId },
    orderBy: { assessedAt: 'desc' },
    include: {
      payments: true,
      loan: {
        select: {
          id: true,
          bookId: true,
          dueAt: true,
          returnedAt: true,
          copy: { select: { copyCode: true } },
        },
      },
    },
  });
}

export interface PayFineInput {
  fineId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  actor: AuthUser;
  ip?: string | null;
}

export async function payFine(input: PayFineInput) {
  if (input.amount <= 0) throw badRequest('Payment amount must be positive');

  const result = await prisma.$transaction(async (tx) => {
    const fine = await tx.fine.findUnique({ where: { id: input.fineId } });
    if (!fine) throw notFound('Fine not found');
    if (fine.status === 'PAID' || fine.status === 'WAIVED') {
      throw conflict('Fine is already settled');
    }

    const remaining = fine.amount - fine.paidAmount;
    if (input.amount > remaining) {
      throw badRequest(`Payment exceeds the remaining balance (${inr(remaining)})`);
    }

    const paidAmount = fine.paidAmount + input.amount;
    const fullyPaid = paidAmount >= fine.amount;

    const updated = await tx.fine.update({
      where: { id: fine.id },
      data: {
        paidAmount,
        status: fullyPaid ? 'PAID' : 'PARTIAL',
        paidAt: fullyPaid ? new Date() : null,
      },
    });

    await tx.payment.create({
      data: {
        fineId: fine.id,
        memberId: fine.memberId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        receivedById: input.actor.id,
      },
    });

    return { fine: updated, memberId: fine.memberId, fullyPaid };
  });

  await notifyMember(result.memberId, {
    type: 'PAYMENT',
    title: 'Payment received',
    body: `We received ${inr(input.amount)} toward your library balance.`,
    data: { fineId: input.fineId, amountCents: input.amount },
  });

  await writeAudit({
    actor: input.actor,
    action: 'fine.payment',
    entityType: 'fine',
    entityId: input.fineId,
    after: {
      amountCents: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      fullyPaid: result.fullyPaid,
    },
    ip: input.ip,
  });

  return result.fine;
}

export async function waiveFine(input: {
  fineId: string;
  note: string;
  actor: AuthUser;
  ip?: string | null;
}) {
  const fine = await prisma.fine.findUnique({ where: { id: input.fineId } });
  if (!fine) throw notFound('Fine not found');
  if (fine.status === 'PAID' || fine.status === 'WAIVED') {
    throw conflict('Fine is already settled');
  }

  const updated = await prisma.fine.update({
    where: { id: fine.id },
    data: { status: 'WAIVED', note: input.note },
  });

  await notifyMember(fine.memberId, {
    type: 'FINE',
    title: 'Fine waived',
    body: 'A library fine on your account was waived.',
    data: { fineId: fine.id },
  });

  await writeAudit({
    actor: input.actor,
    action: 'fine.waive',
    entityType: 'fine',
    entityId: fine.id,
    before: { status: fine.status, amount: fine.amount, paidAmount: fine.paidAmount },
    after: { status: 'WAIVED', note: input.note },
    ip: input.ip,
  });

  return updated;
}

export async function listFinesForStaff(filters: {
  status?: FineStatus;
  memberId?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.FineWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.memberId) where.memberId = filters.memberId;

  const [items, total] = await Promise.all([
    prisma.fine.findMany({
      where,
      orderBy: { assessedAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        member: {
          select: {
            membershipNo: true,
            user: { select: { name: true, email: true } },
          },
        },
        loan: {
          select: {
            bookId: true,
            dueAt: true,
            copy: { select: { copyCode: true } },
          },
        },
        payments: true,
      },
    }),
    prisma.fine.count({ where }),
  ]);

  return {
    items: items.map((fine) => ({
      ...fine,
      remainingCents: Math.max(0, fine.amount - fine.paidAmount),
    })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}
