import type { BookCopy, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { conflict, forbidden, notFound } from '../lib/errors';
import { addDays } from '../lib/time';
import { inr } from '../lib/money';
import { bookMetaMap, invalidateCatalog } from './books';
import { computeOverdueFineCents } from './fines';
import { lockKeyForCopy, withLock } from './locks';
import { assignNextHold, notifyHoldReady } from './reservations';
import { writeAudit } from './audit';
import { notifyMember } from './notifications';
import { decorateLoans } from './loans';
import type { AuthUser } from '../types/auth';

function normalizeCopyCode(value: string): string {
  return value.trim().toUpperCase();
}

export interface CheckoutInput {
  memberId: string;
  copyId?: string;
  copyCode?: string;
  bookId?: string;
  dueInDays?: number;
}

async function resolveCopy(input: CheckoutInput): Promise<BookCopy | null> {
  if (input.copyId) {
    return prisma.bookCopy.findUnique({ where: { id: input.copyId } });
  }
  if (input.copyCode) {
    return prisma.bookCopy.findUnique({
      where: { copyCode: normalizeCopyCode(input.copyCode) },
    });
  }
  if (input.bookId) {
    return prisma.bookCopy.findFirst({
      where: { bookId: input.bookId, status: 'AVAILABLE' },
      orderBy: { copyCode: 'asc' },
    });
  }
  return null;
}

export async function checkout(
  input: CheckoutInput,
  actor: AuthUser,
  ip?: string | null,
) {
  const copy = await resolveCopy(input);
  if (!copy) throw notFound('No available copy found for this book');

  return withLock(lockKeyForCopy(copy.id), 10_000, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.bookCopy.findUnique({ where: { id: copy.id } });
      if (!current) throw notFound('Copy not found');

      const member = await tx.member.findUnique({
        where: { id: input.memberId },
        include: { user: { select: { name: true, status: true } } },
      });
      if (!member) throw notFound('Member not found');
      if (member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE') {
        throw forbidden('Membership is not active');
      }
      if (member.expiresAt && member.expiresAt.getTime() < Date.now()) {
        throw forbidden('Membership has expired');
      }

      if (current.status === 'LOST' || current.status === 'MAINTENANCE') {
        throw conflict(`Copy is ${current.status.toLowerCase()} and cannot be issued`);
      }

      let reservationId: string | null = null;
      if (current.status === 'RESERVED') {
        const hold = await tx.reservation.findFirst({
          where: {
            copyId: current.id,
            memberId: member.id,
            status: 'READY',
            expiresAt: { gt: new Date() },
          },
        });
        if (!hold) throw conflict('This copy is on hold for another member');
        reservationId = hold.id;
      } else if (current.status !== 'AVAILABLE') {
        throw conflict('Copy is not available for checkout');
      }

      const activeLoans = await tx.loan.count({
        where: { memberId: member.id, status: 'ACTIVE' },
      });
      if (activeLoans >= member.maxLoans) {
        throw conflict(`Issue limit reached (${member.maxLoans})`);
      }

      const openFines = await tx.fine.findMany({
        where: { memberId: member.id, status: { in: ['PENDING', 'PARTIAL'] } },
        select: { amount: true, paidAmount: true },
      });
      const outstanding = openFines.reduce(
        (sum, fine) => sum + (fine.amount - fine.paidAmount),
        0,
      );
      if (outstanding > env.MAX_OUTSTANDING_FINE_CENTS) {
        throw conflict(
          `Outstanding fines exceed ${inr(env.MAX_OUTSTANDING_FINE_CENTS)}`,
        );
      }

      const claim = await tx.bookCopy.updateMany({
        where: { id: current.id, status: current.status },
        data: { status: 'ON_LOAN' },
      });
      if (claim.count === 0) throw conflict('Copy status changed; please retry');

      const now = new Date();
      const dueAt = addDays(now, input.dueInDays ?? env.LOAN_PERIOD_DAYS);

      const loan = await tx.loan.create({
        data: {
          copyId: current.id,
          bookId: current.bookId,
          memberId: member.id,
          issuedById: actor.id,
          checkedOutAt: now,
          dueAt,
        },
        include: { copy: { select: { copyCode: true } } },
      });

      if (reservationId) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'FULFILLED', fulfilledAt: now },
        });
      }

      return { loan, memberName: member.user.name };
    });

    await invalidateCatalog(result.loan.bookId);
    await writeAudit({
      actor,
      action: 'loan.checkout',
      entityType: 'loan',
      entityId: result.loan.id,
      after: {
        bookId: result.loan.bookId,
        copyId: result.loan.copyId,
        memberId: result.loan.memberId,
        dueAt: result.loan.dueAt,
      },
      ip,
    });

    const [decorated] = await decorateLoans([result.loan]);
    return { ...decorated, memberName: result.memberName };
  });
}

