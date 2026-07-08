// Per-sub-account usage meter (2026-07-08) — Task 3: caps + notify.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D4, D5).
// Plan: docs/superpowers/plans/2026-07-08-subaccount-usage-meter.md (Task 3).
//
// Cap shape lives in organizations.settings.usageCap (jsonb — NO migration):
//   { monthlyEstCostCentsCap, mode: "notify"|"pause", lastNotifiedPeriod?, holdingReply? }
//
// Three pure/DI units, all unit-tested without a DB:
//   - parseUsageCap(settings): tolerant parse, malformed/absent → null.
//   - evaluateUsageCap({cap, estCostCents, periodKey}): breach + once-per-period
//     notify idempotency via lastNotifiedPeriod.
//   - authorizeUsageCapSetter(...): the agency-owner guard (mirrors the
//     resolveAgencyKeyOrgId lookup — partner_agencies ownerUserId/ownerWorkspaceId).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseUsageCap,
  evaluateUsageCap,
  authorizeUsageCapSetter,
  authorizeUsageCapSetterForOrg,
  checkUsageCapBreaches,
  type UsageCap,
  type CapCandidateOrg,
  type UsageCapSweepDeps,
} from "@/lib/billing/usage-cap";

describe("parseUsageCap — tolerant parse", () => {
  test("absent settings → null", () => {
    assert.equal(parseUsageCap(undefined), null);
    assert.equal(parseUsageCap(null), null);
    assert.equal(parseUsageCap({}), null);
  });

  test("malformed usageCap (not an object) → null", () => {
    assert.equal(parseUsageCap({ usageCap: "nope" }), null);
    assert.equal(parseUsageCap({ usageCap: 42 }), null);
    assert.equal(parseUsageCap({ usageCap: null }), null);
  });

  test("missing monthlyEstCostCentsCap → null (no cap = unset, spec default)", () => {
    assert.equal(parseUsageCap({ usageCap: { mode: "notify" } }), null);
  });

  test("negative or non-numeric cap → null", () => {
    assert.equal(parseUsageCap({ usageCap: { monthlyEstCostCentsCap: -5, mode: "notify" } }), null);
    assert.equal(parseUsageCap({ usageCap: { monthlyEstCostCentsCap: "abc", mode: "notify" } }), null);
  });

  test("invalid mode → null", () => {
    assert.equal(
      parseUsageCap({ usageCap: { monthlyEstCostCentsCap: 1000, mode: "delete_everything" } }),
      null,
    );
  });

  test("valid minimal cap → parsed with defaults (mode defaults to notify)", () => {
    const result = parseUsageCap({ usageCap: { monthlyEstCostCentsCap: 5000 } });
    assert.deepEqual(result, {
      monthlyEstCostCentsCap: 5000,
      mode: "notify",
      lastNotifiedPeriod: null,
      holdingReply: null,
    });
  });

  test("valid full cap → every field parsed through", () => {
    const result = parseUsageCap({
      usageCap: {
        monthlyEstCostCentsCap: 12000,
        mode: "pause",
        lastNotifiedPeriod: "2026-07",
        holdingReply: "We'll follow up shortly.",
      },
    });
    assert.deepEqual(result, {
      monthlyEstCostCentsCap: 12000,
      mode: "pause",
      lastNotifiedPeriod: "2026-07",
      holdingReply: "We'll follow up shortly.",
    });
  });

  test("non-string holdingReply/lastNotifiedPeriod → coerced to null, doesn't throw", () => {
    const result = parseUsageCap({
      usageCap: { monthlyEstCostCentsCap: 1000, lastNotifiedPeriod: 42, holdingReply: {} },
    });
    assert.equal(result?.lastNotifiedPeriod, null);
    assert.equal(result?.holdingReply, null);
  });
});

function cap(over: Partial<UsageCap> = {}): UsageCap {
  return {
    monthlyEstCostCentsCap: 1000,
    mode: "notify",
    lastNotifiedPeriod: null,
    holdingReply: null,
    ...over,
  };
}

