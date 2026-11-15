import { createHash } from 'node:crypto';
import type { FilterQuery } from 'mongoose';
import { Book, type BookDocument } from '../models/book';
import { serializeBook } from './bookMapper';
import { cacheGet, cacheSet } from './cache';
import { withAvailability, type BookWithAvailability } from './inventory';

export interface BookSearchParams {
  q?: string;
  subject?: string;
  language?: string;
  publisher?: string;
  yearFrom?: number;
  yearTo?: number;
  page: number;
  pageSize: number;
  sort?: 'relevance' | 'newest' | 'title' | 'rating';
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResult {
  items: BookWithAvailability[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    subjects: FacetBucket[];
    languages: FacetBucket[];
    publishers: FacetBucket[];
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textFilter(q: string): FilterQuery<BookDocument> {
  const rx = new RegExp(escapeRegex(q), 'i');
  return {
    $or: [{ title: rx }, { authors: rx }, { isbn: rx }, { subtitle: rx }, { description: rx }],
  };
}

function buildFilter(params: BookSearchParams): FilterQuery<BookDocument> {
  const filter: FilterQuery<BookDocument> = { status: 'ACTIVE' };
  if (params.subject) filter.subjects = params.subject;
  if (params.language) filter.language = params.language.toLowerCase();
  if (params.publisher) filter.publisher = params.publisher;
  if (params.yearFrom !== undefined || params.yearTo !== undefined) {
    filter.publishedYear = {};
    if (params.yearFrom !== undefined) filter.publishedYear.$gte = params.yearFrom;
    if (params.yearTo !== undefined) filter.publishedYear.$lte = params.yearTo;
  }
  if (params.q) Object.assign(filter, textFilter(params.q));
  return filter;
}

function sortFor(sort: BookSearchParams['sort']): Record<string, 1 | -1> {
  switch (sort) {
    case 'title':
      return { title: 1 };
    case 'rating':
      return { ratingAvg: -1, ratingCount: -1 };
    default:
      return { createdAt: -1 };
  }
}

async function facetCounts(
  field: 'subjects' | 'language' | 'publisher',
  base: FilterQuery<BookDocument>,
  size: number,
): Promise<FacetBucket[]> {
  const rows = await Book.aggregate<{ _id: unknown; count: number }>([
    { $match: base },
    { $match: { [field]: { $nin: [null, ''] } } },
    ...(field === 'subjects' ? [{ $unwind: '$subjects' }] : []),
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: size },
  ]);

  return rows.map((row) => ({ key: String(row._id), count: row.count }));
}

export async function searchBooks(params: BookSearchParams): Promise<SearchResult> {
  const cacheKey = `catalog:search:v1:${createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 24)}`;

  const cached = await cacheGet<SearchResult>(cacheKey);
  if (cached) return cached;

  const filter = buildFilter(params);
  const facetBase: FilterQuery<BookDocument> = { status: 'ACTIVE' };
  if (params.q) Object.assign(facetBase, textFilter(params.q));

  const [docs, total, subjects, languages, publishers] = await Promise.all([
    Book.find(filter)
      .sort(sortFor(params.sort))
      .skip((params.page - 1) * params.pageSize)
      .limit(params.pageSize)
      .lean<BookDocument[]>(),
    Book.countDocuments(filter),
    facetCounts('subjects', facetBase, 15),
    facetCounts('language', facetBase, 10),
    facetCounts('publisher', facetBase, 10),
  ]);

  const result: SearchResult = {
    items: await withAvailability(docs.map(serializeBook)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    facets: { subjects, languages, publishers },
  };

  await cacheSet(cacheKey, result, 30);
  return result;
}
