// Phase 1 — entitlement gates for builder / workspace / agency.
//
// entitlements.ts branches off the resolved Plan to decide block
// install/submit/sell, managed AI, white-label, client portal, and
// max orgs. This pins each gate per tier so a catalog change can't
// silently grant or revoke an entitlement.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  canInstallBlocks,
  canSubmitBlocks,
  canSellBlocks,
  canSeldonIt,
  canRemoveBranding,
  canFullWhiteLabel,
  canUseClientPortal,
  getMaxOrgs,
  resolvePlanFromPlanId,
} from "@/lib/billing/entitlements";

const builder = resolvePlanFromPlanId("builder");
const workspace = resolvePlanFromPlanId("workspace");
const agency = resolvePlanFromPlanId("agency");

describe("entitlements — resolvePlanFromPlanId", () => {
  test("resolves the three offered tiers", () => {
    assert.equal(builder?.id, "builder");
    assert.equal(workspace?.id, "workspace");
    assert.equal(agency?.id, "agency");
  });

  test("legacy ids remap (growth→workspace, scale→agency)", () => {
    assert.equal(resolvePlanFromPlanId("growth")?.id, "workspace");
    assert.equal(resolvePlanFromPlanId("scale")?.id, "agency");
  });

  test("free / unknown resolve to null (no plan)", () => {
    assert.equal(resolvePlanFromPlanId("free"), null);
    assert.equal(resolvePlanFromPlanId("nope"), null);
    assert.equal(resolvePlanFromPlanId(null), null);
  });
});

describe("entitlements — managed AI (canSeldonIt) is on for every paid tier", () => {
  test("builder / workspace / agency all get managed AI", () => {
    assert.equal(canSeldonIt(builder), true);
    assert.equal(canSeldonIt(workspace), true);
    assert.equal(canSeldonIt(agency), true);
  });

  test("self-hosted (null plan) still allowed", () => {
    assert.equal(canSeldonIt(null), true);
  });
});

describe("entitlements — client portal", () => {
  test("builder has NO client portal; workspace + agency do", () => {
    assert.equal(canUseClientPortal(builder), false);
    assert.equal(canUseClientPortal(workspace), true);
    assert.equal(canUseClientPortal(agency), true);
  });
});

describe("entitlements — white-label", () => {
  test("full white-label is agency-only", () => {
    assert.equal(canFullWhiteLabel(builder), false);
    assert.equal(canFullWhiteLabel(workspace), false);
    assert.equal(canFullWhiteLabel(agency), true);
  });

  test("remove-branding on for all paid tiers (builder gets own branding)", () => {
    assert.equal(canRemoveBranding(builder), true);
    assert.equal(canRemoveBranding(workspace), true);
    assert.equal(canRemoveBranding(agency), true);
  });
});

// 2026-07-08 pricing-ladder spec (docs/superpowers/specs/2026-07-08-pricing-ladder-design.md)
// CHANGED this policy: marketplace sell/rent is available on EVERY
// sellable tier (5% marketplace fee applies uniformly — see the spec's
// model paragraph and the plan's Task 1 feature booleans). The
// grandfathered "workspace" tier is the one exception — its
// `limits.marketplace` was frozen false at its existing shape (spec
// D1 one-way door: grandfathered tiers keep their CURRENT limits
// untouched), so it still can't submit/sell.
describe("entitlements — marketplace (blocks submit/sell) is available on every SELLABLE tier", () => {
  test("builder + agency can submit + sell blocks; grandfathered workspace cannot", () => {
    assert.equal(canSubmitBlocks(builder), true);
    assert.equal(canSubmitBlocks(workspace), false);
    assert.equal(canSubmitBlocks(agency), true);

    assert.equal(canSellBlocks(builder), true);
    assert.equal(canSellBlocks(workspace), false);
    assert.equal(canSellBlocks(agency), true);
  });

  test("installing blocks allowed on every paid tier", () => {
    assert.equal(canInstallBlocks(builder), true);
    assert.equal(canInstallBlocks(workspace), true);
    assert.equal(canInstallBlocks(agency), true);
  });
});

// 2026-07-08 pricing-ladder spec (docs/superpowers/specs/2026-07-08-pricing-ladder-design.md,
// decision D1): "builder" is repurposed from the dead $19
// landing-pages-only tier (maxOrgs: 0) to the new $29 tier — unlimited
// OWN workspaces, BYOK runtime (plans.ts sets limits.maxOrgs: -1,
// which getMaxOrgs converts to the API's Infinity sentinel, same
// convention as agency / self-hosted below).
describe("entitlements — getMaxOrgs", () => {
  test("builder = unlimited own workspaces (Infinity sentinel)", () => {
    assert.equal(getMaxOrgs(builder), Number.POSITIVE_INFINITY);
  });

  test("workspace = 1 full workspace", () => {
    assert.equal(getMaxOrgs(workspace), 1);
  });

  test("agency = unlimited (Infinity sentinel)", () => {
    assert.equal(getMaxOrgs(agency), Number.POSITIVE_INFINITY);
  });

  test("self-hosted = unlimited", () => {
    assert.equal(getMaxOrgs(null), Number.POSITIVE_INFINITY);
  });
});
