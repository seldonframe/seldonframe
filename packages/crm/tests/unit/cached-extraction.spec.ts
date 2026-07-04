import { test } from "node:test";
import assert from "node:assert/strict";
import { withUrlExtractionCache } from "@/lib/web-build/cached-extraction";
import {
  getCachedUrlExtraction,
  putCachedUrlExtraction,
} from "@/lib/web-build/extraction-cache-store";

test("hit: returns cached, run() not called", async () => {
  let ran = 0;
  const out = await withUrlExtractionCache(
    "business_facts", "https://example.com",
    async () => { ran += 1; return { fresh: true }; },
    {
      get: (async () => ({ fresh: false })) as typeof getCachedUrlExtraction,
      put: (async () => {}) as typeof putCachedUrlExtraction,
    }
  );
  assert.deepEqual(out, { value: { fresh: false }, cached: true });
  assert.equal(ran, 0);
});

test("miss: runs once, puts, returns fresh", async () => {
  let ran = 0; let putArgs: unknown[] = [];
  const out = await withUrlExtractionCache(
    "business_facts", "https://example.com",
    async () => { ran += 1; return { fresh: true }; },
    {
      get: (async () => null) as typeof getCachedUrlExtraction,
      put: (async (...a: unknown[]) => { putArgs = a; }) as unknown as typeof putCachedUrlExtraction,
    }
  );
  assert.deepEqual(out, { value: { fresh: true }, cached: false });
  assert.equal(ran, 1);
  assert.equal(putArgs[0], "business_facts");
});

test("put failure is swallowed", async () => {
  const out = await withUrlExtractionCache(
    "k", "https://example.com",
    async () => 42,
    {
      get: (async () => null) as typeof getCachedUrlExtraction,
      put: (async () => { throw new Error("db down"); }) as typeof putCachedUrlExtraction,
    }
  );
  assert.deepEqual(out, { value: 42, cached: false });
});
