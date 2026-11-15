import { prisma } from '../lib/prisma';
import { addDays, dateKey } from '../lib/time';
import { logger } from '../lib/logger';
import { bookMetaMap } from '../services/books';
import { computeOverdueFineCents } from '../services/fines';
import { inr } from '../lib/money';
import { notifyMember } from '../services/notifications';
import { expireReadyReservations } from '../services/reservations';

let timers: NodeJS.Timeout[] = [];

async function scanLoans(): Promise<void> {
  const now = new Date();
  const soon = addDays(now, 2);
  const loans = await prisma.loan.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, memberId: true, bookId: true, dueAt: true },
    take: 500,
  });

  const metas = await bookMetaMap(loans.map((loan) => loan.bookId));

  for (const loan of loans) {
    const title = metas.get(loan.bookId)?.title ?? 'Your borrowed book';

    if (loan.dueAt.getTime() <= now.getTime()) {
      await notifyMember(loan.memberId, {
        type: 'OVERDUE',
        title: 'Overdue book',
        body: `${title} is overdue. Current projected fine: ${inr(
          computeOverdueFineCents(loan.dueAt, now),
        )}.`,
        data: { bookId: loan.bookId, loanId: loan.id },
        dedupeKey: `notify:overdue:${loan.id}:${dateKey(now)}`,
      });
    } else if (loan.dueAt.getTime() <= soon.getTime()) {
      await notifyMember(loan.memberId, {
        type: 'DUE_SOON',
        title: 'Book due soon',
        body: `${title} is due on ${loan.dueAt.toISOString().slice(0, 10)}.`,
        data: { bookId: loan.bookId, loanId: loan.id },
        dedupeKey: `notify:duesoon:${loan.id}:${dateKey(now)}`,
      });
    }
  }
}

async function safe(name: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err) {
    logger.warn(`${name} job failed`, { error: (err as Error).message });
  }
}

export function startScheduler(): () => void {
  const dueSoonFirst = setTimeout(() => void safe('loan-scan', scanLoans), 10_000);
  const dueSoonInterval = setInterval(
    () => void safe('loan-scan', scanLoans),
    15 * 60_000,
  );
  const holdFirst = setTimeout(
    () => void safe('hold-expiry', expireReadyReservations),
    20_000,
  );
  const holdInterval = setInterval(
    () => void safe('hold-expiry', expireReadyReservations),
    5 * 60_000,
  );

  timers = [dueSoonFirst, dueSoonInterval, holdFirst, holdInterval];
  logger.info('Background jobs started');

  return () => {
    for (const timer of timers) clearInterval(timer);
    timers = [];
  };
}

export function stopScheduler(): void {
  for (const timer of timers) clearInterval(timer);
  timers = [];
}
