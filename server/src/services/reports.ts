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

export async function dashboard(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);

  const [
    members,
    activeMembers,
    activeLoans,
    overdueLoans,
    readyHolds,
    queuedHolds,
    outstandingRow,
    collectedRow,
    circulationByDay,
    revenueByDay,
    overdueAging,
    topBookRows,
    fineStatus,
  ] = await Promise.all([
    prisma.member.count(),
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE', dueAt: { lt: new Date() } } }),
    prisma.reservation.count({ where: { status: 'READY' } }),
    prisma.reservation.count({ where: { status: 'QUEUED' } }),
    prisma.$queryRaw<Array<{ outstanding: number }>>`
      SELECT CAST(COALESCE(SUM(amount - paidAmount), 0) AS SIGNED) AS outstanding
      FROM \`Fine\`
      WHERE status IN ('PENDING', 'PARTIAL')
    `,
    prisma.$queryRaw<Array<{ collected: number }>>`
      SELECT CAST(COALESCE(SUM(amount), 0) AS SIGNED) AS collected
      FROM \`Payment\`
      WHERE \`paidAt\` >= ${since}
    `,
    prisma.$queryRaw<DayCount[]>`
      SELECT DATE_FORMAT(\`checkedOutAt\`, '%Y-%m-%d') AS day,
             CAST(COUNT(*) AS SIGNED) AS count
      FROM \`Loan\`
      WHERE \`checkedOutAt\` >= ${since}
      GROUP BY day
      ORDER BY day
    `,
    prisma.$queryRaw<DayCents[]>`
      SELECT DATE_FORMAT(\`paidAt\`, '%Y-%m-%d') AS day,
             CAST(COALESCE(SUM(amount), 0) AS SIGNED) AS cents
      FROM \`Payment\`
      WHERE \`paidAt\` >= ${since}
      GROUP BY day
      ORDER BY day
    `,
    prisma.$queryRaw<BucketCount[]>`
      SELECT CASE
               WHEN TIMESTAMPDIFF(DAY, \`dueAt\`, UTC_TIMESTAMP()) < 7 THEN '1-7 days'
               WHEN TIMESTAMPDIFF(DAY, \`dueAt\`, UTC_TIMESTAMP()) < 30 THEN '8-30 days'
               ELSE '31+ days'
             END AS bucket,
             CAST(COUNT(*) AS SIGNED) AS count
      FROM \`Loan\`
      WHERE status = 'ACTIVE' AND \`dueAt\` < UTC_TIMESTAMP()
      GROUP BY bucket
    `,
    prisma.$queryRaw<TopBookRow[]>`
      SELECT \`bookId\`, CAST(COUNT(*) AS SIGNED) AS loans
      FROM \`Loan\`
      WHERE \`checkedOutAt\` >= ${since}
      GROUP BY \`bookId\`
      ORDER BY loans DESC
      LIMIT 8
    `,
    prisma.fine.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true, paidAmount: true },
    }),
  ]);

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
      outstandingFineCents: Number(outstandingRow[0]?.outstanding ?? 0),
      collectedFineCents: Number(collectedRow[0]?.collected ?? 0),
    },
    circulationByDay: circulationByDay.map((row) => ({
      day: row.day,
      count: Number(row.count),
    })),
    revenueByDay: revenueByDay.map((row) => ({ day: row.day, cents: Number(row.cents) })),
    overdueAging: overdueAging.map((row) => ({
      bucket: row.bucket,
      count: Number(row.count),
    })),
    topBooks: topBookRows.map((row) => ({
      bookId: row.bookId,
      loans: Number(row.loans),
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
