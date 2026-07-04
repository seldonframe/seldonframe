import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCachedUrlExtraction,
  putCachedUrlExtraction,
} from "@/lib/web-build/extraction-cache-store";

function mockDb(rows: unknown[]) {
  const calls: Record<string, unknown[]> = { insert: [] };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    insert: (..._: unknown[]) => ({
      values: (v: unknown) => {
        calls.insert.push(v);
        return { onConflictDoUpdate: async (_u: unknown) => undefined };
      },
    }),
  };
  return { db: db as never, calls };
}

test("get: fresh row → data", async () => {
  const created = new Date("2026-07-01T00:00:00Z");
  const { db } = mockDb([{ data: { a: 1 }, createdAt: created }]);
  const out = await getCachedUrlExtraction("business_facts", "https://example.com", {
    db, now: () => new Date("2026-07-02T00:00:00Z"),
  });
  assert.deepEqual(out, { a: 1 });
});

test("get: stale row → null", async () => {
  const created = new Date("2026-05-01T00:00:00Z");
  const { db } = mockDb([{ data: { a: 1 }, createdAt: created }]);
  const out = await getCachedUrlExtraction("business_facts", "https://example.com", {
    db, now: () => new Date("2026-07-02T00:00:00Z"),
  });
  assert.equal(out, null);
});

test("invalid URL → no-op, no db touch", async () => {
  let touched = false;
  const db = { select: () => { touched = true; throw new Error("no"); } } as never;
  assert.equal(await getCachedUrlExtraction("k", "%%", { db }), null);
  await putCachedUrlExtraction("k", "%%", { x: 1 }, { db });
  assert.equal(touched, false);
});

test("put: upserts", async () => {
  const { db, calls } = mockDb([]);
  await putCachedUrlExtraction("analyze_url", "https://example.com", { b: 2 }, { db });
  assert.equal(calls.insert.length, 1);
});
