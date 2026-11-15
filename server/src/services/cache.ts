interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function cacheDel(...keys: string[]): Promise<void> {
  for (const key of keys) store.delete(key);
}

export async function cacheDelPrefix(prefix: string): Promise<void> {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
