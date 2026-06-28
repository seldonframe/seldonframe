// #139 P4 — the buyer's "Manage billing" link for a marketplace agent purchase.
//
// A marketplace subscription is billed on the SELLER's connected account (that's
// where the Checkout + recurring Price live), so the Stripe Billing Portal
// session must be created ON THAT connected account ({ stripeAccount }) for the
// buyer's customer id. This module is the PURE, DI'd core (no Stripe import
// beyond the type, no db): the "use server" action passes the real deps.
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
//     hasn't completed Checkout) or no resolvable seller connected account.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { isBillingEnabled, type BillingEnv } from "./billing-mode";

/** The minimal purchase shape the portal needs. */
export type PortalPurchase = {
  /** The buyer's Stripe customer id on the seller's connected account. */
  stripeCustomerId: string | null;
  /** The seller org — used to resolve the connected account the customer lives on. */
  sellerOrgId: string;
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
  /** Resolve the seller org's Connect account id (the account the buyer's
   *  customer + subscription live on). Real impl wraps the stripe_connections
   *  read (readConnectStatus); returns null when the seller isn't connected. */
  resolveSellerAccountId: (sellerOrgId: string) => Promise<string | null>;
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
 * agent subscription, ON the seller's connected account. Returns { skipped }
 * (and makes NO Stripe call) when the flag is OFF, no Stripe key is configured,
 * the purchase has no customer id, or the seller account can't be resolved.
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

  // 3) INERT without a Stripe key.
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 4) Resolve the connected account the customer lives on (the seller's).
  const stripeAccount = await deps.resolveSellerAccountId(purchase.sellerOrgId);
  if (!stripeAccount) return skip("seller_not_connected");

  // 5) Create the portal session on the connected account. No money moves.
  const portal = await stripe.billingPortal.sessions.create(
    { customer, return_url: deps.returnUrl },
    { stripeAccount },
  );

  return { ok: true, url: portal.url };
}
