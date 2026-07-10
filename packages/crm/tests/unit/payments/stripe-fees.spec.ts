// packages/crm/tests/unit/payments/stripe-fees.spec.ts
//
// 2026-07-10 — GMV tier-scoped fee, extended to lib/payments/providers/stripe.ts
// (the CRM's standalone "Payments" provider — invoice + subscription creation
// on an org's Stripe Connect account, independent of the Proposal Builder).
// Tests resolveSellerFeePercent's PARAM-BUILDING behavior only — no live
// Stripe or DB call (deps.getOrgSubscription is injected, matching the
// hasFeature() pattern in tests/unit/billing/has-feature.spec.ts).
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveSellerFeePercent } from "@/lib/payments/providers/stripe";
import { GMV_FEE_PERCENT } from "@/lib/billing/gmv";

function fakeSubscription(tier: string | undefined | null) {
  return async (_orgId: string | null | undefined) => ({ tier: tier ?? undefined });
}

describe("resolveSellerFeePercent — agency tiers pay 0%", () => {
  test("agency_starter -> 0", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("agency_starter"),
    });
    assert.equal(percent, 0);
  });

  test("agency_growth -> 0", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("agency_growth"),
    });
    assert.equal(percent, 0);
  });

  test("agency_scale -> 0", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("agency_scale"),
    });
    assert.equal(percent, 0);
  });

  test("legacy grandfathered agency -> 0", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("agency"),
    });
    assert.equal(percent, 0);
  });
});

describe("resolveSellerFeePercent — solo tiers pay GMV_FEE_PERCENT (2%)", () => {
  test("builder -> GMV_FEE_PERCENT", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("builder"),
    });
    assert.equal(percent, GMV_FEE_PERCENT);
  });

  test("managed -> GMV_FEE_PERCENT", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("managed"),
    });
    assert.equal(percent, GMV_FEE_PERCENT);
  });

  test("legacy grandfathered workspace -> GMV_FEE_PERCENT", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription("workspace"),
    });
    assert.equal(percent, GMV_FEE_PERCENT);
  });

  test("no subscription (undefined tier) -> GMV_FEE_PERCENT (pre-solo, SF is still the channel)", async () => {
    const percent = await resolveSellerFeePercent("org-1", {
      getOrgSubscription: fakeSubscription(undefined),
    });
    assert.equal(percent, GMV_FEE_PERCENT);
  });
});
