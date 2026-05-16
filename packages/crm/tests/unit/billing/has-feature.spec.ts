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