async function findActiveLoan(loanId?: string, copyCode?: string) {
  if (loanId) {
    return prisma.loan.findUnique({
      where: { id: loanId },
      include: { copy: true },
    });
  }
  if (copyCode) {
    return prisma.loan.findFirst({
      where: {
        status: 'ACTIVE',
        copy: { copyCode: normalizeCopyCode(copyCode) },
      },
      include: { copy: true },
      orderBy: { checkedOutAt: 'desc' },
    });
  }
  return null;
}

export async function returnLoan(
  input: { loanId?: string; copyCode?: string },
  actor: AuthUser,
  ip?: string | null,
) {
  const found = await findActiveLoan(input.loanId, input.copyCode);
  if (!found) throw notFound('Active issue not found');
  if (found.status !== 'ACTIVE') throw conflict('Issue is already closed');

  return withLock(lockKeyForCopy(found.copyId), 10_000, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: found.id } });
      if (!loan || loan.status !== 'ACTIVE') {
        throw conflict('Issue is already closed');
      }

      const now = new Date();
      const fineCents = computeOverdueFineCents(loan.dueAt, now);

      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: { status: 'RETURNED', returnedAt: now, fineAmount: fineCents },
      });

      let fineId: string | null = null;
      if (fineCents > 0) {
        const fine = await tx.fine.create({
          data: {
            loanId: loan.id,
            memberId: loan.memberId,
            amount: fineCents,
            reason: 'OVERDUE',
          },
        });
        fineId = fine.id;
      }

      await tx.bookCopy.update({
        where: { id: loan.copyId },
        data: { status: 'AVAILABLE' },
      });

      const promotion = await assignNextHold(tx, loan.bookId, now);

      return {
        loan: updated,
        fineCents,
        fineId,
        promotion,
        memberId: loan.memberId,
        bookId: loan.bookId,
        copyCode: found.copy.copyCode,
      };
    });

    await invalidateCatalog(result.bookId);

    const meta = (await bookMetaMap([result.bookId])).get(result.bookId);
    const title = meta?.title ?? 'Your book';
    if (result.fineCents > 0) {
      await notifyMember(result.memberId, {
        type: 'FINE',
        title: 'Fine assessed',
        body: `${title} was returned overdue. A fine of ${inr(result.fineCents)} was added to your account.`,
        data: { bookId: result.bookId, fineId: result.fineId, amountCents: result.fineCents },
      });
    } else {
      await notifyMember(result.memberId, {
        type: 'SYSTEM',
        title: 'Book returned',
        body: `${title} was returned on time. Thank you!`,
        data: { bookId: result.bookId },
      });
    }

    if (result.promotion) {
      await notifyHoldReady(result.promotion);
    }

    await writeAudit({
      actor,
      action: 'loan.return',
      entityType: 'loan',
      entityId: result.loan.id,
      after: {
        fineCents: result.fineCents,
        returnedAt: result.loan.returnedAt,
        promotedReservationId: result.promotion?.reservationId ?? null,
      },
      ip,
    });

    const [decorated] = await decorateLoans([result.loan]);
    return {
      loan: decorated,
      fineCents: result.fineCents,
      fineId: result.fineId,
      promotedReservationId: result.promotion?.reservationId ?? null,
    };
  });
}

export async function renewLoan(
  loanId: string,
  actor: AuthUser,
  ip?: string | null,
) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) throw notFound('Issue not found');

  const staff = actor.role === 'ADMIN' || actor.role === 'LIBRARIAN';
  if (!staff && actor.memberId !== loan.memberId) {
    throw forbidden('You can only renew your own issues');
  }
  if (loan.status !== 'ACTIVE') throw conflict('Only active issues can be renewed');

  const now = new Date();
  if (loan.dueAt.getTime() < now.getTime()) {
    throw conflict('Overdue issues cannot be renewed; return the book and settle the fine');
  }
  if (loan.renewedCount >= env.MAX_RENEWALS) {
    throw conflict(`Renewal limit reached (${env.MAX_RENEWALS})`);
  }

  const pendingHolds = await prisma.reservation.count({
    where: { bookId: loan.bookId, status: { in: ['QUEUED', 'READY'] } },
  });
  if (pendingHolds > 0) {
    throw conflict('This title has pending reservations and cannot be renewed');
  }

  const openFines = await prisma.fine.findMany({
    where: { memberId: loan.memberId, status: { in: ['PENDING', 'PARTIAL'] } },
    select: { amount: true, paidAmount: true },
  });
  const outstanding = openFines.reduce(
    (sum, fine) => sum + (fine.amount - fine.paidAmount),
    0,
  );
  if (outstanding > env.MAX_OUTSTANDING_FINE_CENTS) {
    throw conflict('Outstanding fines block renewal');
  }

  const newDueAt = addDays(loan.dueAt, env.RENEWAL_DAYS);
  const updated = await prisma.loan.updateMany({
    where: { id: loan.id, status: 'ACTIVE', renewedCount: loan.renewedCount },
    data: { dueAt: newDueAt, renewedCount: { increment: 1 } },
  });
  if (updated.count === 0) throw conflict('Issue changed concurrently; please retry');

  const fresh = await prisma.loan.findUniqueOrThrow({
    where: { id: loan.id },
    include: { copy: { select: { copyCode: true } } },
  });

  await writeAudit({
    actor,
    action: 'loan.renew',
    entityType: 'loan',
    entityId: loan.id,
    before: { dueAt: loan.dueAt, renewedCount: loan.renewedCount },
    after: { dueAt: newDueAt, renewedCount: loan.renewedCount + 1 },
    ip,
  });

  const [decorated] = await decorateLoans([fresh]);
  return decorated;
}

