// wallet webhook decision — the PURE map from a verified Stripe event to a wallet
// top-up CREDIT (spec 1ff09dcb, P2 Task 2).
//
// The top-up Checkout (wallet-topup.ts) stamps metadata.type:"wallet_topup" +
// orgId + amountMicros + stripeMode. When that session completes, this decides
// whether to credit the wallet and by how much. PURE: no Stripe import beyond the
// type, no db, no network, never throws. The marketplace webhook route applies the
// returned credit through the DI'd wallet store.
//
// MONEY-SAFE: only a `checkout.session.completed` whose metadata.type is
// "wallet_topup" AND that carries a positive amountMicros + an orgId + a session
// id yields { credit:true }. Anything else (a different event, an agent purchase,
// a malformed payload) → { credit:false } so the route does nothing. The credit
// is idempotent on the SESSION id (the store dedupes on it), so a Stripe
// re-delivery credits ONCE.

import type Stripe from "stripe";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

export type WalletTopupCreditDecision =
  | { credit: false; reason: string }
  | {
      credit: true;
      orgId: string;
      amountMicros: number;
      /** The Stripe Checkout session id — the idempotency key for the credit. */
      sessionId: string;
      stripeMode: MarketplaceStripeMode;
    };

function noop(reason: string): WalletTopupCreditDecision {
  return { credit: false, reason };
}

/** Parse a positive integer of micros from a metadata string; junk → 0. */
function positiveMicros(v: unknown): number {
  const n = Number(typeof v === "string" ? v.trim() : v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Decide whether a verified Stripe event is a wallet top-up that should credit a
 * wallet. Returns { credit:true, orgId, amountMicros, sessionId, stripeMode } only
 * for a well-formed `checkout.session.completed` carrying the wallet_topup
 * metadata; every other event → { credit:false }. Pure; never throws.
 */
export function decideWalletTopupCredit(event: Stripe.Event): WalletTopupCreditDecision {
  if (event.type !== "checkout.session.completed") {
    return noop(`unhandled_event_type:${event.type}`);
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = (session.metadata ?? {}) as Record<string, string | undefined>;

  if (metadata.type !== "wallet_topup") return noop("not_wallet_topup");

  const orgId = (metadata.orgId ?? "").trim();
  if (!orgId) return noop("missing_org_id");

  const amountMicros = positiveMicros(metadata.amountMicros);
  if (amountMicros <= 0) return noop("non_positive_amount");

  const sessionId = (session.id ?? "").trim();
  if (!sessionId) return noop("missing_session_id");

  const stripeMode: MarketplaceStripeMode = metadata.stripeMode === "live" ? "live" : "test";

  return { credit: true, orgId, amountMicros, sessionId, stripeMode };
}
