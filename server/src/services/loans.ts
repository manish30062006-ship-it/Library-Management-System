import type { LoanStatus } from '@prisma/client';
import { bookMetaMap } from './books';
import { computeOverdueFineCents } from './fines';

export interface LoanLike {
  bookId: string;
  status: LoanStatus;
  dueAt: Date;
}

export async function decorateLoans<T extends LoanLike>(loans: T[]) {
  const metas = await bookMetaMap(loans.map((loan) => loan.bookId));
  const now = new Date();

  return loans.map((loan) => {
    const overdue = loan.status === 'ACTIVE' && loan.dueAt.getTime() < now.getTime();
    return {
      ...loan,
      book: metas.get(loan.bookId) ?? null,
      overdue,
      projectedFineCents: overdue ? computeOverdueFineCents(loan.dueAt, now) : 0,
    };
  });
}
