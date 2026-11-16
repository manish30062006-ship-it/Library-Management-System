import { prisma } from '../lib/prisma';
import { bookMetaMap } from './books';

interface DayCount {
  day: string;
  count: number;
}

interface DayCents {
  day: string;
  cents: number;
}

interface BucketCount {
  bucket: string;
  count: number;
}

interface TopBookRow {
  bookId: string;
  loans: number;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function countByDay(dates: Date[]): DayCount[] {
  const map = new Map<string, number>();
  for (const date of dates) {
    const key = dayKey(date);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function dashboard(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const now = new Date();

  const [
    members,
    activeMembers,
    activeLoans,
    overdueLoans,
    readyHolds,
    queuedHolds,
    openFines,
    collectedPayments,
    recentLoans,
    recentPayments,
    overdueRows,
    topLoanRows,
    fineStatus,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE', dueAt: { lt: now } } }),
    prisma.reservation.count({ where: { status: 'READY' } }),
    prisma.reservation.count({ where: { status: 'QUEUED' } }),
    prisma.fine.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      select: { amount: true, paidAmount: true },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: since } },
      select: { amount: true, paidAt: true },
    }),
    prisma.loan.findMany({
      where: { checkedOutAt: { gte: since } },
      select: { checkedOutAt: true, bookId: true },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: since } },
      select: { paidAt: true, amount: true },
    }),
    prisma.loan.findMany({
      where: { status: 'ACTIVE', dueAt: { lt: now } },
      select: { dueAt: true },
    }),
    prisma.loan.findMany({
      where: { checkedOutAt: { gte: since } },
      select: { bookId: true },
    }),
    prisma.fine.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
    }),
  ]);

  const outstandingFineCents = openFines.reduce(
    (sum, fine) => sum + fine.amount - fine.paidAmount,
    0,
  );
  const collectedFineCents = collectedPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const circulationByDay: DayCount[] = countByDay(recentLoans.map((loan) => loan.checkedOutAt));

  const revenueMap = new Map<string, number>();
  for (const payment of recentPayments) {
    const key = dayKey(payment.paidAt);
    revenueMap.set(key, (revenueMap.get(key) ?? 0) + payment.amount);
  }
  const revenueByDay: DayCents[] = [...revenueMap.entries()]
    .map(([day, cents]) => ({ day, cents }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const buckets = new Map<string, number>([
    ['1-7 days', 0],
    ['8-30 days', 0],
    ['31+ days', 0],
  ]);
  for (const { dueAt } of overdueRows) {
    const daysLate = Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000));
    const bucket = daysLate < 7 ? '1-7 days' : daysLate < 30 ? '8-30 days' : '31+ days';
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const overdueAging: BucketCount[] = [...buckets.entries()]
    .filter(([, count]) => count > 0)
    .map(([bucket, count]) => ({ bucket, count }));

  const loanCounts = new Map<string, number>();
  for (const { bookId } of topLoanRows) {
    loanCounts.set(bookId, (loanCounts.get(bookId) ?? 0) + 1);
  }
  const topBookRows: TopBookRow[] = [...loanCounts.entries()]
    .map(([bookId, loans]) => ({ bookId, loans }))
    .sort((a, b) => b.loans - a.loans)
    .slice(0, 8);

  const metas = await bookMetaMap(topBookRows.map((row) => row.bookId));

  return {
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    kpis: {
      members,
      activeMembers,
      activeLoans,
      overdueLoans,
      readyHolds,
      queuedHolds,
      outstandingFineCents,
      collectedFineCents,
    },
    circulationByDay,
    revenueByDay,
    overdueAging,
    topBooks: topBookRows.map((row) => ({
      bookId: row.bookId,
      loans: row.loans,
      book: metas.get(row.bookId) ?? null,
    })),
    finesByStatus: fineStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
      amountCents: Number(row._sum.amount ?? 0),
      paidCents: Number(row._sum.paidAmount ?? 0),
    })),
  };
}
