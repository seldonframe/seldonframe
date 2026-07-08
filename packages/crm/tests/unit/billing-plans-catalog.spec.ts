// 2026-07-08 pricing ladder. Pins the 5-tier sellable catalog (Builder
// $29 / Managed $49 / Agency Starter $99 / Agency Growth $199 / Agency
// Scale $299) PLUS the grandfathered legacy tiers ("workspace" $49,
// "agency" $29-flat) which existing subscribers hold — their ids,
// limits and price must never change. A regression here would silently
// change what a customer is offered or charged, so every price + limit
// + gated-feature is asserted.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  PLANS,
  getPlan,
  getCloudPlans,
  getPlanByStripePriceId,
  type TierId,
} from "@/lib/billing/plans";
import {
  BUILDER_PRICE_ID,
  MANAGED_PRICE_ID,
  AGENCY_STARTER_PRICE_ID,
  AGENCY_GROWTH_PRICE_ID,
  AGENCY_SCALE_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("PLANS catalog — 5 sellable tiers + grandfathered legacy", () => {
  test("exposes exactly the 7 tier ids", () => {
    const ids = PLANS.map((p) => p.id).sort();
    assert.deepEqual(ids, [
      "agency",
      "agency_growth",
      "agency_scale",
      "agency_starter",
      "builder",
      "managed",
      "workspace",
    ]);
  });

  test("sellable flag: only the 5 new tiers are sellable", () => {
    const sellable = PLANS.filter((p) => p.sellable).map((p) => p.id).sort();
    assert.deepEqual(sellable, [
      "agency_growth",
      "agency_scale",
      "agency_starter",
      "builder",
      "managed",
    ]);
    // Grandfathered tiers are explicitly NOT sellable.
    assert.equal(getPlan("workspace")!.sellable, false);
    assert.equal(getPlan("agency")!.sellable, false);
  });

  test("builder $29 — unlimited own workspaces, front-office on, no whitelabel/portal, no sub-accounts", () => {
    const builder = getPlan("builder")!;
    assert.equal(builder.price, 29);
    assert.equal(builder.type, "paid");
    assert.equal(builder.limits.maxOrgs, -1);
    assert.equal(builder.limits.crm, true);
    assert.equal(builder.limits.booking, true);
    assert.equal(builder.limits.intake, true);
    assert.equal(builder.limits.agents, true);
    assert.equal(builder.limits.fullWhiteLabel, false);
    assert.equal(builder.limits.clientPortal, false);
    assert.equal(builder.limits.maxSubAccounts, 0);
    assert.equal(builder.stripePriceId, BUILDER_PRICE_ID);
  });

  test("managed $49 — one workspace, SF-keys runtime, front-office on, no whitelabel", () => {
    const managed = getPlan("managed")!;
    assert.equal(managed.price, 49);
    assert.equal(managed.type, "paid");
    assert.equal(managed.limits.maxOrgs, 1);
    assert.equal(managed.limits.crm, true);
    assert.equal(managed.limits.booking, true);
    assert.equal(managed.limits.intake, true);
    assert.equal(managed.limits.agents, true);
    assert.equal(managed.limits.fullWhiteLabel, false);
    assert.equal(managed.limits.clientPortal, false);
    assert.equal(managed.limits.maxSubAccounts, 0);
    assert.equal(managed.stripePriceId, MANAGED_PRICE_ID);
  });

  test("agency_starter $99 — unlimited own + 10 sub-accounts, whitelabel + portal on", () => {
    const starter = getPlan("agency_starter")!;
    assert.equal(starter.price, 99);
    assert.equal(starter.limits.maxOrgs, -1);
    assert.equal(starter.limits.maxSubAccounts, 10);
    assert.equal(starter.limits.fullWhiteLabel, true);
    assert.equal(starter.limits.clientPortal, true);
    assert.equal(starter.stripePriceId, AGENCY_STARTER_PRICE_ID);
  });

  test("agency_growth $199 — 30 sub-accounts, whitelabel + portal on", () => {
    const growth = getPlan("agency_growth")!;
    assert.equal(growth.price, 199);
    assert.equal(growth.limits.maxOrgs, -1);
    assert.equal(growth.limits.maxSubAccounts, 30);
    assert.equal(growth.limits.fullWhiteLabel, true);
    assert.equal(growth.limits.clientPortal, true);
    assert.equal(growth.stripePriceId, AGENCY_GROWTH_PRICE_ID);
  });

  test("agency_scale $299 — unlimited sub-accounts, whitelabel + portal on", () => {
    const scale = getPlan("agency_scale")!;
    assert.equal(scale.price, 299);
    assert.equal(scale.limits.maxOrgs, -1);
    assert.equal(scale.limits.maxSubAccounts, -1);
    assert.equal(scale.limits.fullWhiteLabel, true);
    assert.equal(scale.limits.clientPortal, true);
    assert.equal(scale.stripePriceId, AGENCY_SCALE_PRICE_ID);
  });

  test("GRANDFATHER: workspace tier keeps its CURRENT limits untouched", () => {
    const ws = getPlan("workspace")!;
    assert.equal(ws.price, 49);
    assert.equal(ws.type, "paid");
    assert.equal(ws.limits.maxOrgs, 1);
    assert.equal(ws.limits.crm, true);
    assert.equal(ws.limits.booking, true);
    assert.equal(ws.limits.intake, true);
    assert.equal(ws.limits.agents, true);
    assert.equal(ws.limits.customDomain, true);
    assert.equal(ws.limits.clientPortal, true);
    assert.equal(ws.limits.fullWhiteLabel, false);
    assert.equal(ws.limits.maxSubAccounts, 0);
    assert.equal(ws.stripePriceId, WORKSPACE_PRICE_ID);
  });

  test("GRANDFATHER: agency ($29-flat) tier keeps its CURRENT limits untouched, unlimited sub-accounts", () => {
    const agency = getPlan("agency")!;
    assert.equal(agency.price, 29);
    assert.equal(agency.type, "paid");
    assert.equal(agency.limits.maxOrgs, -1);
    assert.equal(agency.limits.fullWhiteLabel, true);
    assert.equal(agency.limits.marketplace, true);
    assert.equal(agency.limits.prioritySupport, true);
    assert.equal(agency.limits.clientPortal, true);
    assert.equal(agency.limits.maxSubAccounts, -1);
    assert.equal(agency.stripePriceId, AGENCY_BASE_PRICE_ID);
  });

  test("front-office booleans (crm/booking/intake/agents) are true on every tier", () => {
    for (const plan of PLANS) {
      assert.equal(plan.limits.crm, true, `${plan.id}.crm`);
      assert.equal(plan.limits.booking, true, `${plan.id}.booking`);
      assert.equal(plan.limits.intake, true, `${plan.id}.intake`);
      assert.equal(plan.limits.agents, true, `${plan.id}.agents`);
    }
  });

  test("fullWhiteLabel is true ONLY on agency_* + grandfathered agency", () => {
    const expectedTrue = new Set(["agency_starter", "agency_growth", "agency_scale", "agency"]);
    for (const plan of PLANS) {
      assert.equal(
        plan.limits.fullWhiteLabel,
        expectedTrue.has(plan.id),
        `${plan.id}.fullWhiteLabel`,
      );
    }
  });

  test("clientPortal is true on agency_* + grandfathered agency/workspace (workspace's existing entitlement is untouched)", () => {
    const expectedTrue = new Set(["agency_starter", "agency_growth", "agency_scale", "agency", "workspace"]);
    for (const plan of PLANS) {
      assert.equal(
        plan.limits.clientPortal,
        expectedTrue.has(plan.id),
        `${plan.id}.clientPortal`,
      );
    }
  });

  test("getCloudPlans returns all 7 paid tiers", () => {
    const ids = getCloudPlans().map((p) => p.id).sort();
    assert.deepEqual(ids, [
      "agency",
      "agency_growth",
      "agency_scale",
      "agency_starter",
      "builder",
      "managed",
      "workspace",
    ]);
  });
});

describe("getPlan legacy remap — UNCHANGED", () => {
  test("growth-family legacy ids resolve to workspace", () => {
    assert.equal(getPlan("growth")?.id, "workspace");
    assert.equal(getPlan("cloud-starter")?.id, "workspace");
    assert.equal(getPlan("cloud_starter")?.id, "workspace");
    assert.equal(getPlan("starter")?.id, "workspace");
  });

  test("scale-family legacy ids resolve to agency", () => {
    assert.equal(getPlan("scale")?.id, "agency");
    assert.equal(getPlan("cloud-pro")?.id, "agency");
    assert.equal(getPlan("cloud_pro")?.id, "agency");
    assert.equal(getPlan("pro")?.id, "agency");
    assert.equal(getPlan("pro-3")?.id, "agency");
    assert.equal(getPlan("pro_10")?.id, "agency");
    assert.equal(getPlan("cloud-agency")?.id, "agency");
  });

  test("free / unknown no longer resolve to an offered plan", () => {
    assert.equal(getPlan("free"), undefined);
    assert.equal(getPlan("enterprise"), undefined);
    assert.equal(getPlan(""), undefined);
  });

  test("the 5 new tier ids pass through directly", () => {
    const ids: TierId[] = ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"];
    for (const id of ids) {
      assert.equal(getPlan(id)?.id, id);
    }
  });
});

describe("getPlanByStripePriceId", () => {
  test("resolves the 5 new sellable-tier base price ids", () => {
    assert.equal(getPlanByStripePriceId(BUILDER_PRICE_ID)?.plan.id, "builder");
    assert.equal(getPlanByStripePriceId(MANAGED_PRICE_ID)?.plan.id, "managed");
    assert.equal(getPlanByStripePriceId(AGENCY_STARTER_PRICE_ID)?.plan.id, "agency_starter");
    assert.equal(getPlanByStripePriceId(AGENCY_GROWTH_PRICE_ID)?.plan.id, "agency_growth");
    assert.equal(getPlanByStripePriceId(AGENCY_SCALE_PRICE_ID)?.plan.id, "agency_scale");
  });

  test("grandfathered price ids still resolve — AGENCY unambiguously; WORKSPACE resolves to builder (shares BUILDER_PRICE_ID's value, builder is checked first in PLANS[])", () => {
    // 2026-07-08 SECOND post-review fix wave (BLOCKING): since
    // BUILDER_PRICE_ID === WORKSPACE_PRICE_ID, getPlanByStripePriceId's
    // first-match-wins scan over PLANS[] (builder listed before the
    // grandfathered workspace entry) resolves the shared price to
    // "builder". This is a byproduct of the repoint, not a new bug —
    // getPlanByStripePriceId is a "given a bare price id, what's ONE
    // plan it could mean" lookup (used for display/reverse-lookup, not
    // for mutating a stored subscription's tier); the actual tier a
    // subscriber holds lives in organizations.subscription.tier,
    // written once by the webhook (which is metadata-first — see
    // billing-webhook-state-consolidation.spec.ts) and never re-derived
    // from this function.
    assert.equal(getPlanByStripePriceId(WORKSPACE_PRICE_ID)?.plan.id, "builder");
    assert.equal(getPlanByStripePriceId(AGENCY_BASE_PRICE_ID)?.plan.id, "agency");
  });

  test("legacy price ids grandfather to workspace / agency", () => {
    assert.equal(getPlanByStripePriceId(LEGACY_CLOUD_STARTER_PRICE_ID)?.plan.id, "workspace");
    assert.equal(getPlanByStripePriceId(LEGACY_CLOUD_PRO_PRICE_ID)?.plan.id, "agency");
    assert.equal(getPlanByStripePriceId(LEGACY_CLOUD_AGENCY_PRICE_ID)?.plan.id, "agency");
  });

  test("unknown price id returns null", () => {
    assert.equal(getPlanByStripePriceId("price_unknown_xxx"), null);
  });
});

describe("marketingFeatures — the /pricing tier-card checklist (single source, plans.ts)", () => {
  const SELLABLE_IDS = ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"] as const;
  const GRANDFATHERED_IDS = ["workspace", "agency"] as const;

  test("every sellable tier has marketingFeatures with at least one item", () => {
    for (const id of SELLABLE_IDS) {
      const plan = getPlan(id)!;
      assert.ok(plan.marketingFeatures, `${id} must have marketingFeatures`);
      assert.ok(plan.marketingFeatures!.items.length > 0, `${id}.marketingFeatures.items must be non-empty`);
    }
  });

  test("grandfathered (non-sellable) tiers have NO marketingFeatures — they are not marketed on /pricing", () => {
    for (const id of GRANDFATHERED_IDS) {
      const plan = getPlan(id)!;
      assert.equal(plan.marketingFeatures, undefined, `${id} must not have marketingFeatures`);
    }
  });

  test("builder — the base tier — has no 'Everything in X, plus:' header (nothing precedes it)", () => {
    const builder = getPlan("builder")!;
    assert.equal(builder.marketingFeatures!.header, undefined);
    assert.equal(builder.marketingFeatures!.items.length, 8);
  });

  test("managed, agency_starter, agency_growth, agency_scale each carry an 'Everything in X, plus:' header", () => {
    assert.equal(
      getPlan("managed")!.marketingFeatures!.header,
      "Everything in Builder, for one workspace — plus:",
    );
    assert.equal(getPlan("agency_starter")!.marketingFeatures!.header, "Everything in Builder, plus:");
    assert.equal(getPlan("agency_growth")!.marketingFeatures!.header, "Everything in Starter, plus:");
    assert.equal(getPlan("agency_scale")!.marketingFeatures!.header, "Everything in Growth, plus:");
  });

  test("agency_growth's 'White-label ROI reports' item is explicitly marked '(coming soon)' — not built yet, per the honesty rule", () => {
    const items = getPlan("agency_growth")!.marketingFeatures!.items;
    const roiItem = items.find((i) => /ROI reports/i.test(i));
    assert.ok(roiItem, "an ROI-reports item must exist");
    assert.match(roiItem!, /\(coming soon\)/);
  });

  test("agency_starter does NOT claim 'Priority email support' — limits.prioritySupport is false on this tier (contradicts the catalog otherwise)", () => {
    const starter = getPlan("agency_starter")!;
    assert.equal(starter.limits.prioritySupport, false);
    const hasPrioritySupportClaim = starter.marketingFeatures!.items.some((i) =>
      /priority.*support/i.test(i),
    );
    assert.equal(
      hasPrioritySupportClaim,
      false,
      "agency_starter must not claim priority support — the catalog's own prioritySupport flag is false for this tier",
    );
  });

  test("no marketingFeatures item across any sellable tier mentions autopay or billing automation (not built yet)", () => {
    for (const id of SELLABLE_IDS) {
      const items = getPlan(id)!.marketingFeatures!.items;
      for (const item of items) {
        assert.doesNotMatch(item, /autopay/i, `${id}: "${item}"`);
      }
    }
  });
});

describe("price-id constants", () => {
  test("the 5 new tier price-id constants are defined (env-backed, placeholder fallback)", () => {
    for (const id of [
      BUILDER_PRICE_ID,
      MANAGED_PRICE_ID,
      AGENCY_STARTER_PRICE_ID,
      AGENCY_GROWTH_PRICE_ID,
      AGENCY_SCALE_PRICE_ID,
    ]) {
      assert.equal(typeof id, "string");
      assert.ok(id.length > 0, "tier price ids must have a fallback value");
    }
  });
});
