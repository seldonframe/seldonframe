// Unit tests for tier normalization. The TIER_FEATURES dict is the
// terminal feature-flag surface; getOrgFeatures + normalizeTierId
// absorb stored tier strings (including legacy values) into one of
// the current tiers (inactive / builder / workspace / agency). A
// regression here would let a paying customer's `cloud_pro`
// subscription quietly default to no-plan entitlements.
//
// 2026-06-18 pricing migration — Free/$29 Growth/$99 Scale replaced by
// Builder $19 / Workspace $49 / Agency $297. `free` is gone; legacy
// growth→workspace, scale→agency; no-plan = "inactive".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TIER_FEATURES,
  getOrgFeatures,
  normalizeTierId,
} from "@/lib/billing/features";

describe("normalizeTierId", () => {
  test("returns 'inactive' for null/undefined/empty", () => {
    assert.equal(normalizeTierId(null), "inactive");
    assert.equal(normalizeTierId(undefined), "inactive");
    assert.equal(normalizeTierId(""), "inactive");
    assert.equal(normalizeTierId("   "), "inactive");
  });

  test("passes through current tier ids unchanged (case-insensitive)", () => {
    assert.equal(normalizeTierId("builder"), "builder");
    assert.equal(normalizeTierId("Builder"), "builder");
    assert.equal(normalizeTierId("workspace"), "workspace");
    assert.equal(normalizeTierId("WORKSPACE"), "workspace");
    assert.equal(normalizeTierId("agency"), "agency");
    assert.equal(normalizeTierId("Agency"), "agency");
  });

  test("legacy growth-family maps to workspace", () => {
    assert.equal(normalizeTierId("growth"), "workspace");
    assert.equal(normalizeTierId("starter"), "workspace");
    assert.equal(normalizeTierId("cloud_starter"), "workspace");
    assert.equal(normalizeTierId("cloud-starter"), "workspace");
  });

  test("legacy scale-family maps to agency", () => {
    assert.equal(normalizeTierId("scale"), "agency");
    assert.equal(normalizeTierId("cloud_pro"), "agency");
    assert.equal(normalizeTierId("cloud-pro"), "agency");
    assert.equal(normalizeTierId("cloud-agency"), "agency");
    assert.equal(normalizeTierId("pro"), "agency");
    assert.equal(normalizeTierId("self_service"), "agency");
    assert.equal(normalizeTierId("pro_3"), "agency");
    assert.equal(normalizeTierId("pro_5"), "agency");
    assert.equal(normalizeTierId("pro_10"), "agency");
    assert.equal(normalizeTierId("pro_20"), "agency");
    assert.equal(normalizeTierId("pro-3"), "agency");
  });

  test("legacy 'free' and unknown strings default to inactive", () => {
    assert.equal(normalizeTierId("free"), "inactive");
    assert.equal(normalizeTierId("enterprise"), "inactive");
    assert.equal(normalizeTierId("randomtier"), "inactive");
  });
});

describe("getOrgFeatures", () => {
  // 2026-07-08 pricing ladder — "builder" is repurposed to the new $29
  // tier (unlimited own workspaces, full front office, BYOK, no
  // whitelabel/portal). The old $19 landing-pages-only shape never
  // shipped to checkout, so no grandfathering is owed to it.
  test("builder = unlimited workspaces, full front office, no whitelabel/portal", () => {
    const f = getOrgFeatures("builder");
    assert.equal(f.maxWorkspaces, -1);
    assert.equal(f.crm, true);
    assert.equal(f.clientPortal, false);
    assert.equal(f.customDomains, true);
    assert.equal(f.whiteLabel, false);
  });

  test("workspace = one full workspace with all modules", () => {
    const f = getOrgFeatures("workspace");
    assert.equal(f.maxWorkspaces, 1);
    assert.equal(f.crm, true);
    assert.equal(f.customDomains, true);
    assert.equal(f.clientPortal, true);
    assert.equal(f.whiteLabel, false);
  });

  test("agency = unlimited workspaces, white-label, marketplace", () => {
    const f = getOrgFeatures("agency");
    assert.equal(f.maxWorkspaces, -1); // unlimited sentinel
    assert.equal(f.whiteLabel, true);
    assert.equal(f.marketplace, true);
    assert.equal(f.clientPortal, true);
    assert.equal(f.includedWorkspaces, 10);
  });

  test("legacy 'cloud_pro' resolves to agency features (grandfather)", () => {
    const f = getOrgFeatures("cloud_pro");
    assert.equal(f, TIER_FEATURES.agency);
  });

  test("unknown / free tier resolves to inactive", () => {
    assert.equal(getOrgFeatures("unknown"), TIER_FEATURES.inactive);
    assert.equal(getOrgFeatures("free"), TIER_FEATURES.inactive);
  });
});
