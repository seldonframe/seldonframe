// Unit tests for tier normalization. The TIER_FEATURES dict is the
// terminal feature-flag surface; getOrgFeatures + normalizeTierId
// absorb stored tier strings (including legacy values) into one of
// the three current tiers. A regression here would let a paying
// customer's `cloud_pro` subscription quietly default to free
// entitlements.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TIER_FEATURES,
  getOrgFeatures,
  normalizeTierId,
} from "@/lib/billing/features";

describe("normalizeTierId", () => {
  test("returns 'free' for null/undefined/empty", () => {
    assert.equal(normalizeTierId(null), "free");
    assert.equal(normalizeTierId(undefined), "free");
    assert.equal(normalizeTierId(""), "free");
    assert.equal(normalizeTierId("   "), "free");
  });

  test("passes through current tier ids unchanged (case-insensitive)", () => {
    assert.equal(normalizeTierId("free"), "free");
    assert.equal(normalizeTierId("FREE"), "free");
    assert.equal(normalizeTierId("growth"), "growth");
    assert.equal(normalizeTierId("Growth"), "growth");
    assert.equal(normalizeTierId("scale"), "scale");
    assert.equal(normalizeTierId("SCALE"), "scale");
  });

  test("legacy 'starter' / 'cloud_starter' map to growth", () => {
    assert.equal(normalizeTierId("starter"), "growth");
    assert.equal(normalizeTierId("cloud_starter"), "growth");
    assert.equal(normalizeTierId("cloud-starter"), "growth");
  });

  test("legacy cloud_pro / pro / pro_3 / pro_5 / pro_10 / pro_20 map to scale", () => {
    assert.equal(normalizeTierId("cloud_pro"), "scale");
    assert.equal(normalizeTierId("cloud-pro"), "scale");
    assert.equal(normalizeTierId("pro"), "scale");
    assert.equal(normalizeTierId("self_service"), "scale");
    assert.equal(normalizeTierId("pro_3"), "scale");
    assert.equal(normalizeTierId("pro_5"), "scale");
    assert.equal(normalizeTierId("pro_10"), "scale");
    assert.equal(normalizeTierId("pro_20"), "scale");
    assert.equal(normalizeTierId("pro-3"), "scale");
  });

  test("unknown strings default to free", () => {
    assert.equal(normalizeTierId("enterprise"), "free");
    assert.equal(normalizeTierId("randomtier"), "free");
  });
});

describe("getOrgFeatures", () => {
  test("returns the free features for a free tier", () => {
    const f = getOrgFeatures("free");
    assert.equal(f.maxWorkspaces, 1);
    assert.equal(f.maxContacts, 50);
    assert.equal(f.maxAgentRunsPerMonth, 100);
    assert.equal(f.customDomains, false);
    assert.equal(f.whiteLabel, false);
  });

  test("returns the growth features for a growth tier", () => {
    const f = getOrgFeatures("growth");
    assert.equal(f.maxWorkspaces, 3);
    assert.equal(f.maxContacts, 500);
    assert.equal(f.maxAgentRunsPerMonth, 1000);
    assert.equal(f.customDomains, true);
    assert.equal(f.whiteLabel, false);
    assert.equal(f.clientPortal, true);
  });

  test("returns the scale features for a scale tier", () => {
    const f = getOrgFeatures("scale");
    assert.equal(f.maxWorkspaces, -1); // unlimited sentinel
    assert.equal(f.maxContacts, -1);
    assert.equal(f.maxAgentRunsPerMonth, -1);
    assert.equal(f.customDomains, true);
    assert.equal(f.whiteLabel, true);
    assert.equal(f.clientPortal, true);
  });

  test("legacy 'cloud_pro' resolves to scale features (grandfather)", () => {
    const f = getOrgFeatures("cloud_pro");
    assert.equal(f, TIER_FEATURES.scale);
  });

  test("unknown tier resolves to free", () => {
    assert.equal(getOrgFeatures("unknown"), TIER_FEATURES.free);
  });
});
