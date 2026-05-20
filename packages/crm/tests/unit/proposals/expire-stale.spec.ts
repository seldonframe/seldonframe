// packages/crm/tests/unit/proposals/expire-stale.spec.ts
// 2026-05-19 — Proposal Builder. Unit tests for the TTL cutoff helper.
// Spec open-question #2 (30-day TTL).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectExpirationCutoff } from "@/lib/proposals/expire-stale";

describe("selectExpirationCutoff", () => {
  it("returns now - 30 days when no override", () => {
    const now = new Date("2026-05-19T00:00:00Z");
    const cutoff = selectExpirationCutoff({ now });
    assert.equal(cutoff.toISOString(), "2026-04-19T00:00:00.000Z");
  });

  it("honors override days", () => {
    const now = new Date("2026-05-19T00:00:00Z");
    const cutoff = selectExpirationCutoff({ now, days: 7 });
    assert.equal(cutoff.toISOString(), "2026-05-12T00:00:00.000Z");
  });
});
