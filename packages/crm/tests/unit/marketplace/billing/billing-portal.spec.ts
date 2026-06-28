// Unit tests for lib/marketplace/billing/billing-portal.ts — the #139 P4 buyer
// "Manage billing" link. Fake Stripe, no network. Proofs:
//   • creates a portal session for the buyer's customer ON the seller's
//     connected account ({ stripeAccount }).
//   • flag OFF (default) → skipped, NO Stripe call.
//   • no Stripe key (inert) → skipped, NO Stripe call.
//   • no customer id (buyer hasn't paid) → skipped, NO Stripe call.
//   • seller not connected → skipped, NO Stripe call.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  resolveMarketplacePortalSession,
  type BillingPortalSeam,
  type MarketplacePortalDeps,
  type PortalPurchase,
} from "../../../../src/lib/marketplace/billing/billing-portal";

type PortalCall = {
  params: Stripe.BillingPortal.SessionCreateParams;
  options?: Stripe.RequestOptions;
};

function makeFakeStripe(url = "https://billing.stripe.test/session_1") {
  const calls: PortalCall[] = [];
  const stripe: BillingPortalSeam = {
    billingPortal: {
      sessions: {
        async create(params, options) {
          calls.push({ params, options });
          return { url };
        },
      },
    },
  };
  return { stripe, calls };
}

const PURCHASE: PortalPurchase = { stripeCustomerId: "cus_buyer_1", sellerOrgId: "org-seller-1" };

function makeDeps(over: Partial<MarketplacePortalDeps> = {}): {
  deps: MarketplacePortalDeps;
  calls: PortalCall[];
} {
  const fake = over.getStripe ? { stripe: null, calls: [] as PortalCall[] } : makeFakeStripe();
  const deps: MarketplacePortalDeps = {
    getStripe: () => fake.stripe,
    resolveSellerAccountId: async () => "acct_seller_1",
    env: { SF_MARKETPLACE_BILLING: "true" },
    returnUrl: "https://app.seldonframe.com/marketplace/installed",
    ...over,
  };
  return { deps, calls: fake.calls };
}

// ─── happy path ──────────────────────────────────────────────────────────────

describe("resolveMarketplacePortalSession — happy path", () => {
  test("creates a portal session for the buyer's customer ON the seller's connected account", async () => {
    const { deps, calls } = makeDeps();
    const res = await resolveMarketplacePortalSession(PURCHASE, deps);

    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.url, "https://billing.stripe.test/session_1");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.customer, "cus_buyer_1");
    assert.equal(calls[0].params.return_url, "https://app.seldonframe.com/marketplace/installed");
    // The connected-account header — the customer lives on the seller's account.
    assert.equal(calls[0].options?.stripeAccount, "acct_seller_1");
  });
});

// ─── skips: ZERO Stripe calls ────────────────────────────────────────────────

describe("resolveMarketplacePortalSession — skips (no Stripe call)", () => {
  test("flag OFF (default) → skipped", async () => {
    const { deps, calls } = makeDeps({ env: {} });
    const res = await resolveMarketplacePortalSession(PURCHASE, deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "billing_disabled");
    assert.equal(calls.length, 0);
  });

  test("no Stripe key (inert) → skipped", async () => {
    const { deps, calls } = makeDeps({ getStripe: () => null });
    const res = await resolveMarketplacePortalSession(PURCHASE, deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "stripe_unconfigured");
    assert.equal(calls.length, 0);
  });

  test("no customer id (buyer hasn't completed Checkout) → skipped", async () => {
    const { deps, calls } = makeDeps();
    const res = await resolveMarketplacePortalSession({ ...PURCHASE, stripeCustomerId: null }, deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "no_customer");
    assert.equal(calls.length, 0);
  });

  test("seller not connected → skipped", async () => {
    const { deps, calls } = makeDeps({ resolveSellerAccountId: async () => null });
    const res = await resolveMarketplacePortalSession(PURCHASE, deps);
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "seller_not_connected");
    assert.equal(calls.length, 0);
  });
});
