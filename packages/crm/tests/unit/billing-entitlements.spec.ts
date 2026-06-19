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

describe("entitlements — marketplace (blocks submit/sell) is agency-only", () => {
  test("only agency can submit + sell blocks", () => {
    assert.equal(canSubmitBlocks(builder), false);
    assert.equal(canSubmitBlocks(workspace), false);
    assert.equal(canSubmitBlocks(agency), true);

    assert.equal(canSellBlocks(builder), false);
    assert.equal(canSellBlocks(workspace), false);
    assert.equal(canSellBlocks(agency), true);
  });

  test("installing blocks allowed on every paid tier", () => {
    assert.equal(canInstallBlocks(builder), true);
    assert.equal(canInstallBlocks(workspace), true);
    assert.equal(canInstallBlocks(agency), true);
  });
});

describe("entitlements — getMaxOrgs", () => {
  test("builder = 0 full workspaces (landing pages only)", () => {
    assert.equal(getMaxOrgs(builder), 0);
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
