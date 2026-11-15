import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export function rateLimit(options: { bucket: string; limit: number; windowSec: number }): RequestHandler {
  return (req, _res, next) => {
    const key = `${options.bucket}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || entry.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowSec * 1000 });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > options.limit) {
      next(
        new AppError(429, 'Too many requests; please slow down', 'RATE_LIMITED', {
          retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
        }),
      );
      return;
    }
    next();
  };
}
