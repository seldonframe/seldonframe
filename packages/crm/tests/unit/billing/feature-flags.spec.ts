import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { FEATURE_FLAGS, FEATURE_TIERS, tierMeetsMinimum, type FeatureFlag } from "../../../src/lib/billing/feature-flags";

// 2026-06-18 pricing migration — minimum-tier map rewritten for the
// builder / workspace / agency ladder. Builder unlocks own
// domain+branding; Workspace adds the client portal + AI agents;
// Agency adds the white-label portal + priority support.

describe("FEATURE_FLAGS enum", () => {
  test("exports exactly the 6 flags", () => {
    assert.deepEqual(
      [...FEATURE_FLAGS].sort(),
      [
        "ai_agents",
        "branding_hidden",
        "client_portal",
        "custom_domain",
        "priority_support",
        "white_label_portal",
      ]
    );
  });
});

describe("FEATURE_TIERS map", () => {
  test("builder unlocks branding_hidden + custom_domain", () => {
    assert.equal(FEATURE_TIERS.branding_hidden, "builder");
    assert.equal(FEATURE_TIERS.custom_domain, "builder");
  });

  test("workspace unlocks client_portal + ai_agents", () => {
    assert.equal(FEATURE_TIERS.client_portal, "workspace");
    assert.equal(FEATURE_TIERS.ai_agents, "workspace");
  });

  test("agency unlocks white_label_portal + priority_support", () => {
    assert.equal(FEATURE_TIERS.white_label_portal, "agency");
    assert.equal(FEATURE_TIERS.priority_support, "agency");
  });

  test("every FeatureFlag has a tier entry (exhaustive)", () => {
    const valid = new Set(["builder", "workspace", "agency"]);
    for (const flag of FEATURE_FLAGS) {
      const tier = FEATURE_TIERS[flag as FeatureFlag];
      assert.ok(valid.has(tier), `${flag} must map to a known tier`);
    }
  });
});

describe("tierMeetsMinimum", () => {
  test("agency meets workspace and agency", () => {
    assert.equal(tierMeetsMinimum("agency", "workspace"), true);
    assert.equal(tierMeetsMinimum("agency", "agency"), true);
  });

  test("workspace meets workspace + builder but not agency", () => {
    assert.equal(tierMeetsMinimum("workspace", "workspace"), true);
    assert.equal(tierMeetsMinimum("workspace", "builder"), true);
    assert.equal(tierMeetsMinimum("workspace", "agency"), false);
  });

  test("builder meets builder but not workspace", () => {
    assert.equal(tierMeetsMinimum("builder", "builder"), true);
    assert.equal(tierMeetsMinimum("builder", "workspace"), false);
    assert.equal(tierMeetsMinimum("builder", "agency"), false);
  });

  test("inactive / free / unknown meets nothing", () => {
    assert.equal(tierMeetsMinimum("inactive", "builder"), false);
    assert.equal(tierMeetsMinimum("free", "builder"), false);
    assert.equal(tierMeetsMinimum(null, "workspace"), false);
    assert.equal(tierMeetsMinimum(undefined, "workspace"), false);
  });

  // 2026-07-08 post-review fix wave (item #7) — the 5 new pricing-ladder
  // tier ids must NOT silently rank at 0 (unlock nothing). Ranked by
  // actual entitlement level (plans.ts Plan.limits), not by price.
  test("managed ranks the same as builder (no client_portal/white_label)", () => {
    assert.equal(tierMeetsMinimum("managed", "builder"), true);
    assert.equal(tierMeetsMinimum("managed", "workspace"), false);
    assert.equal(tierMeetsMinimum("managed", "agency"), false);
  });

  test("agency_starter/growth/scale all meet workspace + agency minimums", () => {
    for (const tier of ["agency_starter", "agency_growth", "agency_scale"]) {
      assert.equal(tierMeetsMinimum(tier, "builder"), true, `${tier} vs builder`);
      assert.equal(tierMeetsMinimum(tier, "workspace"), true, `${tier} vs workspace`);
      assert.equal(tierMeetsMinimum(tier, "agency"), true, `${tier} vs agency`);
    }
  });
});
