// Phase 0 — tier catalog + price-id config.
//
// Pins the new three-tier ladder (Builder $19 / Workspace $49 /
// Agency $297) and the env-backed Stripe price-id constants. A
// regression here would silently change what a customer is offered
// or charged, so every price + limit + gated-feature is asserted.

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
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  AGENCY_WORKSPACE_OVERAGE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("PLANS catalog — three offered tiers", () => {
  test("exposes exactly builder / workspace / agency", () => {
    const ids = PLANS.map((p) => p.id).sort();
    assert.deepEqual(ids, ["agency", "builder", "workspace"]);
  });

  test("no legacy free / growth / scale tier is offered", () => {
    for (const legacy of ["free", "growth", "scale"]) {
      assert.equal(
        PLANS.some((p) => p.id === (legacy as TierId)),
        false,
        `${legacy} must not be an offered tier`,
      );
    }
  });

  test("builder = $19/mo, landing pages only (no CRM/booking/agents/portal)", () => {
    const builder = getPlan("builder")!;
    assert.equal(builder.price, 19);
    assert.equal(builder.type, "paid");
    // Landing-page cap of 10; zero full workspaces.
    assert.equal(builder.limits.maxLandingPages, 10);
    assert.equal(builder.limits.maxOrgs, 0);
    // Own domain + branding.
    assert.equal(builder.limits.customDomain, true);
    assert.equal(builder.limits.removeBranding, true);
    // No CRM/booking/agents/portal.
    assert.equal(builder.limits.crm, false);
    assert.equal(builder.limits.booking, false);
    assert.equal(builder.limits.agents, false);
    assert.equal(builder.limits.clientPortal, false);
    assert.equal(builder.limits.fullWhiteLabel, false);
    // Managed AI generation.
    assert.equal(builder.stripePriceId, BUILDER_PRICE_ID);
  });

  test("workspace = $49/mo, one full workspace with all modules", () => {
    const ws = getPlan("workspace")!;
    assert.equal(ws.price, 49);
    assert.equal(ws.type, "paid");
    assert.equal(ws.limits.maxOrgs, 1);
    assert.equal(ws.limits.crm, true);
    assert.equal(ws.limits.booking, true);
    assert.equal(ws.limits.agents, true);
    assert.equal(ws.limits.customDomain, true);
    assert.equal(ws.limits.clientPortal, true);
    assert.equal(ws.limits.fullWhiteLabel, false);
    assert.equal(ws.stripePriceId, WORKSPACE_PRICE_ID);
  });

  test("agency = $297/mo, white-label, 10 included workspaces, marketplace, priority support", () => {
    const agency = getPlan("agency")!;
    assert.equal(agency.price, 297);
    assert.equal(agency.type, "paid");
    // -1 = unlimited (billed per-seat past the included count).
    assert.equal(agency.limits.maxOrgs, -1);
    assert.equal(agency.limits.includedWorkspaces, 10);
    assert.equal(agency.limits.fullWhiteLabel, true);
    assert.equal(agency.limits.marketplace, true);
    assert.equal(agency.limits.prioritySupport, true);
    assert.equal(agency.limits.clientPortal, true);
    assert.equal(agency.stripePriceId, AGENCY_BASE_PRICE_ID);
    // The $10 quantity overage line is referenced on the agency plan.
    assert.equal(agency.workspaceOveragePriceId, AGENCY_WORKSPACE_OVERAGE_PRICE_ID);
  });

  test("getCloudPlans returns all three paid tiers", () => {
    const ids = getCloudPlans().map((p) => p.id).sort();
    assert.deepEqual(ids, ["agency", "builder", "workspace"]);
  });
});

describe("getPlan legacy remap", () => {
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
});

describe("getPlanByStripePriceId", () => {
  test("resolves the three new base price ids", () => {
    assert.equal(getPlanByStripePriceId(BUILDER_PRICE_ID)?.plan.id, "builder");
    assert.equal(getPlanByStripePriceId(WORKSPACE_PRICE_ID)?.plan.id, "workspace");
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

describe("price-id constants", () => {
  test("the four new tier price-id constants are defined (env-backed, non-empty fallback)", () => {
    // They resolve from env with a hard-coded fallback so checkout keeps
    // working before the env vars are pasted. Just assert they're strings.
    for (const id of [BUILDER_PRICE_ID, WORKSPACE_PRICE_ID, AGENCY_BASE_PRICE_ID]) {
      assert.equal(typeof id, "string");
      assert.ok(id.length > 0, "base tier price ids must have a fallback value");
    }
    // The overage price id is env-only (may be empty until Max creates it).
    assert.equal(typeof AGENCY_WORKSPACE_OVERAGE_PRICE_ID, "string");
  });
});
