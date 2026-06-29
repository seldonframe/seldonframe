// Unit tests for lib/marketplace/billing/billing-portal.ts — the #139 P4 buyer
// "Manage billing" link. Fake Stripe, no network. The buyer's customer +
// subscription live on the SELLER's CONNECTED account (the subscriptions are
// direct charges), so the Billing Portal session is created ON THE CONNECTED
// account — WITH { stripeAccount: seller }. Proofs:
//   • creates a portal session for the buyer's customer ON the connected account.
//   • flag OFF (default) → skipped, NO Stripe call.
//   • no Stripe key (inert) → skipped, NO Stripe call.
//   • no customer id (buyer hasn't paid) → skipped, NO Stripe call.
//   • no seller connect account → skipped, NO Stripe call.

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

const PURCHASE: PortalPurchase = { stripeCustomerId: "cus_buyer_1", sellerConnectAccountId: "acct_seller_1" };

function makeDeps(over: Partial<MarketplacePortalDeps> = {}): {
  deps: MarketplacePortalDeps;
  calls: PortalCall[];
} {
  const fake = over.getStripe ? { stripe: null, calls: [] as PortalCall[] } : makeFakeStripe();
  const deps: MarketplacePortalDeps = {
    getStripe: () => fake.stripe,
    env: { SF_MARKETPLACE_BILLING: "true" },
    returnUrl: "https://app.seldonframe.com/marketplace/installed",
    ...over,
  };
  return { deps, calls: fake.calls };
}

// ─── happy path ──────────────────────────────────────────────────────────────

describe("resolveMarketplacePortalSession — happy path", () => {
  test("creates a portal session for the buyer's customer ON the CONNECTED account (stripeAccount=seller)", async () => {
    const { deps, calls } = makeDeps();
    const res = await resolveMarketplacePortalSession(PURCHASE, deps);

    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("unreachable");
    assert.equal(res.url, "https://billing.stripe.test/session_1");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.customer, "cus_buyer_1");
    assert.equal(calls[0].params.return_url, "https://app.seldonframe.com/marketplace/installed");
    // CONNECTED session — the buyer's customer + subscription live on the seller's
    // connected account (a direct charge). So { stripeAccount: seller }.
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
    const res = await resolveMarketplacePortalSession(
      { stripeCustomerId: null, sellerConnectAccountId: "acct_seller_1" },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "no_customer");
    assert.equal(calls.length, 0);
  });

  test("no seller connect account → skipped (can't locate the customer's account)", async () => {
    const { deps, calls } = makeDeps();
    const res = await resolveMarketplacePortalSession(
      { stripeCustomerId: "cus_buyer_1", sellerConnectAccountId: null },
      deps,
    );
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.reason, "no_connect_account");
    assert.equal(calls.length, 0);
  });
});