describe("evaluateUsageCap — breach + once-per-period notify idempotency", () => {
  test("under cap → not breached, no notify", () => {
    const result = evaluateUsageCap({ cap: cap(), estCostCents: 500, periodKey: "2026-07" });
    assert.deepEqual(result, { breached: false, shouldNotify: false });
  });

  test("exactly at cap → NOT breached (cap is the ceiling, not exceeded until over)", () => {
    const result = evaluateUsageCap({ cap: cap(), estCostCents: 1000, periodKey: "2026-07" });
    assert.equal(result.breached, false);
  });

  test("over cap, never notified this period → breached + shouldNotify", () => {
    const result = evaluateUsageCap({ cap: cap(), estCostCents: 1500, periodKey: "2026-07" });
    assert.deepEqual(result, { breached: true, shouldNotify: true });
  });

  test("over cap, already notified THIS period → breached but shouldNotify false (idempotent)", () => {
    const result = evaluateUsageCap({
      cap: cap({ lastNotifiedPeriod: "2026-07" }),
      estCostCents: 1500,
      periodKey: "2026-07",
    });
    assert.deepEqual(result, { breached: true, shouldNotify: false });
  });

  test("over cap, notified a DIFFERENT (prior) period → breached + shouldNotify true again (new period)", () => {
    const result = evaluateUsageCap({
      cap: cap({ lastNotifiedPeriod: "2026-06" }),
      estCostCents: 1500,
      periodKey: "2026-07",
    });
    assert.deepEqual(result, { breached: true, shouldNotify: true });
  });

  test("null cap (unset) → never breached", () => {
    const result = evaluateUsageCap({ cap: null, estCostCents: 999_999, periodKey: "2026-07" });
    assert.deepEqual(result, { breached: false, shouldNotify: false });
  });
});

