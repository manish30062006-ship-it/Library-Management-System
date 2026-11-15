import { conflict } from '../lib/errors';

// Single-process lock table; the conditional status update in circulation is
// still the authoritative guard against double checkout.
const held = new Map<string, number>();

export async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const until = held.get(key);
  if (until !== undefined && until > now) {
    throw conflict('This item is busy; please retry');
  }
  held.set(key, now + ttlMs);
  try {
    return await fn();
  } finally {
    held.delete(key);
  }
}

export function lockKeyForCopy(copyId: string): string {
  return `lock:copy:${copyId}`;
}
