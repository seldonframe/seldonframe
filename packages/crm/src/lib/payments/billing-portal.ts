// packages/crm/src/lib/payments/billing-portal.ts
//
// Autopay console (2026-07-08) — Task 3: "Update card" for a client's
// retainer subscription. Repurposes the marketplace billing-portal pattern
// (lib/marketplace/billing/billing-portal.ts::resolveMarketplacePortalSession)
// verbatim in shape: the retainer subscription is a DIRECT charge on the
// AGENCY's connected account (same as the marketplace seller pattern), so
// the Stripe Billing Portal session is created ON that connected account
// ({ stripeAccount: connectAccountId }) for the client's customer id there.
//
// MONEY-SAFETY: this moves NO money. It is:
//   - inert without a stripeCustomerId (the client hasn't completed Checkout
//     yet — nothing to manage).
//   - inert without a connectAccountId (can't locate the customer's account).
//   - INERT without a Stripe key (deps.getStripe() → null → skipped).

import type Stripe from "stripe";

export type RetainerPortalPurchase = {
  /** The client's Stripe customer id on the agency's CONNECTED account. */
  stripeCustomerId: string | null;
  /** The agency's Stripe Connect account id (acct_…). */
  connectAccountId: string | null;
};

export type RetainerBillingPortalSeam = {
  billingPortal: {
    sessions: {
      create(
        params: Stripe.BillingPortal.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Pick<Stripe.BillingPortal.Session, "url">>;
    };
  };
};

export type RetainerBillingPortalDeps = {
  getStripe: () => RetainerBillingPortalSeam | null;
  returnUrl: string;
};

export type RetainerBillingPortalSkipReason = "no_customer" | "no_connect_account" | "stripe_unconfigured";

export type RetainerBillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: RetainerBillingPortalSkipReason };

function skip(reason: RetainerBillingPortalSkipReason): RetainerBillingPortalResult {
  return { ok: false, reason };
}

/** Create a Stripe Billing Portal session for a client to manage their
 *  retainer's payment method, ON THE AGENCY's connected account. Returns a
 *  skip reason (and makes NO Stripe call) when any precondition is missing. */
export async function resolveRetainerBillingPortalSession(
  purchase: RetainerPortalPurchase,
  deps: RetainerBillingPortalDeps,
): Promise<RetainerBillingPortalResult> {
  const customer = (purchase.stripeCustomerId ?? "").trim();
  if (!customer) return skip("no_customer");

  const stripeAccount = (purchase.connectAccountId ?? "").trim();
  if (!stripeAccount) return skip("no_connect_account");

  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  const session = await stripe.billingPortal.sessions.create(
    { customer, return_url: deps.returnUrl },
    { stripeAccount },
  );

  return { ok: true, url: session.url };
}
