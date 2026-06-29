// #139 P4 — the buyer's "Manage billing" link for a marketplace agent purchase.
//
// A marketplace subscription is a PLATFORM destination charge — the Checkout
// session, the recurring Price, the customer AND the subscription all live on the
// PLATFORM (only the funds settle out to the seller via transfer_data). So the
// Stripe Billing Portal session is created ON THE PLATFORM (no { stripeAccount })
// for the buyer's platform customer id. This module is the PURE, DI'd core (no
// Stripe import beyond the type, no db): the "use server" action passes the real
// deps.
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
//     hasn't completed Checkout).
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { isBillingEnabled, type BillingEnv } from "./billing-mode";

/** The minimal purchase shape the portal needs: just the buyer's PLATFORM
 *  customer id (the customer lives on the platform — a destination charge). */
export type PortalPurchase = {
  /** The buyer's Stripe customer id on the PLATFORM account. */
  stripeCustomerId: string | null;
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
 * agent subscription, ON THE PLATFORM (the buyer's customer + subscription live on
 * the platform — a destination charge). Returns { skipped } (and makes NO Stripe
 * call) when the flag is OFF, no Stripe key is configured, or the purchase has no
 * customer id (the buyer hasn't completed Checkout).
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

  // 4) Create the portal session on the PLATFORM (no { stripeAccount }) for the
  //    buyer's platform customer. No money moves.
  const portal = await stripe.billingPortal.sessions.create({
    customer,
    return_url: deps.returnUrl,
  });

  return { ok: true, url: portal.url };
}
