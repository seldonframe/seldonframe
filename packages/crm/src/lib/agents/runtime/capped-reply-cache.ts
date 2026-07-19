// Bounded TTL promise cache for the runtime's capped-holding-reply
// memoization (2026-07-08 opus-review follow-up, item 1).
//
// The previous module-level `Map<string, Promise<string>>` in runtime.ts was
// unbounded and never cleared — harmless staleness, but the map grew forever
// in a long-lived process. This keeps the original goal (a burst of capped
// turns for the same org shares ONE cap lookup + notify check) while bounding
// both staleness (TTL) and memory (maxEntries, FIFO eviction).
//
// Plain module (no "use server") so the sync factory is exportable and
// unit-testable; runtime.ts imports it.

type CacheEntry<V> = {
  promise: Promise<V>;
  expiresAt: number;
};

export type TtlPromiseCacheOptions = {
  ttlMs: number;
  maxEntries: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
};

export type TtlPromiseCache<V> = {
  /** Return the cached promise for `key` if present and fresh; otherwise run
   *  `create`, cache its promise, and return it. A promise that REJECTS is
   *  dropped from the cache so a transient failure is never pinned for the
   *  whole TTL. */
  getOrCreate(key: string, create: () => Promise<V>): Promise<V>;
  size(): number;
};

export function createTtlPromiseCache<V>(options: TtlPromiseCacheOptions): TtlPromiseCache<V> {
  const { ttlMs, maxEntries } = options;
  const now = options.now ?? Date.now;
  const entries = new Map<string, CacheEntry<V>>();

  return {
    getOrCreate(key: string, create: () => Promise<V>): Promise<V> {
      const existing = entries.get(key);
      if (existing && existing.expiresAt >= now()) {
        return existing.promise;
      }
      if (existing) entries.delete(key);

      // FIFO bound: Map preserves insertion order, so the first key is the
      // oldest entry.
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }

      const promise = create();
      const entry: CacheEntry<V> = { promise, expiresAt: now() + ttlMs };
      entries.set(key, entry);
      promise.catch(() => {
        // Only evict if this entry is still the cached one (a newer entry for
        // the same key must not be clobbered by an old failure settling late).
        if (entries.get(key) === entry) entries.delete(key);
      });
      return promise;
    },
    size(): number {
      return entries.size;
    },
  };
}
