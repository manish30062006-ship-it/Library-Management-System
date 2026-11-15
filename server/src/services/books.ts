import { prisma } from '../lib/prisma';
import { Book, isValidBookId, type BookDocument } from '../models/book';
import { conflict, notFound } from '../lib/errors';
import { serializeBook, type BookView } from './bookMapper';
import { cacheGet, cacheDel, cacheDelPrefix, cacheSet } from './cache';
import { withAvailabilityForOne, type BookWithAvailability } from './inventory';
import { writeAudit } from './audit';
import type { AuthUser } from '../types/auth';

const BOOK_CACHE_TTL = 60;
const bookCacheKey = (id: string) => `catalog:book:${id}`;

export interface CreateBookInput {
  title: string;
  subtitle?: string;
  authors: string[];
  isbn: string;
  publisher?: string;
  publishedYear?: number;
  language?: string;
  pages?: number;
  subjects?: string[];
  description?: string;
  coverUrl?: string;
  initialCopies?: number;
  location?: string;
}

export type UpdateBookInput = Partial<Omit<CreateBookInput, 'initialCopies' | 'location'>>;

export async function findBookDocument(id: string): Promise<BookDocument> {
  if (!isValidBookId(id)) throw notFound('Book not found');
  const doc = await Book.findById(id).lean<BookDocument>();
  if (!doc || doc.status !== 'ACTIVE') throw notFound('Book not found');
  return doc;
}

export async function getBookDetail(id: string): Promise<BookWithAvailability> {
  const key = bookCacheKey(id);
  let view = await cacheGet<BookView>(key);
  if (!view) {
    const doc = await findBookDocument(id);
    view = serializeBook(doc);
    await cacheSet(key, view, BOOK_CACHE_TTL);
  }
  return withAvailabilityForOne(view);
}

export async function invalidateCatalog(bookId: string): Promise<void> {
  await cacheDel(bookCacheKey(bookId));
  await cacheDelPrefix('catalog:search:v1:');
}

function copyPrefix(book: BookDocument): string {
  const digits = book.isbn.replace(/[^0-9Xx]/g, '');
  return (digits || String(book._id)).slice(-6).toUpperCase();
}

export async function createCopies(
  book: BookDocument,
  count: number,
  location?: string,
): Promise<void> {
  if (count <= 0) return;
  const bookId = String(book._id);
  const existing = await prisma.bookCopy.count({ where: { bookId } });
  const prefix = copyPrefix(book);
  await prisma.bookCopy.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      bookId,
      copyCode: `${prefix}-${String(existing + index + 1).padStart(4, '0')}`,
      status: 'AVAILABLE' as const,
      location: location ?? 'Main shelves',
    })),
  });
}

export async function createBook(
  input: CreateBookInput,
  actor: AuthUser,
  ip?: string | null,
): Promise<BookWithAvailability> {
  const existing = await Book.findOne({ isbn: input.isbn.trim() });
  if (existing) throw conflict('A book with this ISBN already exists');

  const doc = await Book.create({
    title: input.title.trim(),
    subtitle: input.subtitle?.trim(),
    authors: input.authors,
    isbn: input.isbn.trim(),
    publisher: input.publisher,
    publishedYear: input.publishedYear,
    language: input.language ?? 'en',
    pages: input.pages,
    subjects: input.subjects ?? [],
    description: input.description,
    coverUrl: input.coverUrl,
    status: 'ACTIVE',
    createdBy: actor.id,
  });

  const plain = doc.toObject() as unknown as BookDocument;

  if (input.initialCopies && input.initialCopies > 0) {
    await createCopies(plain, input.initialCopies, input.location);
  }

  await invalidateCatalog(String(plain._id));
  await writeAudit({
    actor,
    action: 'book.create',
    entityType: 'book',
    entityId: String(plain._id),
    after: serializeBook(plain),
    ip,
  });

  return getBookDetail(String(plain._id));
}

export async function updateBook(
  id: string,
  input: UpdateBookInput,
  actor: AuthUser,
  ip?: string | null,
): Promise<BookWithAvailability> {
  const existing = await findBookDocument(id);
  const before = serializeBook(existing);

  if (input.isbn && input.isbn.trim() !== existing.isbn) {
    const duplicate = await Book.findOne({ isbn: input.isbn.trim(), _id: { $ne: existing._id } });
    if (duplicate) throw conflict('Another book already uses this ISBN');
  }

  const patch: Record<string, unknown> = {};
  const fields = [
    'title',
    'subtitle',
    'authors',
    'publisher',
    'publishedYear',
    'language',
    'pages',
    'subjects',
    'description',
    'coverUrl',
  ] as const;

  for (const field of fields) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  if (input.isbn !== undefined) patch.isbn = input.isbn.trim();

  const updated = await Book.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean<BookDocument>();
  if (!updated) throw notFound('Book not found');

  await invalidateCatalog(id);
  await writeAudit({
    actor,
    action: 'book.update',
    entityType: 'book',
    entityId: id,
    before,
    after: serializeBook(updated),
    ip,
  });

  return getBookDetail(id);
}

export async function archiveBook(
  id: string,
  actor: AuthUser,
  ip?: string | null,
): Promise<void> {
  const book = await findBookDocument(id);
  const activeLoans = await prisma.loan.count({ where: { bookId: id, status: 'ACTIVE' } });
  if (activeLoans > 0) {
    throw conflict('Cannot archive a book with active issues');
  }

  await Book.updateOne({ _id: book._id }, { $set: { status: 'ARCHIVED' } });
  await invalidateCatalog(id);
  await writeAudit({
    actor,
    action: 'book.archive',
    entityType: 'book',
    entityId: id,
    before: serializeBook(book),
    ip,
  });
}

export async function addCopiesToBook(
  id: string,
  count: number,
  location: string | undefined,
  actor: AuthUser,
  ip?: string | null,
) {
  const book = await findBookDocument(id);
  try {
    await createCopies(book, count, location);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('Copy code collision; please retry');
    }
    throw err;
  }
  await invalidateCatalog(id);
  await writeAudit({
    actor,
    action: 'copy.create',
    entityType: 'book',
    entityId: id,
    after: { count, location: location ?? 'Main shelves' },
    ip,
  });
  return listCopies(id);
}

export async function listCopies(bookId: string) {
  await findBookDocument(bookId);
  return prisma.bookCopy.findMany({
    where: { bookId },
    orderBy: { copyCode: 'asc' },
    include: {
      loans: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          memberId: true,
          dueAt: true,
          member: {
            select: {
              membershipNo: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

export interface BookMeta {
  id: string;
  title: string;
  authors: string[];
  isbn: string;
  coverUrl: string | null;
}

export async function bookMetaMap(bookIds: string[]): Promise<Map<string, BookMeta>> {
  const valid = [...new Set(bookIds)].filter(isValidBookId);
  if (!valid.length) return new Map();

  const docs = await Book.find({ _id: { $in: valid } })
    .select('title authors isbn coverUrl')
    .lean<BookDocument[]>();

  return new Map(
    docs.map((doc) => [
      String(doc._id),
      {
        id: String(doc._id),
        title: doc.title,
        authors: doc.authors ?? [],
        isbn: doc.isbn,
        coverUrl: doc.coverUrl ?? null,
      },
    ]),
  );
}
