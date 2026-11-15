import type { BookDocument } from '../models/book';

export interface BookView {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn: string;
  publisher: string | null;
  publishedYear: number | null;
  language: string;
  pages: number | null;
  subjects: string[];
  description: string | null;
  coverUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
}

export function serializeBook(book: BookDocument): BookView {
  const createdAt =
    book.createdAt instanceof Date ? book.createdAt : new Date(book.createdAt);
  return {
    id: String(book._id),
    title: book.title,
    subtitle: book.subtitle ?? null,
    authors: book.authors ?? [],
    isbn: book.isbn,
    publisher: book.publisher ?? null,
    publishedYear: book.publishedYear ?? null,
    language: book.language ?? 'en',
    pages: book.pages ?? null,
    subjects: book.subjects ?? [],
    description: book.description ?? null,
    coverUrl: book.coverUrl ?? null,
    ratingAvg: book.ratingAvg ?? 0,
    ratingCount: book.ratingCount ?? 0,
    createdAt: createdAt.toISOString(),
  };
}
