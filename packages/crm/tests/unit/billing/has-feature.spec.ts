// packages/crm/tests/unit/billing/has-feature.spec.ts
//
// Tests the hasFeature() tier gate from lib/billing/features.ts.
//
// PATTERN NOTE: this codebase prefers dependency-injection over
// node:test mock.method because tsx's CJS interop puts named exports
// behind a `default` namespace, making mock.method unreliable. The
// hasFeature() function accepts an optional deps arg so tests can
// inject a fake getOrgSubscription without touching the DB.
//
// The Growth+ vs Scale-only matrix is the source-of-truth for tier
// gating in the Cut B onboarding pivot. A regression here would let a
// free-tier operator silently access custom-domain or ai_agents UI.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { hasFeature } from "@/lib/billing/features";

function fakeSubscription(tier: string | undefined) {
  return async (_orgId: string | null | undefined) => ({ tier });
}

describe("hasFeature — Growth+ flags", () => {
  test("growth tier passes custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("growth"),
    });
    assert.equal(result, true);
  });

  test("scale tier passes custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("scale"),
    });
    assert.equal(result, true);
  });

  test("free tier fails custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("free"),
    });
    assert.equal(result, false);
  });
});

describe("hasFeature — Scale-only flags", () => {
  test("scale tier passes ai_agents", async () => {
    const result = await hasFeature("org-1", "ai_agents", {
      getOrgSubscription: fakeSubscription("scale"),
    });
    assert.equal(result, true);
  });

  test("growth tier FAILS ai_agents (Scale-only)", async () => {
    const result = await hasFeature("org-1", "ai_agents", {
      getOrgSubscription: fakeSubscription("growth"),
    });
    assert.equal(result, false);
  });

  test("growth tier FAILS white_label_portal (Scale-only)", async () => {
    const result = await hasFeature("org-1", "white_label_portal", {
      getOrgSubscription: fakeSubscription("growth"),
    });
    assert.equal(result, false);
  });
});

describe("hasFeature — defensive cases", () => {
  test("null orgId returns false without reading subscription", async () => {
    let called = false;
    const result = await hasFeature(null, "ai_agents", {
      getOrgSubscription: async () => {
        called = true;
        return { tier: "scale" };
      },
    });
    assert.equal(result, false);
    assert.equal(called, false, "must not query DB when orgId is null");
  });

  test("undefined orgId returns false without reading subscription", async () => {
    let called = false;
    const result = await hasFeature(undefined, "ai_agents", {
      getOrgSubscription: async () => {
        called = true;
        return { tier: "scale" };
      },
    });
    assert.equal(result, false);
    assert.equal(called, false);
  });

  test("subscription with no tier defaults to free behavior", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: async () => ({}),
    });
    assert.equal(result, false);
  });
});
