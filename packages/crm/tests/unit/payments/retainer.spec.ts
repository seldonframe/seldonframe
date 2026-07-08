// packages/crm/tests/unit/payments/retainer.spec.ts
//
// Autopay console Task 2 — createClientRetainerCheckout + cancelClientRetainer.
// DI'd (mirrors app/start/actions.ts's live-sell flow): REUSES
// buildCheckoutSessionParams verbatim (subscription mode + GMV_FEE_PERCENT +
// setup-fee line item — zero new fee logic), requires an active
// stripeConnections row before making any Stripe call, and cancel is
// org-scoped + a no-op without an active connection.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  createClientRetainerCheckout,
  cancelClientRetainer,
  type CreateRetainerCheckoutDeps,
  type CancelRetainerDeps,
} from "@/lib/payments/retainer";
import { GMV_FEE_PERCENT } from "@/lib/billing/gmv";

function baseInput() {
  return {
    builderOrgId: "org-agency-1",
    clientOrgId: "org-client-1",
    contact: { email: "owner@example.com", name: "Acme Roofing", firstName: "Jamie", phone: null },
    monthlyPriceCents: 49700,
    setupFeeCents: 0,
  };
}

describe("createClientRetainerCheckout — requires an active connection before any Stripe call", () => {
  test("no active stripeConnections row → {ok:false, reason:'stripe_not_connected'}, Stripe never called", async () => {
    let stripeCalled = false;
    const deps: CreateRetainerCheckoutDeps = {
      getActiveConnection: async () => null,
      createProposalRow: async () => ({ id: "prop-1", signedToken: "tok-1" }),
      createCheckoutSession: async () => {
        stripeCalled = true;
        return { id: "cs_1", url: "https://checkout.stripe.com/cs_1" };
      },
      persistCheckoutSessionId: async () => {},
      baseUrl: "https://app.seldonframe.com",
    };

    const result = await createClientRetainerCheckout(baseInput(), deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stripe_not_connected");
    assert.equal(stripeCalled, false);
  });

  test("active connection → creates a proposal row, builds subscription-mode params, calls Stripe with { stripeAccount }", async () => {
    let capturedParams: Stripe.Checkout.SessionCreateParams | undefined;
    let capturedOptions: Stripe.RequestOptions | undefined;
    const deps: CreateRetainerCheckoutDeps = {
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      createProposalRow: async () => ({ id: "prop-1", signedToken: "tok-1" }),
      createCheckoutSession: async (params, options) => {
        capturedParams = params;
        capturedOptions = options;
        return { id: "cs_1", url: "https://checkout.stripe.com/cs_1" };
      },
      persistCheckoutSessionId: async () => {},
      baseUrl: "https://app.seldonframe.com",
    };

    const result = await createClientRetainerCheckout(baseInput(), deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.checkoutUrl, "https://checkout.stripe.com/cs_1");

    // reuses buildCheckoutSessionParams verbatim — subscription mode + the
    // single GMV_FEE_PERCENT source, zero new fee logic.
    assert.equal(capturedParams?.mode, "subscription");
    assert.equal(capturedParams?.subscription_data?.application_fee_percent, GMV_FEE_PERCENT);
    assert.equal(capturedParams?.line_items?.[0]?.price_data?.unit_amount, 49700);
    assert.equal(capturedParams?.line_items?.[0]?.price_data?.recurring?.interval, "month");
    assert.equal(capturedOptions?.stripeAccount, "acct_agency_1");
  });

  test("setupFeeCents > 0 → the setup-fee line item is present (reused factory behavior)", async () => {
    let capturedParams: Stripe.Checkout.SessionCreateParams | undefined;
    const deps: CreateRetainerCheckoutDeps = {
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      createProposalRow: async () => ({ id: "prop-1", signedToken: "tok-1" }),
      createCheckoutSession: async (params) => {
        capturedParams = params;
        return { id: "cs_1", url: "https://checkout.stripe.com/cs_1" };
      },
      persistCheckoutSessionId: async () => {},
      baseUrl: "https://app.seldonframe.com",
    };

    await createClientRetainerCheckout({ ...baseInput(), setupFeeCents: 50000 }, deps);
    assert.equal(capturedParams?.line_items?.length, 2);
  });

  test("persists the checkout session id on the proposal row after creation", async () => {
    let persisted: { proposalId: string; sessionId: string } | undefined;
    const deps: CreateRetainerCheckoutDeps = {
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      createProposalRow: async () => ({ id: "prop-1", signedToken: "tok-1" }),
      createCheckoutSession: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }),
      persistCheckoutSessionId: async (proposalId, sessionId) => {
        persisted = { proposalId, sessionId };
      },
      baseUrl: "https://app.seldonframe.com",
    };

    await createClientRetainerCheckout(baseInput(), deps);
    assert.deepEqual(persisted, { proposalId: "prop-1", sessionId: "cs_1" });
  });

  test("missing checkout url from Stripe → {ok:false, reason:'checkout_session_missing_url'}", async () => {
    const deps: CreateRetainerCheckoutDeps = {
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      createProposalRow: async () => ({ id: "prop-1", signedToken: "tok-1" }),
      createCheckoutSession: async () => ({ id: "cs_1", url: null }),
      persistCheckoutSessionId: async () => {},
      baseUrl: "https://app.seldonframe.com",
    };
    const result = await createClientRetainerCheckout(baseInput(), deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "checkout_session_missing_url");
  });
});

