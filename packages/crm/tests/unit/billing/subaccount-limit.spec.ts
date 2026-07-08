// 2026-07-08 pricing ladder — sub-account (client-workspace handoff)
// limit. Counted unit = parent_agency_id attachment (archivedAt IS
// NULL). Mirrors the enforceWorkspaceLimit DI pattern (deps injected
// so the gate is unit-testable without a DB).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  maxSubAccountsForTier,
  enforceSubAccountLimit,
} from "@/lib/billing/limits";
import type { BillingTier } from "@/lib/billing/features";

describe("maxSubAccountsForTier", () => {
  test("per-tier caps", () => {
    const cases: Array<[BillingTier, number]> = [
      ["inactive", 0],
      ["builder", 0],
      ["managed", 0],
      ["agency_starter", 10],
      ["agency_growth", 30],
      ["agency_scale", -1],
      ["workspace", 0],
      ["agency", -1],
    ];
    for (const [tier, expected] of cases) {
      assert.equal(maxSubAccountsForTier(tier), expected, `${tier} -> ${expected}`);
    }
  });
});

describe("enforceSubAccountLimit — pure core", () => {
  test("agency_starter (10): allows under cap", () => {
    const decision = enforceSubAccountLimit({ tier: "agency_starter", currentCount: 9 });
    assert.equal(decision.ok, true);
  });

  test("agency_starter (10): rejects at cap", () => {
    const decision = enforceSubAccountLimit({ tier: "agency_starter", currentCount: 10 });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "subaccount_limit_reached");
      assert.equal(decision.used, 10);
      assert.equal(decision.limit, 10);
    }
  });

  test("agency_growth (30): allows under cap, rejects at cap", () => {
    assert.equal(enforceSubAccountLimit({ tier: "agency_growth", currentCount: 29 }).ok, true);
    assert.equal(enforceSubAccountLimit({ tier: "agency_growth", currentCount: 30 }).ok, false);
  });

  test("agency_scale (-1): always allows, however many", () => {
    for (const count of [0, 10, 30, 500]) {
      assert.equal(
        enforceSubAccountLimit({ tier: "agency_scale", currentCount: count }).ok,
        true,
        `agency_scale must allow ${count}`,
      );
    }
  });

  test("grandfathered agency (-1): always allows, unlimited", () => {
    for (const count of [0, 10, 30, 500]) {
      assert.equal(
        enforceSubAccountLimit({ tier: "agency", currentCount: count }).ok,
        true,
        `grandfathered agency must allow ${count}`,
      );
    }
  });

  test("builder / managed / workspace: 0 cap, rejects any attachment", () => {
    for (const tier of ["builder", "managed", "workspace"] as BillingTier[]) {
      const decision = enforceSubAccountLimit({ tier, currentCount: 0 });
      assert.equal(decision.ok, false, `${tier} must reject at count 0`);
      if (!decision.ok) {
        assert.equal(decision.reason, "subaccount_limit_reached");
        assert.equal(decision.limit, 0);
      }
    }
  });

  test("inactive: 0 cap, rejects", () => {
    const decision = enforceSubAccountLimit({ tier: "inactive", currentCount: 0 });
    assert.equal(decision.ok, false);
  });
});
