// rent-planner — PURE decision for the monthly voice-number rent sweep (spec
// 2026-07-01-voice-deploy-metered-billing, Task 7). No DB, no Twilio, no
// wallet — just "given this month's deployments, who gets charged and who
// gets released".
//
// R1 (controller resolution): there is NO provisionMonthKey field — the
// brief's "skip the provision month" intent is satisfied by ledger
// idempotency instead (debitNumberRent is idempotent on
// `rent:<deploymentId>:<monthKey>`; provisionSfManagedNumber already debited
// that key at provision time, so re-attempting the SAME month at cron time is
// a harmless duplicate-ok). So the planner takes NO provisionMonthKey and
// charges EVERY active sf_managed deployment except those released for 30+
// days of delinquency.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { planMonthlyRent } from "../../../src/lib/telephony/rent-planner";

const NOW = new Date("2026-07-01T06:00:00.000Z");

describe("planMonthlyRent — normal charge", () => {
  test("an active sf_managed deployment with no delinquency marker → charged", () => {
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [
        { deploymentId: "dep-1", orgId: "org-1", delinquentSince: null },
      ],
      now: NOW,
    });
    assert.deepEqual(result.charge, [{ deploymentId: "dep-1", orgId: "org-1" }]);
    assert.deepEqual(result.release, []);
  });

  test("multiple deployments, all healthy → all charged, in input order", () => {
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [
        { deploymentId: "dep-1", orgId: "org-1", delinquentSince: null },
        { deploymentId: "dep-2", orgId: "org-2", delinquentSince: null },
        { deploymentId: "dep-3", orgId: "org-3", delinquentSince: null },
      ],
      now: NOW,
    });
    assert.deepEqual(result.charge, [
      { deploymentId: "dep-1", orgId: "org-1" },
      { deploymentId: "dep-2", orgId: "org-2" },
      { deploymentId: "dep-3", orgId: "org-3" },
    ]);
    assert.deepEqual(result.release, []);
  });
});

describe("planMonthlyRent — delinquency boundary (30 days)", () => {
  test("29 days delinquent → NOT released (still in charge)", () => {
    const delinquentSince = new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [{ deploymentId: "dep-1", orgId: "org-1", delinquentSince }],
      now: NOW,
    });
    assert.deepEqual(result.charge, [{ deploymentId: "dep-1", orgId: "org-1" }]);
    assert.deepEqual(result.release, []);
  });

  test("exactly 30 days delinquent (boundary) → released, NOT in charge", () => {
    const delinquentSince = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [{ deploymentId: "dep-1", orgId: "org-1", delinquentSince }],
      now: NOW,
    });
    assert.deepEqual(result.release, [{ deploymentId: "dep-1", orgId: "org-1" }]);
    assert.deepEqual(result.charge, []);
  });

  test("31+ days delinquent → released, NOT in charge", () => {
    const delinquentSince = new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [{ deploymentId: "dep-1", orgId: "org-1", delinquentSince }],
      now: NOW,
    });
    assert.deepEqual(result.release, [{ deploymentId: "dep-1", orgId: "org-1" }]);
    assert.deepEqual(result.charge, []);
  });

  test("charge and release are mutually exclusive across a mixed batch", () => {
    const healthy = null;
    const recentlyDelinquent = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const longDelinquent = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [
        { deploymentId: "dep-healthy", orgId: "org-1", delinquentSince: healthy },
        { deploymentId: "dep-recent", orgId: "org-2", delinquentSince: recentlyDelinquent },
        { deploymentId: "dep-old", orgId: "org-3", delinquentSince: longDelinquent },
      ],
      now: NOW,
    });
    assert.deepEqual(result.charge, [
      { deploymentId: "dep-healthy", orgId: "org-1" },
      { deploymentId: "dep-recent", orgId: "org-2" },
    ]);
    assert.deepEqual(result.release, [{ deploymentId: "dep-old", orgId: "org-3" }]);
  });
});

describe("planMonthlyRent — null vs ISO delinquentSince handling", () => {
  test("null delinquentSince never lands in release", () => {
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [{ deploymentId: "dep-1", orgId: "org-1", delinquentSince: null }],
      now: NOW,
    });
    assert.deepEqual(result.release, []);
  });

  test("a malformed (non-ISO) delinquentSince string is treated as NOT delinquent (charged, not released) — fail-soft, never crash the sweep on bad data", () => {
    const result = planMonthlyRent({
      monthKey: "2026-07",
      deployments: [{ deploymentId: "dep-1", orgId: "org-1", delinquentSince: "not-a-date" }],
      now: NOW,
    });
    assert.deepEqual(result.charge, [{ deploymentId: "dep-1", orgId: "org-1" }]);
    assert.deepEqual(result.release, []);
  });
});

describe("planMonthlyRent — empty input", () => {
  test("no deployments → empty charge and release, no throw", () => {
    const result = planMonthlyRent({ monthKey: "2026-07", deployments: [], now: NOW });
    assert.deepEqual(result.charge, []);
    assert.deepEqual(result.release, []);
  });
});
