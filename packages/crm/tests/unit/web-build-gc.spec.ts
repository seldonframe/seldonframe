import { test } from "node:test";
import assert from "node:assert/strict";
import { webUngatedGcCutoff } from "@/lib/web-build/gc-cutoffs";

test("cutoff is exactly 7 days before now", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(webUngatedGcCutoff(now).toISOString(), "2026-07-03T12:00:00.000Z");
});
