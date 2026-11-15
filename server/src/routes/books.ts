import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, parseBody, parseQuery } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { requireAuth, requireMemberId, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { Book, type BookDocument } from '../models/book';
import { Review } from '../models/review';
import {
  addCopiesToBook,
  archiveBook,
  createBook,
  getBookDetail,
  findBookDocument,
  invalidateCatalog,
  listCopies,
  updateBook,
} from '../services/books';
import { searchBooks } from '../services/search';

export const booksRouter = Router();

const writeLimiter = rateLimit({ bucket: 'books-write', limit: 120, windowSec: 60 });

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.trim() === ''
          ? undefined
          : value.trim()
        : value,
    z.string().max(max).optional(),
  );

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional(),
  );

const searchSchema = z.object({
  q: optionalText(200),
  subject: optionalText(100),
  language: optionalText(20),
  publisher: optionalText(200),
  yearFrom: optionalInt(0, 3000),
  yearTo: optionalInt(0, 3000),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(['relevance', 'newest', 'title', 'rating']).default('relevance'),
});

const bookFields = {
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).optional(),
  authors: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  isbn: z.string().trim().min(10).max(20),
  publisher: z.string().trim().max(200).optional(),
  publishedYear: z.coerce.number().int().min(1000).max(2100).optional(),
  language: z.string().trim().min(2).max(20),
  pages: z.coerce.number().int().min(1).max(20_000).optional(),
  subjects: z.array(z.string().trim().min(1).max(80)).max(30),
  description: z.string().max(5000).optional(),
  coverUrl: z.string().url().max(1000).optional(),
};

const createBookSchema = z.object({
  ...bookFields,
  language: bookFields.language.default('en'),
  subjects: bookFields.subjects.default([]),
  initialCopies: z.coerce.number().int().min(0).max(100).default(0),
  location: z.string().trim().max(100).optional(),
});

const updateBookSchema = z.object({
  title: bookFields.title.optional(),
  subtitle: bookFields.subtitle,
  authors: bookFields.authors.optional(),
  isbn: bookFields.isbn.optional(),
  publisher: bookFields.publisher,
  publishedYear: bookFields.publishedYear,
  language: bookFields.language.optional(),
  pages: bookFields.pages,
  subjects: bookFields.subjects.optional(),
  description: bookFields.description,
  coverUrl: bookFields.coverUrl,
});

const copiesSchema = z.object({
  count: z.coerce.number().int().min(1).max(50),
  location: z.string().trim().max(100).optional(),
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(3).max(3000),
});

booksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = parseQuery(searchSchema, req.query);
    const result = await searchBooks(params);
    res.json(result);
  }),
);

booksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getBookDetail(req.params.id));
  }),
);

booksRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'LIBRARIAN'),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(createBookSchema, req.body);
    const book = await createBook(input, req.user!, req.ip);
    res.status(201).json(book);
  }),
);

booksRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'LIBRARIAN'),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(updateBookSchema, req.body);
    res.json(await updateBook(req.params.id, input, req.user!, req.ip));
  }),
);

booksRouter.delete(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await archiveBook(req.params.id, req.user!, req.ip);
    res.status(204).end();
  }),
);

booksRouter.get(
  '/:id/copies',
  requireAuth,
  requireRole('ADMIN', 'LIBRARIAN'),
  asyncHandler(async (req, res) => {
    res.json({ items: await listCopies(req.params.id) });
  }),
);

booksRouter.post(
  '/:id/copies',
  requireAuth,
  requireRole('ADMIN', 'LIBRARIAN'),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(copiesSchema, req.body);
    const copies = await addCopiesToBook(
      req.params.id,
      input.count,
      input.location,
      req.user!,
      req.ip,
    );
    res.status(201).json({ items: copies });
  }),
);

booksRouter.get(
  '/:id/reviews',
  asyncHandler(async (req, res) => {
    await findBookDocument(req.params.id);
    const reviews = await Review.find({ bookId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      items: reviews.map((review) => ({
        id: String(review._id),
        rating: review.rating,
        title: review.title ?? null,
        body: review.body,
        memberName: review.memberName,
        verifiedBorrow: review.verifiedBorrow,
        createdAt: review.createdAt,
      })),
    });
  }),
);

booksRouter.post(
  '/:id/reviews',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const memberId = requireMemberId(req);
    const bookId = req.params.id;
    await findBookDocument(bookId);

    const returned = await prisma.loan.count({
      where: { bookId, memberId, status: 'RETURNED' },
    });
    if (returned === 0) {
      throw forbidden('Only members who have borrowed and returned this book may review it');
    }

    const data = parseBody(reviewSchema, req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true },
    });
    if (!user) throw notFound('User not found');

    const review = await Review.findOneAndUpdate(
      { bookId, userId: req.user!.id },
      {
        $set: {
          rating: data.rating,
          title: data.title,
          body: data.body,
          memberName: user.name,
          verifiedBorrow: true,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    if (!review) throw notFound('Book not found');

    const aggregate = await Review.aggregate<{
      _id: null;
      avg: number;
      count: number;
    }>([
      { $match: { bookId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const ratingAvg = Math.round((aggregate[0]?.avg ?? 0) * 10) / 10;
    const ratingCount = aggregate[0]?.count ?? 0;

    await Book.findByIdAndUpdate(bookId, { $set: { ratingAvg, ratingCount } });

    await invalidateCatalog(bookId);

    res.status(201).json({
      id: String(review._id),
      rating: review.rating,
      title: review.title ?? null,
      body: review.body,
      memberName: review.memberName,
      verifiedBorrow: review.verifiedBorrow,
      createdAt: review.createdAt,
    });
  }),
);
