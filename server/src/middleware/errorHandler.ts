import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
      details: null,
    },
  });
};

function isMongoDuplicate(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { message: err.message, code: err.code, details: err.details },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { message: 'A record with these values already exists', code: 'DUPLICATE', details: err.meta ?? null },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { message: 'Record not found', code: 'NOT_FOUND', details: null },
      });
      return;
    }
  }

  if (isMongoDuplicate(err)) {
    res.status(409).json({
      error: { message: 'A record with these values already exists', code: 'DUPLICATE', details: null },
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { message: 'Malformed JSON body', code: 'BAD_REQUEST', details: null },
    });
    return;
  }

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    error: (err as Error)?.message,
    stack: (err as Error)?.stack,
  });

  res.status(500).json({
    error: { message: 'Internal server error', code: 'INTERNAL', details: null },
  });
};