export async function markLoanLost(
  loanId: string,
  actor: AuthUser,
  note: string | undefined,
  ip?: string | null,
) {
  const found = await findActiveLoan(loanId);
  if (!found) throw notFound('Issue not found');
  if (found.status !== 'ACTIVE') throw conflict('Loan is already closed');

  return withLock(lockKeyForCopy(found.copyId), 10_000, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan || loan.status !== 'ACTIVE') throw conflict('Loan is already closed');

      const fee = env.LOST_FEE_CENTS;
      const updated = await tx.loan.update({
        where: { id: loan.id },
        data: { status: 'LOST', returnedAt: new Date(), fineAmount: fee },
      });

      await tx.bookCopy.update({
        where: { id: loan.copyId },
        data: { status: 'LOST' },
      });

      const fine = await tx.fine.create({
        data: {
          loanId: loan.id,
          memberId: loan.memberId,
          amount: fee,
          reason: 'LOST_ITEM',
          note: note ?? 'Reported lost',
        },
      });

      return { loan: updated, fine, bookId: loan.bookId, memberId: loan.memberId };
    });

    await invalidateCatalog(result.bookId);

    const meta = (await bookMetaMap([result.bookId])).get(result.bookId);
    await notifyMember(result.memberId, {
      type: 'FINE',
      title: 'Lost item fee',
      body: `${meta?.title ?? 'A borrowed book'} was reported lost. A replacement fee of ${inr(env.LOST_FEE_CENTS)} was added.`,
      data: { bookId: result.bookId, fineId: result.fine.id, amountCents: env.LOST_FEE_CENTS },
    });

    await writeAudit({
      actor,
      action: 'loan.lost',
      entityType: 'loan',
      entityId: loanId,
      after: { fineId: result.fine.id, feeCents: env.LOST_FEE_CENTS, note: note ?? null },
      ip,
    });

    const [decorated] = await decorateLoans([result.loan]);
    return { loan: decorated, fine: result.fine };
  });
}

export interface LoanFilters {
  status?: 'active' | 'overdue' | 'returned' | 'lost' | 'all';
  memberId?: string;
  bookId?: string;
  page: number;
  pageSize: number;
}

export async function listLoansForStaff(filters: LoanFilters) {
  const where: Prisma.LoanWhereInput = {};
  if (filters.memberId) where.memberId = filters.memberId;
  if (filters.bookId) where.bookId = filters.bookId;
  if (filters.status === 'active') where.status = 'ACTIVE';
  else if (filters.status === 'returned') where.status = 'RETURNED';
  else if (filters.status === 'lost') where.status = 'LOST';
  else if (filters.status === 'overdue') {
    where.status = 'ACTIVE';
    where.dueAt = { lt: new Date() };
  }

  const [rows, total] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: { checkedOutAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        copy: { select: { copyCode: true } },
        member: {
          select: {
            id: true,
            membershipNo: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.loan.count({ where }),
  ]);

  return {
    items: await decorateLoans(rows),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export async function listLoansForMember(
  memberId: string,
  status: 'active' | 'returned' | 'all',
) {
  const where: Prisma.LoanWhereInput = { memberId };
  if (status === 'active') where.status = 'ACTIVE';
  else if (status === 'returned') where.status = { in: ['RETURNED', 'LOST'] };

  const rows = await prisma.loan.findMany({
    where,
    orderBy: { checkedOutAt: 'desc' },
    take: 100,
    include: { copy: { select: { copyCode: true } } },
  });

  return decorateLoans(rows);
}
