import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { conflict, forbidden, notFound } from '../lib/errors';
import { addHours } from '../lib/time';
import { bookMetaMap, findBookDocument, invalidateCatalog } from './books';
import { notifyMember } from './notifications';
import { writeAudit } from './audit';
import type { AuthUser } from '../types/auth';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface PromotionResult {
  reservationId: string;
  memberId: string;
  bookId: string;
  copyCode: string;
  expiresAt: Date;
}

/** Assign the oldest queued hold to the oldest available copy, if both exist. */
export async function assignNextHold(
  tx: Tx,
  bookId: string,
  at: Date,
): Promise<PromotionResult | null> {
  const next = await tx.reservation.findFirst({
    where: { bookId, status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!next) return null;

  const copies = await tx.bookCopy.findMany({
    where: { bookId, status: 'AVAILABLE' },
    orderBy: { copyCode: 'asc' },
    take: 3,
  });

  const expiresAt = addHours(at, env.RESERVATION_HOLD_HOURS);

  for (const copy of copies) {
    // Conditional claim: under concurrency the row lock re-evaluates the
    // status, so a copy can never be promised to two reservations.
    const claimed = await tx.bookCopy.updateMany({
      where: { id: copy.id, status: 'AVAILABLE' },
      data: { status: 'RESERVED' },
    });
    if (claimed.count !== 1) continue;

    await tx.reservation.update({
      where: { id: next.id },
      data: { status: 'READY', copyId: copy.id, readyAt: at, expiresAt },
    });

    return {
      reservationId: next.id,
      memberId: next.memberId,
      bookId,
      copyCode: copy.copyCode,
      expiresAt,
    };
  }

  return null;
}

export async function notifyHoldReady(promotion: PromotionResult): Promise<void> {
  const meta = (await bookMetaMap([promotion.bookId])).get(promotion.bookId);
  await notifyMember(promotion.memberId, {
    type: 'HOLD_READY',
    title: 'Hold ready for pickup',
    body: `${meta?.title ?? 'Your reserved book'} is ready. Pick it up by ${promotion.expiresAt.toUTCString()}.`,
    data: {
      bookId: promotion.bookId,
      copyCode: promotion.copyCode,
      expiresAt: promotion.expiresAt.toISOString(),
    },
  });
}

function isStaff(actor: AuthUser): boolean {
  return actor.role === 'ADMIN' || actor.role === 'LIBRARIAN';
}

export async function createReservation(
  memberId: string,
  bookId: string,
  actor: AuthUser,
  ip?: string | null,
) {
  await findBookDocument(bookId);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { user: { select: { status: true } } },
  });
  if (!member) throw notFound('Member not found');
  if (member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE') {
    throw forbidden('Membership is not active');
  }

  const [duplicate, activeLoan, activeHolds] = await Promise.all([
    prisma.reservation.findFirst({
      where: { memberId, bookId, status: { in: ['QUEUED', 'READY'] } },
    }),
    prisma.loan.findFirst({ where: { memberId, bookId, status: 'ACTIVE' } }),
    prisma.reservation.count({
      where: { memberId, status: { in: ['QUEUED', 'READY'] } },
    }),
  ]);

  if (duplicate) throw conflict('You already have an active reservation for this book');
  if (activeLoan) throw conflict('This book is already issued to you');
  if (activeHolds >= env.MAX_ACTIVE_HOLDS) {
    throw conflict(`Reservation limit reached (${env.MAX_ACTIVE_HOLDS})`);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const again = await tx.reservation.findFirst({
      where: { memberId, bookId, status: { in: ['QUEUED', 'READY'] } },
    });
    if (again) throw conflict('You already have an active reservation for this book');

    const copy = await tx.bookCopy.findFirst({
      where: { bookId, status: 'AVAILABLE' },
      orderBy: { copyCode: 'asc' },
    });

    if (copy) {
      const claimed = await tx.bookCopy.updateMany({
        where: { id: copy.id, status: 'AVAILABLE' },
        data: { status: 'RESERVED' },
      });
      if (claimed.count === 1) {
        const now = new Date();
        const reservation = await tx.reservation.create({
          data: {
            bookId,
            memberId,
            copyId: copy.id,
            status: 'READY',
            readyAt: now,
            expiresAt: addHours(now, env.RESERVATION_HOLD_HOURS),
          },
        });
        return { reservation, ready: true as const, copyCode: copy.copyCode };
      }
    }

    const reservation = await tx.reservation.create({
      data: { bookId, memberId, status: 'QUEUED' },
    });
    return { reservation, ready: false as const, copyCode: null };
  });

  if (outcome.ready && outcome.reservation.expiresAt) {
    await notifyHoldReady({
      reservationId: outcome.reservation.id,
      memberId,
      bookId,
      copyCode: outcome.copyCode ?? '',
      expiresAt: outcome.reservation.expiresAt,
    });
  }

  await invalidateCatalog(bookId);
  await writeAudit({
    actor,
    action: 'reservation.create',
    entityType: 'reservation',
    entityId: outcome.reservation.id,
    after: { bookId, memberId, status: outcome.reservation.status },
    ip,
  });

  return outcome.reservation;
}