describe("cancelClientRetainer — org-scoped, inert without an active connection", () => {
  function baseCancelInput() {
    return { builderOrgId: "org-agency-1", clientOrgId: "org-client-1" };
  }

  test("caller org does not own the target client org → {ok:false, reason:'unauthorized'}, Stripe never called", async () => {
    let stripeCalled = false;
    const deps: CancelRetainerDeps = {
      authorize: async () => false,
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      findActiveSubscription: async () => ({ stripeSubscriptionId: "sub_123" }),
      cancelSubscription: async () => {
        stripeCalled = true;
      },
    };
    const result = await cancelClientRetainer(baseCancelInput(), deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unauthorized");
    assert.equal(stripeCalled, false);
  });

  test("no active stripeConnections row → {ok:false, reason:'stripe_not_connected'}, inert", async () => {
    let stripeCalled = false;
    const deps: CancelRetainerDeps = {
      authorize: async () => true,
      getActiveConnection: async () => null,
      findActiveSubscription: async () => ({ stripeSubscriptionId: "sub_123" }),
      cancelSubscription: async () => {
        stripeCalled = true;
      },
    };
    const result = await cancelClientRetainer(baseCancelInput(), deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stripe_not_connected");
    assert.equal(stripeCalled, false);
  });

  test("no active subscription found for the client → {ok:false, reason:'no_active_subscription'}", async () => {
    const deps: CancelRetainerDeps = {
      authorize: async () => true,
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      findActiveSubscription: async () => null,
      cancelSubscription: async () => {},
    };
    const result = await cancelClientRetainer(baseCancelInput(), deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_active_subscription");
  });

  test("authorized + active connection + active subscription → cancels on the connected account", async () => {
    let cancelledWith: { subscriptionId: string; stripeAccountId: string } | undefined;
    const deps: CancelRetainerDeps = {
      authorize: async () => true,
      getActiveConnection: async () => ({ stripeAccountId: "acct_agency_1" }),
      findActiveSubscription: async () => ({ stripeSubscriptionId: "sub_123" }),
      cancelSubscription: async (subscriptionId, stripeAccountId) => {
        cancelledWith = { subscriptionId, stripeAccountId };
      },
    };
    const result = await cancelClientRetainer(baseCancelInput(), deps);
    assert.equal(result.ok, true);
    assert.deepEqual(cancelledWith, { subscriptionId: "sub_123", stripeAccountId: "acct_agency_1" });
  });
});
