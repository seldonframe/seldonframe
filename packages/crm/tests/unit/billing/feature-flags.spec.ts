import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { FEATURE_FLAGS, FEATURE_TIERS, type FeatureFlag } from "../../../src/lib/billing/feature-flags";

describe("FEATURE_FLAGS enum", () => {
  test("exports exactly the 6 flags from the Cut B spec", () => {
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
  test("Growth+ unlocks branding_hidden, custom_domain, client_portal", () => {
    assert.equal(FEATURE_TIERS.branding_hidden, "growth");
    assert.equal(FEATURE_TIERS.custom_domain, "growth");
    assert.equal(FEATURE_TIERS.client_portal, "growth");
  });

  test("Scale-only unlocks ai_agents, white_label_portal, priority_support", () => {
    assert.equal(FEATURE_TIERS.ai_agents, "scale");
    assert.equal(FEATURE_TIERS.white_label_portal, "scale");
    assert.equal(FEATURE_TIERS.priority_support, "scale");
  });

  test("every FeatureFlag has a tier entry (exhaustive)", () => {
    for (const flag of FEATURE_FLAGS) {
      const tier: "growth" | "scale" = FEATURE_TIERS[flag as FeatureFlag];
      assert.ok(tier === "growth" || tier === "scale", `${flag} must map to growth or scale`);
    }
  });
});
