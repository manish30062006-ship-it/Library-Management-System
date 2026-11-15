import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { badRequest } from './errors';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncFn): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

export function parseBody<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.issues);
  }
  return result.data;
}

export function parseQuery<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Invalid query parameters', result.error.issues);
  }
  return result.data;
}

export function parseUuid(value: string): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw badRequest('Invalid id format');
  return result.data;
}

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function getPage(
  query: { page?: unknown; pageSize?: unknown },
  defaultSize = 20,
  maxSize = 100,
): Pagination {
  const rawPage = Number(query.page);
  const rawSize = Number(query.pageSize);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(maxSize, Math.floor(rawSize))
    : defaultSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
