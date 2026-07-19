// Per-sub-account usage meter (2026-07-08) — Task 3: setSubAccountUsageCapAction.
//
// Mirrors set-booking-policy.spec.ts's shape: fully DI'd, no DB / no Next.js
// session. Exercises the authz gate (authorizeUsageCapSetterForOrg — the
// caller's own agency must match the target client org's parentAgencyId) and
// the settings-jsonb read-modify-write.
//
// Run:
//   node --import tsx --test tests/unit/deployments/set-usage-cap.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { setSubAccountUsageCapAction } from "../../../src/lib/deployments/actions";

const CALLER_ORG = "builder-org-1";
const CLIENT_ORG = "client-org-1";
const AGENCY_ID = "agency-1";
const OTHER_AGENCY_ID = "agency-2";

describe("setSubAccountUsageCapAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let updateCalled = false;
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 5000 },
      {
        getOrgId: async () => null,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => ({}),
        updateOrgSettings: async () => {
          updateCalled = true;
          return true;
        },
      },
    );
    assert.deepEqual(res, { ok: false, error: "unauthorized" });
    assert.equal(updateCalled, false);
  });

  test("invalid_input on a negative cap", async () => {
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: -100 },
      { getOrgId: async () => CALLER_ORG },
    );
    assert.deepEqual(res, { ok: false, error: "invalid_input" });
  });

  test("invalid_input on a bad mode", async () => {
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 1000, mode: "delete" as never },
      { getOrgId: async () => CALLER_ORG },
    );
    assert.deepEqual(res, { ok: false, error: "invalid_input" });
  });

  test("unauthorized when the caller's agency does NOT match the target org's parentAgencyId", async () => {
    let updateCalled = false;
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 5000 },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => OTHER_AGENCY_ID,
        getOrgSettings: async () => ({}),
        updateOrgSettings: async () => {
          updateCalled = true;
          return true;
        },
      },
    );
    assert.deepEqual(res, { ok: false, error: "unauthorized" });
    assert.equal(updateCalled, false, "must not write when not the owner");
  });

  test("not_found when the target org has no settings row (doesn't exist)", async () => {
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 5000 },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => null,
      },
    );
    assert.deepEqual(res, { ok: false, error: "not_found" });
  });

  test("happy path: authorized caller sets a cap, persisted under settings.usageCap, preserving other settings keys", async () => {
    let settingsSeen: Record<string, unknown> | null = null;
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 5000, mode: "pause", holdingReply: "Be right back" },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => ({ someOtherKey: "preserved" }),
        updateOrgSettings: async (_orgId, settings) => {
          settingsSeen = settings;
          return true;
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    assert.ok(settingsSeen, "updateOrgSettings must be called");
    const settings = settingsSeen as unknown as Record<string, unknown>;
    assert.equal(settings.someOtherKey, "preserved");
    assert.deepEqual(settings.usageCap, {
      monthlyEstCostCentsCap: 5000,
      mode: "pause",
      lastNotifiedPeriod: null,
      holdingReply: "Be right back",
    });
  });

  test("clearing an existing cap preserves lastNotifiedPeriod's absence and drops the usageCap key", async () => {
    let settingsSeen: Record<string, unknown> | null = null;
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: null },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => ({ usageCap: { monthlyEstCostCentsCap: 5000, mode: "notify" } }),
        updateOrgSettings: async (_orgId, settings) => {
          settingsSeen = settings;
          return true;
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    const settings = settingsSeen as unknown as Record<string, unknown>;
    assert.equal("usageCap" in settings, false, "usageCap key dropped, not left as null");
  });

  test("re-setting the cap amount preserves an existing lastNotifiedPeriod (no re-spam within the same period)", async () => {
    let settingsSeen: Record<string, unknown> | null = null;
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 9000 },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => ({
          usageCap: { monthlyEstCostCentsCap: 5000, mode: "notify", lastNotifiedPeriod: "2026-07" },
        }),
        updateOrgSettings: async (_orgId, settings) => {
          settingsSeen = settings;
          return true;
        },
        revalidate: () => {},
      },
    );
    assert.deepEqual(res, { ok: true });
    const settings = settingsSeen as unknown as Record<string, unknown>;
    assert.deepEqual(settings.usageCap, {
      monthlyEstCostCentsCap: 9000,
      mode: "notify",
      lastNotifiedPeriod: "2026-07",
      holdingReply: null,
    });
  });

  test("update_failed when the persistence layer returns false", async () => {
    const res = await setSubAccountUsageCapAction(
      { clientOrgId: CLIENT_ORG, monthlyEstCostCentsCap: 5000 },
      {
        getOrgId: async () => CALLER_ORG,
        resolveBuilderAgency: async () => AGENCY_ID,
        getOrgParentAgencyId: async () => AGENCY_ID,
        getOrgSettings: async () => ({}),
        updateOrgSettings: async () => false,
      },
    );
    assert.deepEqual(res, { ok: false, error: "update_failed" });
  });
});
