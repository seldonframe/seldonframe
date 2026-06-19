// Unit tests for the pure Stripe Checkout *session params* builder used by
// /api/stripe/checkout. Phase 3 (2026-06-18 pricing migration).
//
// These pin the payment-critical contract the Phase 2 billing webhook
// depends on: the checkout session MUST stamp `metadata.orgId` AND
// `metadata.tier` on BOTH the top-level session `metadata` and
// `subscription_data.metadata` (the webhook resolves the org from
// metadata.orgId and the tier from metadata.tier — see
// app/api/webhooks/stripe-billing/handlers.ts). It also pins the
// per-tier base-price line item (Builder $19 / Workspace $49 /
// Agency $297; agency overage NOT added at checkout).
//
// Extracting the param assembly out of the route handler keeps it
// testable without mocking auth / db / the Stripe SDK (mirrors the
// proposals checkout builder at lib/proposals/checkout.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutSessionParams,
  buildCheckoutLineItemsForTier,
  type BuildCheckoutSessionInput,
  type CheckoutSessionParams,
} from "@/lib/billing/checkout-items";
import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
} from "@/lib/billing/price-ids";

const baseInput: BuildCheckoutSessionInput = {
  tier: "workspace",
  userId: "user_123",
  orgId: "org_abc",
  workspaceId: "ws_xyz",
  customerEmail: "owner@example.com",
  origin: "https://app.seldonframe.com",
  successPath: "/dashboard?success=true",
  cancelPath: "/pricing",
};

/** Build + assert non-null so the (paid-tier) test bodies read cleanly. */
function build(overrides: Partial<BuildCheckoutSessionInput> = {}): CheckoutSessionParams {
  const params = buildCheckoutSessionParams({ ...baseInput, ...overrides });
  assert.ok(params, "expected non-null checkout session params for a paid tier");
  return params;
}

describe("buildCheckoutSessionParams — mode + base line item", () => {
  test("creates a subscription-mode session", () => {
    assert.equal(build().mode, "subscription");
  });

  test("builder → single Builder base price, quantity 1", () => {
    const params = build({ tier: "builder" });
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price, BUILDER_PRICE_ID);
    assert.equal(params.line_items[0].quantity, 1);
  });

  test("workspace → single Workspace base price, quantity 1", () => {
    const params = build({ tier: "workspace" });
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price, WORKSPACE_PRICE_ID);
  });

  test("agency → Agency base price only (overage attached post-activation in Phase 4)", () => {
    const params = build({ tier: "agency" });
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price, AGENCY_BASE_PRICE_ID);
  });

  test("line items match buildCheckoutLineItemsForTier for the tier", () => {
    const params = build({ tier: "agency" });
    assert.deepEqual(params.line_items, buildCheckoutLineItemsForTier("agency"));
  });
});

describe("buildCheckoutSessionParams — metadata.orgId + metadata.tier (webhook contract)", () => {
  test("stamps orgId on the SESSION metadata", () => {
    assert.equal(build().metadata.orgId, "org_abc");
  });

  test("stamps tier on the SESSION metadata", () => {
    assert.equal(build().metadata.tier, "workspace");
  });

  test("stamps orgId on subscription_data.metadata (rides on later subscription events)", () => {
    assert.equal(build().subscription_data.metadata.orgId, "org_abc");
  });

  test("stamps tier on subscription_data.metadata", () => {
    assert.equal(build().subscription_data.metadata.tier, "workspace");
  });

  test("orgId + tier are identical on session metadata and subscription_data.metadata", () => {
    const params = build({ tier: "agency" });
    assert.equal(params.metadata.orgId, params.subscription_data.metadata.orgId);
    assert.equal(params.metadata.tier, params.subscription_data.metadata.tier);
    assert.equal(params.metadata.tier, "agency");
  });

  test("also stamps the base priceId on both metadata blocks (webhook tier fallback)", () => {
    const params = build({ tier: "agency" });
    assert.equal(params.metadata.priceId, AGENCY_BASE_PRICE_ID);
    assert.equal(params.subscription_data.metadata.priceId, AGENCY_BASE_PRICE_ID);
  });

  test("carries userId + workspaceId through both metadata blocks", () => {
    const params = build();
    assert.equal(params.metadata.userId, "user_123");
    assert.equal(params.metadata.workspaceId, "ws_xyz");
    assert.equal(params.subscription_data.metadata.userId, "user_123");
    assert.equal(params.subscription_data.metadata.workspaceId, "ws_xyz");
  });
});

describe("buildCheckoutSessionParams — urls + customer", () => {
  test("joins origin + successPath / cancelPath", () => {
    const params = build();
    assert.equal(params.success_url, "https://app.seldonframe.com/dashboard?success=true");
    assert.equal(params.cancel_url, "https://app.seldonframe.com/pricing");
  });

  test("passes the customer email through", () => {
    assert.equal(build().customer_email, "owner@example.com");
  });

  test("returns null for an inactive tier (no checkout — route should 400/skip)", () => {
    // "inactive" is a valid BillingTier (no active plan); it must NOT
    // produce a checkout session.
    const params = buildCheckoutSessionParams({ ...baseInput, tier: "inactive" });
    assert.equal(params, null);
  });
});