describe("authorizeUsageCapSetter — the agency-owner guard", () => {
  const AGENCY_ID = "agency-1";
  const OWNER_USER_ID = "owner-user-1";
  const OWNER_WORKSPACE_ID = "owner-ws-1";
  const OTHER_USER_ID = "other-user-1";

  test("caller IS the agency's ownerUserId → authorized", async () => {
    const result = await authorizeUsageCapSetter({
      callerUserId: OWNER_USER_ID,
      agencyId: AGENCY_ID,
      getPartnerAgencyOwner: async () => ({ ownerUserId: OWNER_USER_ID, ownerWorkspaceId: null }),
    });
    assert.equal(result, true);
  });

  test("caller's session resolves through ownerWorkspaceId → NOT sufficient alone without a matching userId (workspace-owned agencies use admin-token sessions, not user ids)", async () => {
    // ownerWorkspaceId-owned agencies (anonymous-workspace agencies) have no
    // ownerUserId at all; a userId-based caller can never match — this is
    // intentional (those agencies are managed via admin-token session, a
    // separate authz path not exercised by this unit).
    const result = await authorizeUsageCapSetter({
      callerUserId: OTHER_USER_ID,
      agencyId: AGENCY_ID,
      getPartnerAgencyOwner: async () => ({ ownerUserId: null, ownerWorkspaceId: OWNER_WORKSPACE_ID }),
    });
    assert.equal(result, false);
  });

  test("caller is NOT the owner → rejected", async () => {
    const result = await authorizeUsageCapSetter({
      callerUserId: OTHER_USER_ID,
      agencyId: AGENCY_ID,
      getPartnerAgencyOwner: async () => ({ ownerUserId: OWNER_USER_ID, ownerWorkspaceId: null }),
    });
    assert.equal(result, false);
  });

  test("agency not found → rejected", async () => {
    const result = await authorizeUsageCapSetter({
      callerUserId: OWNER_USER_ID,
      agencyId: AGENCY_ID,
      getPartnerAgencyOwner: async () => null,
    });
    assert.equal(result, false);
  });

  test("lookup throws → fail-CLOSED (rejected, never authorized on error)", async () => {
    const result = await authorizeUsageCapSetter({
      callerUserId: OWNER_USER_ID,
      agencyId: AGENCY_ID,
      getPartnerAgencyOwner: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(result, false);
  });
});

describe("authorizeUsageCapSetterForOrg — the org-scoped Studio-action guard", () => {
  const CALLER_ORG = "builder-org-1";
  const TARGET_ORG = "client-org-1";
  const AGENCY_ID = "agency-1";
  const OTHER_AGENCY_ID = "agency-2";

  test("caller's own agency matches the target org's parentAgencyId → authorized", async () => {
    const result = await authorizeUsageCapSetterForOrg({
      callerOrgId: CALLER_ORG,
      targetOrgId: TARGET_ORG,
      deps: {
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
      },
    });
    assert.equal(result, true);
  });

  test("target belongs to a DIFFERENT agency → rejected", async () => {
    const result = await authorizeUsageCapSetterForOrg({
      callerOrgId: CALLER_ORG,
      targetOrgId: TARGET_ORG,
      deps: {
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => OTHER_AGENCY_ID,
      },
    });
    assert.equal(result, false);
  });

  test("caller owns no agency → rejected", async () => {
    const result = await authorizeUsageCapSetterForOrg({
      callerOrgId: CALLER_ORG,
      targetOrgId: TARGET_ORG,
      deps: {
        resolveBuilderAgency: async () => null,
        getOrgParentAgencyId: async () => AGENCY_ID,
      },
    });
    assert.equal(result, false);
  });

  test("target org has no parentAgencyId (never attached) → rejected", async () => {
    const result = await authorizeUsageCapSetterForOrg({
      callerOrgId: CALLER_ORG,
      targetOrgId: TARGET_ORG,
      deps: {
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => null,
      },
    });
    assert.equal(result, false);
  });

  test("either lookup throws → fail-CLOSED", async () => {
    const result = await authorizeUsageCapSetterForOrg({
      callerOrgId: CALLER_ORG,
      targetOrgId: TARGET_ORG,
      deps: {
        resolveBuilderAgency: async () => {
          throw new Error("db down");
        },
        getOrgParentAgencyId: async () => AGENCY_ID,
      },
    });
    assert.equal(result, false);
  });
});

describe("checkUsageCapBreaches — the daily cron sweep", () => {
  const NOW = new Date("2026-07-08T04:30:00Z");
  const ORG_1 = "org-1";
  const AGENCY_1 = "agency-1";

  function candidate(over: Partial<CapCandidateOrg> = {}): CapCandidateOrg {
    return {
      orgId: ORG_1,
      orgName: "Acme Plumbing",
      orgSlug: "acme-plumbing",
      parentAgencyId: AGENCY_1,
      settings: { usageCap: { monthlyEstCostCentsCap: 1000, mode: "notify" } },
      ...over,
    };
  }

  function makeSweepDeps(over: Partial<UsageCapSweepDeps> = {}): UsageCapSweepDeps {
    return {
      listOrgsWithCapSet: async () => [],
      getEstCostCentsForOrg: async () => 0,
      resolveAgencyOwnerEmail: async () => "owner@example.com",
      resolveAgencyName: async () => "Acme Agency",
      sendAlert: async () => {},
      markNotified: async () => {},
      now: () => NOW,
      ...over,
    };
  }

  test("no candidates → zeroed result, no calls", async () => {
    const result = await checkUsageCapBreaches(makeSweepDeps());
    assert.deepEqual(result, { scanned: 0, breached: 0, notified: 0, skipped: [] });
  });

  test("under cap → not breached, not notified", async () => {
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate()],
        getEstCostCentsForOrg: async () => 500,
      }),
    );
    assert.equal(result.scanned, 1);
    assert.equal(result.breached, 0);
    assert.equal(result.notified, 0);
  });

  test("breached + never notified → sends the alert and marks lastNotifiedPeriod", async () => {
    let alertParams: unknown = null;
    let markedSettings: Record<string, unknown> | null = null;
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate()],
        getEstCostCentsForOrg: async () => 1500,
        sendAlert: async (p) => {
          alertParams = p;
        },
        markNotified: async (_orgId, settings) => {
          markedSettings = settings;
        },
      }),
    );
    assert.equal(result.breached, 1);
    assert.equal(result.notified, 1);
    assert.ok(alertParams);
    assert.equal((alertParams as { clientName: string }).clientName, "Acme Plumbing");
    assert.equal((alertParams as { toEmail: string }).toEmail, "owner@example.com");
    assert.ok(markedSettings);
    const usageCap = (markedSettings as { usageCap: { lastNotifiedPeriod: string } }).usageCap;
    assert.equal(usageCap.lastNotifiedPeriod, "2026-07");
  });

  test("breached + already notified THIS period → does NOT re-send (idempotent)", async () => {
    let sendCalled = false;
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [
          candidate({
            settings: {
              usageCap: { monthlyEstCostCentsCap: 1000, mode: "notify", lastNotifiedPeriod: "2026-07" },
            },
          }),
        ],
        getEstCostCentsForOrg: async () => 1500,
        sendAlert: async () => {
          sendCalled = true;
        },
      }),
    );
    assert.equal(result.breached, 1);
    assert.equal(result.notified, 0);
    assert.equal(sendCalled, false);
  });

  test("dryRun → computes breach/notify counts but never calls sendAlert or markNotified", async () => {
    let sendCalled = false;
    let markCalled = false;
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate()],
        getEstCostCentsForOrg: async () => 1500,
        sendAlert: async () => {
          sendCalled = true;
        },
        markNotified: async () => {
          markCalled = true;
        },
      }),
      { dryRun: true },
    );
    assert.equal(result.breached, 1);
    assert.equal(result.notified, 1);
    assert.equal(sendCalled, false);
    assert.equal(markCalled, false);
  });

  test("no owner email resolvable → skipped, not counted as notified", async () => {
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate()],
        getEstCostCentsForOrg: async () => 1500,
        resolveAgencyOwnerEmail: async () => null,
      }),
    );
    assert.equal(result.breached, 1);
    assert.equal(result.notified, 0);
    assert.deepEqual(result.skipped, [{ orgId: ORG_1, reason: "no_owner_email" }]);
  });

  test("a malformed cap on one candidate is skipped WITHOUT aborting the sweep for the rest", async () => {
    let secondNotified = false;
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [
          candidate({ orgId: "bad-org", settings: { usageCap: "garbage" } }),
          candidate({ orgId: "good-org" }),
        ],
        getEstCostCentsForOrg: async () => 1500,
        sendAlert: async () => {
          secondNotified = true;
        },
      }),
    );
    assert.equal(result.scanned, 2);
    assert.equal(result.breached, 1);
    assert.equal(result.notified, 1);
    assert.ok(secondNotified);
    assert.deepEqual(result.skipped, [{ orgId: "bad-org", reason: "no_cap_parsed" }]);
  });

  test("a per-org error (e.g. getEstCostCentsForOrg throws) is caught and recorded, sweep continues", async () => {
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate({ orgId: "throws" }), candidate({ orgId: "fine" })],
        getEstCostCentsForOrg: async (orgId) => {
          if (orgId === "throws") throw new Error("db timeout");
          return 1500;
        },
      }),
    );
    assert.equal(result.scanned, 2);
    assert.equal(result.notified, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0]?.orgId, "throws");
    assert.equal(result.skipped[0]?.reason, "db timeout");
  });

  test("candidate with no parentAgencyId → skipped (can't resolve an agency owner to notify)", async () => {
    const result = await checkUsageCapBreaches(
      makeSweepDeps({
        listOrgsWithCapSet: async () => [candidate({ parentAgencyId: null })],
        getEstCostCentsForOrg: async () => 1500,
      }),
    );
    assert.deepEqual(result.skipped, [{ orgId: ORG_1, reason: "no_parent_agency" }]);
    assert.equal(result.notified, 0);
  });
});
