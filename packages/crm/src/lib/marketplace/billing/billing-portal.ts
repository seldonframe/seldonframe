// #139 P4 — the buyer's "Manage billing" link for a marketplace agent purchase.
//
// A marketplace subscription is a DIRECT charge ON the seller's connected account
// — the Checkout session, the recurring Price, the customer AND the subscription
// all live on the CONNECTED account (the seller bears Stripe's fee; SF takes the %
// application fee). So the Stripe Billing Portal session is created ON THE
// CONNECTED account ({ stripeAccount: sellerConnectAccountId }) for the buyer's
// customer id on that account. This module is the PURE, DI'd core (no Stripe
// import beyond the type, no db): the "use server" action passes the real deps.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY + SCOPING: the portal only lets the BUYER manage their OWN
// subscription's payment method / cancellation — it moves no money here. It is:
//   • org-scoped: the CALLER must have already loaded the purchase via the
//     org-scoped getPurchase(id, buyerOrgId); we never trust an arbitrary
//     customer id off the wire.
//   • behind the SF_MARKETPLACE_BILLING flag (default OFF → skipped).
//   • INERT without a Stripe key (deps.getStripe() → null → skipped).
//   • a no-op (skipped) when the purchase has no stripeCustomerId yet (the buyer
//     hasn't completed Checkout) OR no seller connect account (can't locate the
//     customer's account).
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { isBillingEnabled, type BillingEnv } from "./billing-mode";

/** The minimal purchase shape the portal needs: the buyer's customer id on the
 *  seller's CONNECTED account + that connected account id (a direct charge). */
export type PortalPurchase = {
  /** The buyer's Stripe customer id on the seller's CONNECTED account. */
  stripeCustomerId: string | null;
  /** The seller's Stripe Connect account id (acct_…) the customer + subscription
   *  live on. Null → no account resolved → skip (can't open the portal). */
  sellerConnectAccountId: string | null;
};

/** The narrow Stripe seam — just billingPortal.sessions.create. Typed against the
 *  real Stripe param/return so the call site can't drift. */
export type BillingPortalSeam = {
  billingPortal: {
    sessions: {
      create(
        params: Stripe.BillingPortal.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Pick<Stripe.BillingPortal.Session, "url">>;
    };
  };
};

export type MarketplacePortalDeps = {
  /** The Stripe client seam, or null when no key is configured (→ skip). */
  getStripe: () => BillingPortalSeam | null;
  /** The environment (the SF_MARKETPLACE_BILLING flag). */
  env: BillingEnv;
  /** Where Stripe returns the buyer after they close the portal. */
  returnUrl: string;
};

export type MarketplacePortalResult =
  | { ok: true; url: string }
  | { ok: false; skipped: true; reason: string };

function skip(reason: string): MarketplacePortalResult {
  return { ok: false, skipped: true, reason };
}

/**
 * Create a Stripe Billing Portal session for the buyer to manage a marketplace
 * agent subscription, ON THE SELLER's CONNECTED account (the buyer's customer +
 * subscription live there — a direct charge). Returns { skipped } (and makes NO
 * Stripe call) when the flag is OFF, no Stripe key is configured, the purchase has
 * no customer id (the buyer hasn't completed Checkout), or no seller connect
 * account is known.
 */
export async function resolveMarketplacePortalSession(
  purchase: PortalPurchase,
  deps: MarketplacePortalDeps,
): Promise<MarketplacePortalResult> {
  // 1) Feature-flag gate (default OFF).
  if (!isBillingEnabled(deps.env)) return skip("billing_disabled");

  // 2) No customer yet (buyer hasn't completed Checkout) → nothing to manage.
  const customer = (purchase.stripeCustomerId ?? "").trim();
  if (!customer) return skip("no_customer");

  // 3) No seller account → can't locate the customer's (connected) account.
  const stripeAccount = (purchase.sellerConnectAccountId ?? "").trim();
  if (!stripeAccount) return skip("no_connect_account");

  // 4) INERT without a Stripe key.
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 5) Create the portal session ON the seller's connected account ({ stripeAccount })
  //    for the buyer's customer on that account. No money moves.
  const portal = await stripe.billingPortal.sessions.create(
    {
      customer,
      return_url: deps.returnUrl,
    },
    { stripeAccount },
  );

  return { ok: true, url: portal.url };
}
