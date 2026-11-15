import { prisma } from '../lib/prisma';
import type { BookView } from './bookMapper';

export interface Availability {
  total: number;
  available: number;
  byStatus: Record<string, number>;
}

export interface BookWithAvailability extends BookView {
  totalCopies: number;
  availableCopies: number;
  copiesByStatus: Record<string, number>;
}

export async function availabilityFor(
  bookIds: string[],
): Promise<Map<string, Availability>> {
  const map = new Map<string, Availability>();
  if (!bookIds.length) return map;

  const rows = await prisma.bookCopy.groupBy({
    by: ['bookId', 'status'],
    where: { bookId: { in: bookIds } },
    _count: { _all: true },
  });

  for (const row of rows) {
    const entry = map.get(row.bookId) ?? { total: 0, available: 0, byStatus: {} };
    const count = row._count._all;
    entry.total += count;
    entry.byStatus[row.status] = (entry.byStatus[row.status] ?? 0) + count;
    if (row.status === 'AVAILABLE') entry.available += count;
    map.set(row.bookId, entry);
  }

  return map;
}

export async function withAvailability(books: BookView[]): Promise<BookWithAvailability[]> {
  const counts = await availabilityFor(books.map((b) => b.id));
  return books.map((book) => {
    const availability = counts.get(book.id);
    return {
      ...book,
      totalCopies: availability?.total ?? 0,
      availableCopies: availability?.available ?? 0,
      copiesByStatus: availability?.byStatus ?? {},
    };
  });
}

export async function withAvailabilityForOne(
  book: BookView,
): Promise<BookWithAvailability> {
  const counts = await availabilityFor([book.id]);
  const availability = counts.get(book.id);
  return {
    ...book,
    totalCopies: availability?.total ?? 0,
    availableCopies: availability?.available ?? 0,
    copiesByStatus: availability?.byStatus ?? {},
  };
}
