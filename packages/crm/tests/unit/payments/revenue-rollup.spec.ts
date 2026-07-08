// packages/crm/tests/unit/payments/revenue-rollup.spec.ts
//
// Autopay console Task 5 — the month-to-date revenue strip. Mirrors
// getAgencyUsageRollup's shape (lib/billing/usage-rollup.ts): ONE grouped
// paymentRecords query for the agency's whole book (retainer + proposal
// sourceBlocks, status "completed", this calendar month UTC), computes the
// book total + per-client breakdown + the 2% platform-fee transparency line
// (read-only from GMV_FEE_PERCENT — no new fee logic).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getAgencyRevenueRollup,
  type RevenueRollupDeps,
  type RevenueRollupRow,
} from "@/lib/payments/revenue-rollup";
import { GMV_FEE_PERCENT } from "@/lib/billing/gmv";

function makeDeps(rows: RevenueRollupRow[]): RevenueRollupDeps {
  return {
    queryCompletedRevenueRollup: async () => rows,
  };
}

describe("getAgencyRevenueRollup", () => {
  test("empty book → zeroed totals, empty perClient, no query surprises", async () => {
    const result = await getAgencyRevenueRollup("org-agency-1", new Date(), makeDeps([]));
    assert.deepEqual(result.totals, { collectedCents: 0, feeCents: 0 });
    assert.equal(result.perClient.length, 0);
  });

  test("sums collected across retainer + proposal sourceBlocks, computes the 2% fee transparency line", async () => {
    const rows: RevenueRollupRow[] = [
      { contactId: "contact-1", contactName: "Acme Roofing", cents: 49700 },
      { contactId: "contact-2", contactName: "Beta HVAC", cents: 99700 },
    ];
    const result = await getAgencyRevenueRollup("org-agency-1", new Date(), makeDeps(rows));
    assert.equal(result.totals.collectedCents, 149400);
    // fee is READ from GMV_FEE_PERCENT — no new percentage anywhere.
    assert.equal(result.totals.feeCents, Math.round((149400 * GMV_FEE_PERCENT) / 100));
    assert.equal(result.perClient.length, 2);
  });

  test("per-client rows sorted by collected amount, descending (highest revenue first)", async () => {
    const rows: RevenueRollupRow[] = [
      { contactId: "contact-1", contactName: "Small Co", cents: 10000 },
      { contactId: "contact-2", contactName: "Big Co", cents: 500000 },
    ];
    const result = await getAgencyRevenueRollup("org-agency-1", new Date(), makeDeps(rows));
    assert.equal(result.perClient[0]!.contactName, "Big Co");
    assert.equal(result.perClient[1]!.contactName, "Small Co");
  });

  test("null contactId rows (no email-less contact resolved) are still summed into totals but grouped as 'Unknown'", async () => {
    const rows: RevenueRollupRow[] = [{ contactId: null, contactName: null, cents: 25000 }];
    const result = await getAgencyRevenueRollup("org-agency-1", new Date(), makeDeps(rows));
    assert.equal(result.totals.collectedCents, 25000);
    assert.equal(result.perClient[0]!.contactName, "Unknown");
  });

  test("passes the agency orgId + this calendar month's UTC period start to the query", async () => {
    let captured: { orgId: string; periodStart: Date } | undefined;
    const deps: RevenueRollupDeps = {
      queryCompletedRevenueRollup: async (orgId, periodStart) => {
        captured = { orgId, periodStart };
        return [];
      },
    };
    await getAgencyRevenueRollup("org-agency-1", new Date("2026-07-15T12:00:00Z"), deps);
    assert.equal(captured?.orgId, "org-agency-1");
    assert.equal(captured?.periodStart.toISOString(), "2026-07-01T00:00:00.000Z");
  });
});
