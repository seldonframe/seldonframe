// Usage-meter follow-up (2026-07-08 opus review, item 1): the runtime's
// capped-holding-reply memoization was a module-level unbounded Map keyed by
// orgId, never cleared — it grew forever in a long-lived process. Replaced by
// this bounded TTL promise cache (plain module — runtime.ts is "use server"
// so the non-async factory can't live there).
//
// Properties under test:
//   - hit within TTL → the create fn runs once, callers share the promise
//   - expired entry → create runs again (staleness bound)
//   - maxEntries → oldest entry evicted, size never exceeds the bound
//   - a REJECTED promise is dropped from the cache (never pins a failure)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createTtlPromiseCache } from "@/lib/agents/runtime/capped-reply-cache";

describe("createTtlPromiseCache — bounded TTL memoization", () => {
  test("second call within TTL reuses the cached promise (create runs once)", async () => {
    let calls = 0;
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => 0 });

    const first = await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return "reply";
    });
    const second = await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return "reply-2";
    });

    assert.equal(first, "reply");
    assert.equal(second, "reply");
    assert.equal(calls, 1);
  });

  test("different keys get independent entries", async () => {
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => 0 });
    const a = await cache.getOrCreate("org-a", async () => "a");
    const b = await cache.getOrCreate("org-b", async () => "b");
    assert.equal(a, "a");
    assert.equal(b, "b");
    assert.equal(cache.size(), 2);
  });

  test("entry past its TTL is recomputed", async () => {
    let clock = 0;
    let calls = 0;
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => clock });

    await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return `v${calls}`;
    });
    clock = 1001; // past expiry
    const second = await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return `v${calls}`;
    });

    assert.equal(second, "v2");
    assert.equal(calls, 2);
    assert.equal(cache.size(), 1);
  });

  test("exactly at TTL boundary the entry is still fresh (expiry is strict)", async () => {
    let clock = 0;
    let calls = 0;
    const cache = createTtlPromiseCache<string>({ ttlMs: 1000, maxEntries: 10, now: () => clock });

    await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return "v";
    });
    clock = 1000;
    await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return "v";
    });
    assert.equal(calls, 1);
  });

  test("size never exceeds maxEntries — oldest entry is evicted", async () => {
    let calls = 0;
    const cache = createTtlPromiseCache<string>({ ttlMs: 100_000, maxEntries: 3, now: () => 0 });

    for (const key of ["k1", "k2", "k3", "k4"]) {
      await cache.getOrCreate(key, async () => {
        calls += 1;
        return key;
      });
    }
    assert.equal(cache.size(), 3);
    assert.equal(calls, 4);

    // k1 (oldest) was evicted → recomputed; k4 is still cached.
    await cache.getOrCreate("k1", async () => {
      calls += 1;
      return "k1-again";
    });
    assert.equal(calls, 5);
    await cache.getOrCreate("k4", async () => {
      calls += 1;
      return "k4-again";
    });
    assert.equal(calls, 5);
  });

  test("a rejected promise is dropped, not cached — next call retries", async () => {
    let calls = 0;
    const cache = createTtlPromiseCache<string>({ ttlMs: 100_000, maxEntries: 10, now: () => 0 });

    await assert.rejects(
      cache.getOrCreate("org-1", async () => {
        calls += 1;
        throw new Error("boom");
      }),
    );
    // Give the internal .catch cleanup a microtask to run.
    await Promise.resolve();

    const value = await cache.getOrCreate("org-1", async () => {
      calls += 1;
      return "recovered";
    });
    assert.equal(value, "recovered");
    assert.equal(calls, 2);
  });
});
