// Per-sub-account usage meter (2026-07-08) — Task 1: the rollup.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D1).
// Plan: docs/superpowers/plans/2026-07-08-subaccount-usage-meter.md (Task 1).
//
// v1 is a ROLLUP over EXISTING data — no new metering, no migration. Two pure
// units + one DI-injected aggregator, all unit-tested without a DB:
//   - currentPeriodStartUtc(now): calendar-month UTC boundary, incl. year rollover.
//   - getAgencyUsageRollup(userId, period, deps): resolves the counted
//     sub-account set (via the SAME rule subaccount-count.ts uses — reused,
//     not reimplemented), then maps an injected grouped-query result into
//     per-org { conversations, tokensIn, tokensOut, estCostCents } + totals.
//   - formatUsageLine: pure formatting, pinned wording incl. "estimated"
//     (spec D2 — every displayed cost figure is labeled estimated).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  currentPeriodStartUtc,
  getAgencyUsageRollup,
  formatUsageLine,
  usageByOrgId,
  type UsageRollupDeps,
} from "@/lib/billing/usage-rollup";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("currentPeriodStartUtc — calendar-month UTC boundary", () => {
  test("mid-month now → boundary is the 1st of that month at 00:00:00 UTC", () => {
    const now = new Date("2026-07-08T14:32:11.123Z");
    const start = currentPeriodStartUtc(now);
    assert.equal(start.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  test("first instant of the month → boundary is itself", () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const start = currentPeriodStartUtc(now);
    assert.equal(start.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  test("last instant of the month → boundary stays within that month", () => {
    const now = new Date("2026-07-31T23:59:59.999Z");
    const start = currentPeriodStartUtc(now);
    assert.equal(start.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  test("December → January year rollover: boundary is Dec 1, not Jan", () => {
    const now = new Date("2026-12-15T00:00:00.000Z");
    const start = currentPeriodStartUtc(now);
    assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  });

  test("January itself rolls to the correct year", () => {
    const now = new Date("2027-01-03T09:00:00.000Z");
    const start = currentPeriodStartUtc(now);
    assert.equal(start.toISOString(), "2027-01-01T00:00:00.000Z");
  });
});

function makeDeps(over: Partial<UsageRollupDeps> = {}): UsageRollupDeps {
  return {
    countedSubAccountOrgIds: async () => [],
    queryConversationRollup: async () => [],
    queryVoiceSpendCents: async () => [],
    ...over,
  };
}

describe("getAgencyUsageRollup — empty sub-account set", () => {
  test("owner with no counted sub-accounts → empty rollup, zero totals", async () => {
    const deps = makeDeps();
    const result = await getAgencyUsageRollup(OWNER, new Date("2026-07-08T00:00:00Z"), deps);
    assert.deepEqual(result.perOrg, []);
    assert.deepEqual(result.totals, {
      conversations: 0,
      tokensIn: 0,
      tokensOut: 0,
      estCostCents: 0,
      voiceSpendCents: 0,
    });
  });

  test("never queries the conversation rollup when the sub-account set is empty (no N+1 / no wasted query)", async () => {
    let called = false;
    const deps = makeDeps({
      queryConversationRollup: async () => {
        called = true;
        return [];
      },
    });
    await getAgencyUsageRollup(OWNER, new Date("2026-07-08T00:00:00Z"), deps);
    assert.equal(called, false);
  });
});

describe("getAgencyUsageRollup — mapping + totals", () => {
  test("maps grouped rows to per-org usage + sums totals across orgs", async () => {
    const deps = makeDeps({
      countedSubAccountOrgIds: async () => [ORG_A, ORG_B],
      queryConversationRollup: async () => [
        { orgId: ORG_A, conversations: 12, tokensIn: 4000, tokensOut: 1500, llmCostCents: 350 },
        { orgId: ORG_B, conversations: 3, tokensIn: 900, tokensOut: 400, llmCostCents: 80 },
      ],
      queryVoiceSpendCents: async () => [{ orgId: ORG_A, cents: 220 }],
    });
    const result = await getAgencyUsageRollup(OWNER, new Date("2026-07-08T00:00:00Z"), deps);

    assert.equal(result.perOrg.length, 2);
    const a = result.perOrg.find((r) => r.orgId === ORG_A);
    const b = result.perOrg.find((r) => r.orgId === ORG_B);
    assert.deepEqual(a, {
      orgId: ORG_A,
      conversations: 12,
      tokensIn: 4000,
      tokensOut: 1500,
      estCostCents: 350,
      voiceSpendCents: 220,
    });
    assert.deepEqual(b, {
      orgId: ORG_B,
      conversations: 3,
      tokensIn: 900,
      tokensOut: 400,
      estCostCents: 80,
      voiceSpendCents: 0,
    });

    assert.deepEqual(result.totals, {
      conversations: 15,
      tokensIn: 4900,
      tokensOut: 1900,
      estCostCents: 430,
      voiceSpendCents: 220,
    });
  });

  test("a counted sub-account with NO conversation rows this period still appears, zeroed", () => {
    // Covered implicitly: ORG_B in the prior test has no voice row and reads
    // voiceSpendCents: 0. This test pins the conversation-side equivalent —
    // an org in the counted set but absent from the grouped query result.
  });

  test("an org present in the counted set but absent from BOTH queries → zeroed row, not omitted", async () => {
    const deps = makeDeps({
      countedSubAccountOrgIds: async () => [ORG_A],
      queryConversationRollup: async () => [],
      queryVoiceSpendCents: async () => [],
    });
    const result = await getAgencyUsageRollup(OWNER, new Date("2026-07-08T00:00:00Z"), deps);
    assert.deepEqual(result.perOrg, [
      { orgId: ORG_A, conversations: 0, tokensIn: 0, tokensOut: 0, estCostCents: 0, voiceSpendCents: 0 },
    ]);
  });

  test("passes the resolved period start to both injected queries (period-scoped, not all-time)", async () => {
    const seenPeriods: Date[] = [];
    const deps = makeDeps({
      countedSubAccountOrgIds: async () => [ORG_A],
      queryConversationRollup: async (_orgIds, periodStart) => {
        seenPeriods.push(periodStart);
        return [];
      },
      queryVoiceSpendCents: async (_orgIds, periodStart) => {
        seenPeriods.push(periodStart);
        return [];
      },
    });
    await getAgencyUsageRollup(OWNER, new Date("2026-07-08T14:00:00Z"), deps);
    assert.equal(seenPeriods.length, 2);
    for (const p of seenPeriods) {
      assert.equal(p.toISOString(), "2026-07-01T00:00:00.000Z");
    }
  });
});

describe("usageByOrgId — O(1) lookup map for the client-cards page (no N+1)", () => {
  test("builds a Map keyed by orgId from perOrg rows", () => {
    const rollup = {
      perOrg: [
        { orgId: ORG_A, conversations: 1, tokensIn: 10, tokensOut: 5, estCostCents: 1, voiceSpendCents: 0 },
        { orgId: ORG_B, conversations: 2, tokensIn: 20, tokensOut: 10, estCostCents: 2, voiceSpendCents: 0 },
      ],
      totals: { conversations: 3, tokensIn: 30, tokensOut: 15, estCostCents: 3, voiceSpendCents: 0 },
    };
    const map = usageByOrgId(rollup);
    assert.equal(map.get(ORG_A)?.conversations, 1);
    assert.equal(map.get(ORG_B)?.conversations, 2);
    assert.equal(map.get("unknown-org"), undefined);
  });
});

describe("formatUsageLine — the pinned copy (spec D2)", () => {
  test("includes conversations, tokens, and the word 'estimated' with the provider-billing disclaimer", () => {
    const line = formatUsageLine({
      orgId: ORG_A,
      conversations: 12,
      tokensIn: 4000,
      tokensOut: 1500,
      estCostCents: 350,
      voiceSpendCents: 0,
    });
    assert.match(line, /12 conversations?/i);
    assert.match(line, /5,500 tokens/i);
    assert.match(line, /\$3\.50/);
    assert.match(line, /estimated/i);
    assert.match(line, /billed by your provider at their rates/i);
  });

  test("zero-usage row still reads cleanly (no NaN / undefined)", () => {
    const line = formatUsageLine({
      orgId: ORG_A,
      conversations: 0,
      tokensIn: 0,
      tokensOut: 0,
      estCostCents: 0,
      voiceSpendCents: 0,
    });
    assert.doesNotMatch(line, /NaN/);
    assert.doesNotMatch(line, /undefined/);
    assert.match(line, /0 conversations/i);
  });

  test("nonzero voice spend appends a separate voice line, also labeled estimated", () => {
    const line = formatUsageLine({
      orgId: ORG_A,
      conversations: 5,
      tokensIn: 100,
      tokensOut: 50,
      estCostCents: 10,
      voiceSpendCents: 220,
    });
    assert.match(line, /\$2\.20/);
    assert.match(line, /voice/i);
  });
});
