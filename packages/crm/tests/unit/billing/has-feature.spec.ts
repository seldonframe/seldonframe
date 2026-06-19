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
// 2026-06-18 pricing migration — builder / workspace / agency ladder.
// custom_domain unlocks at builder; ai_agents at workspace;
// white_label_portal at agency.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { hasFeature } from "@/lib/billing/features";

function fakeSubscription(tier: string | undefined) {
  return async (_orgId: string | null | undefined) => ({ tier });
}

describe("hasFeature — builder+ flags (custom_domain)", () => {
  test("builder tier passes custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("builder"),
    });
    assert.equal(result, true);
  });

  test("agency tier passes custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("agency"),
    });
    assert.equal(result, true);
  });

  test("inactive (no plan) fails custom_domain", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: fakeSubscription("inactive"),
    });
    assert.equal(result, false);
  });
});

describe("hasFeature — workspace+ flags (ai_agents)", () => {
  test("workspace tier passes ai_agents", async () => {
    const result = await hasFeature("org-1", "ai_agents", {
      getOrgSubscription: fakeSubscription("workspace"),
    });
    assert.equal(result, true);
  });

  test("builder tier FAILS ai_agents (workspace+ only)", async () => {
    const result = await hasFeature("org-1", "ai_agents", {
      getOrgSubscription: fakeSubscription("builder"),
    });
    assert.equal(result, false);
  });
});

describe("hasFeature — agency-only flags", () => {
  test("agency tier passes white_label_portal", async () => {
    const result = await hasFeature("org-1", "white_label_portal", {
      getOrgSubscription: fakeSubscription("agency"),
    });
    assert.equal(result, true);
  });

  test("workspace tier FAILS white_label_portal (agency-only)", async () => {
    const result = await hasFeature("org-1", "white_label_portal", {
      getOrgSubscription: fakeSubscription("workspace"),
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
        return { tier: "agency" };
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
        return { tier: "agency" };
      },
    });
    assert.equal(result, false);
    assert.equal(called, false);
  });

  test("subscription with no tier defaults to inactive behavior", async () => {
    const result = await hasFeature("org-1", "custom_domain", {
      getOrgSubscription: async () => ({}),
    });
    assert.equal(result, false);
  });

  test("legacy 'scale' tier grandfathers and passes white_label_portal", async () => {
    const result = await hasFeature("org-1", "white_label_portal", {
      getOrgSubscription: fakeSubscription("scale"),
    });
    assert.equal(result, true);
  });
});