export async function cancelReservation(
  reservationId: string,
  actor: AuthUser,
  ip?: string | null,
) {
  const existing = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!existing) throw notFound('Reservation not found');
  if (!isStaff(actor) && actor.memberId !== existing.memberId) {
    throw forbidden('You can only cancel your own reservations');
  }
  if (existing.status !== 'QUEUED' && existing.status !== 'READY') {
    throw conflict('Reservation is no longer active');
  }

  const promotion = await prisma.$transaction(async (tx) => {
    const fresh = await tx.reservation.findUnique({ where: { id: reservationId } });
    if (!fresh || (fresh.status !== 'QUEUED' && fresh.status !== 'READY')) {
      throw conflict('Reservation is no longer active');
    }

    await tx.reservation.update({
      where: { id: fresh.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (fresh.copyId) {
      await tx.bookCopy.updateMany({
        where: { id: fresh.copyId, status: 'RESERVED' },
        data: { status: 'AVAILABLE' },
      });
    }

    return assignNextHold(tx, fresh.bookId, new Date());
  });

  await invalidateCatalog(existing.bookId);
  if (promotion) await notifyHoldReady(promotion);
  await writeAudit({
    actor,
    action: 'reservation.cancel',
    entityType: 'reservation',
    entityId: reservationId,
    before: { status: existing.status, bookId: existing.bookId },
    ip,
  });

  return { cancelled: true, promotedReservationId: promotion?.reservationId ?? null };
}

export async function expireReadyReservations(): Promise<{ expired: number }> {
  const expired = await prisma.reservation.findMany({
    where: { status: 'READY', expiresAt: { lt: new Date() } },
    take: 100,
    select: { id: true },
  });

  let count = 0;
  for (const item of expired) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const fresh = await tx.reservation.findUnique({ where: { id: item.id } });
        if (!fresh || fresh.status !== 'READY') return null;

        await tx.reservation.update({
          where: { id: fresh.id },
          data: { status: 'EXPIRED' },
        });

        if (fresh.copyId) {
          await tx.bookCopy.updateMany({
            where: { id: fresh.copyId, status: 'RESERVED' },
            data: { status: 'AVAILABLE' },
          });
        }

        const promotion = await assignNextHold(tx, fresh.bookId, new Date());
        return {
          memberId: fresh.memberId,
          bookId: fresh.bookId,
          promotion,
        };
      });

      if (!outcome) continue;
      count += 1;
      await invalidateCatalog(outcome.bookId);
      await notifyMember(outcome.memberId, {
        type: 'SYSTEM',
        title: 'Hold expired',
        body: 'Your pickup window expired and the copy was released. You may place a new reservation.',
        data: { bookId: outcome.bookId },
      });
      if (outcome.promotion) await notifyHoldReady(outcome.promotion);
    } catch (err) {
      logger.warn('Failed to expire reservation', {
        reservationId: item.id,
        error: (err as Error).message,
      });
    }
  }

  return { expired: count };
}

export async function listMyReservations(memberId: string) {
  const rows = await prisma.reservation.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { copy: { select: { copyCode: true } } },
  });

  const metas = await bookMetaMap(rows.map((row) => row.bookId));
  const items = [];

  for (const row of rows) {
    let position: number | null = null;
    if (row.status === 'QUEUED') {
      const ahead = await prisma.reservation.count({
        where: { bookId: row.bookId, status: 'QUEUED', createdAt: { lt: row.createdAt } },
      });
      position = ahead + 1;
    } else if (row.status === 'READY') {
      position = 1;
    }

    items.push({
      ...row,
      position,
      book: metas.get(row.bookId) ?? null,
    });
  }

  return items;
}

export async function listQueue(bookId: string) {
  const rows = await prisma.reservation.findMany({
    where: { bookId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      member: {
        select: {
          membershipNo: true,
          user: { select: { name: true, email: true } },
        },
      },
      copy: { select: { copyCode: true } },
    },
  });

  let queuedPosition = 0;
  return rows.map((row) => {
    if (row.status === 'QUEUED') queuedPosition += 1;
    return {
      ...row,
      position: row.status === 'QUEUED' ? queuedPosition : row.status === 'READY' ? 1 : null,
    };
  });
}
