// #139 P4 — apply a marketplace billing webhook, with a DI'd verify + store so
// the route is unit-testable WITHOUT a network or a real Stripe key.
//
// The route (app/api/v1/marketplace/stripe/webhook/route.ts) is a thin shell: it
// reads the RAW body + the `stripe-signature` header, then calls
// `handleMarketplaceWebhookRequest` with the production deps (real
// signature-verify via @seldonframe/payments + the real purchases store). This
// module owns the fail-closed verification gate, the pure-decision dispatch, and
// the single store write — all behind seams the tests fake.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: FAIL-CLOSED. If verify() throws (bad / missing signature) we
// return { status: 400 } and NEVER touch the store. We only ever flip a status
// field — no charge, no Stripe call from here. Idempotent: the underlying store
// patch is on the natural key (checkout id / subscription id), so a Stripe
// re-delivery re-writes the SAME status (a no-op), never a double-effect.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import type { MarketplacePurchaseRow } from "@/db/schema/marketplace-purchases";
import {
  handleMarketplaceStripeEvent,
  type MarketplaceLookupBy,
  type MarketplacePurchasePatch,
} from "./webhook-handler";

/** The minimal store the applier writes through — the reconciliation patchers
 *  (updatePurchaseByCheckoutId / ...BySubscriptionId / ...ByCustomerId). Each
 *  returns the patched row, or null when no row carried that key. The customer-id
 *  patcher backs the ordering-race fallback (an invoice that races ahead of the
 *  checkout.session.completed sub-id stamp can still match by customer). */
export type MarketplaceWebhookStore = {
  updateByCheckoutId: (
    checkoutId: string,
    patch: MarketplacePurchasePatch,
  ) => Promise<MarketplacePurchaseRow | null>;
  updateBySubscriptionId: (
    subscriptionId: string,
    patch: MarketplacePurchasePatch,
  ) => Promise<MarketplacePurchaseRow | null>;
  updateByCustomerId: (
    customerId: string,
    patch: MarketplacePurchasePatch,
  ) => Promise<MarketplacePurchaseRow | null>;
};

/** Verify a raw webhook body → a typed Stripe.Event. The production impl wraps
 *  @seldonframe/payments' verifyStripeWebhookWithSecret (HMAC over the raw body
 *  with the marketplace webhook secret). MUST throw on a bad/missing signature. */
export type MarketplaceWebhookVerify = (input: {
  rawBody: string;
  signature: string;
  secret: string;
}) => Stripe.Event;

/** OPTIONAL post-activation side-effect. Fired ONCE, best-effort, AFTER a
 *  purchase row is matched + patched to `status:active` — the seam the buyer
 *  flow uses to provision a buyer-owned deployment of the bought agent (so the
 *  setup wizard has a target). It moves NO money (the charge already settled);
 *  it is awaited but its errors are SWALLOWED so a provisioning hiccup can never
 *  change the webhook's 200 response or the idempotent status patch. Absent in
 *  tests + on the no-op path. */
export type MarketplaceWebhookOnActivated = (
  row: MarketplacePurchaseRow,
) => Promise<void>;

export type HandleMarketplaceWebhookDeps = {
  verify: MarketplaceWebhookVerify;
  store: MarketplaceWebhookStore;
  /** Best-effort post-activation hook (see MarketplaceWebhookOnActivated). */
  onActivated?: MarketplaceWebhookOnActivated;
};

export type HandleMarketplaceWebhookInput = {
  /** The RAW request body (string) — signature is computed over these bytes. */
  rawBody: string;
  /** The `stripe-signature` header (or null/empty when absent). */
  signature: string | null;
  /** The marketplace webhook secret (whsec_…), or null/empty when unconfigured. */
  secret: string | null;
};

export type HandleMarketplaceWebhookResult = {
  /** HTTP status the route should return. */
  status: number;
  /** A small JSON-able body for the route response + logging. */
  body: Record<string, unknown>;
};

/**
 * Verify + apply a marketplace billing webhook. Fail-closed on signature:
 *   • missing secret OR missing signature  → 400, store NOT touched.
 *   • verify() throws (bad signature)        → 400, store NOT touched.
 *   • verified + pure decision handled:false → 200, store NOT touched (no-op).
 *   • verified + handled:true                → apply ONE store patch → 200.
 *
 * Never throws for an unknown event; never charges. The store patch is the only
 * side-effect, and it is idempotent on the natural key.
 */
export async function handleMarketplaceWebhookRequest(
  input: HandleMarketplaceWebhookInput,
  deps: HandleMarketplaceWebhookDeps,
): Promise<HandleMarketplaceWebhookResult> {
  const secret = (input.secret ?? "").trim();
  const signature = (input.signature ?? "").trim();

  // FAIL-CLOSED: no secret or no signature ⇒ refuse, do not act.
  if (!secret) return { status: 400, body: { error: "webhook_not_configured" } };
  if (!signature) return { status: 400, body: { error: "missing_signature" } };

  let event: Stripe.Event;
  try {
    event = deps.verify({ rawBody: input.rawBody, signature, secret });
  } catch {
    // Bad signature → 400, NEVER touch the store.
    return { status: 400, body: { error: "invalid_signature" } };
  }

  const decision = handleMarketplaceStripeEvent(event);
  if (!decision.handled) {
    // Unknown event / no reconciliation key → acknowledge, do nothing.
    return { status: 200, body: { received: true, handled: false, reason: decision.reason } };
  }

  // Apply on the PRIMARY key; if no row carried it (e.g. an invoice raced ahead of
  // the checkout.session.completed that stamps the subscription id), RETRY on the
  // fallback key (customer id). The patch stamps the subscription id either way,
  // so a fallback match back-fills it and later events match by subscription.
  const apply = (by: MarketplaceLookupBy, key: string) =>
    by === "checkout"
      ? deps.store.updateByCheckoutId(key, decision.patch)
      : by === "subscription"
        ? deps.store.updateBySubscriptionId(key, decision.patch)
        : deps.store.updateByCustomerId(key, decision.patch);

  let row = await apply(decision.lookupBy, decision.lookupKey);
  let matchedBy = decision.lookupBy;
  if (!row && decision.fallback) {
    row = await apply(decision.fallback.lookupBy, decision.fallback.lookupKey);
    if (row) matchedBy = decision.fallback.lookupBy;
  }

  // Best-effort post-activation: ONLY when a row matched AND the purchase flipped
  // to `active`. Errors are swallowed so provisioning can never affect the 200 or
  // re-trigger Stripe; it moves no money (the charge already settled).
  if (row && decision.status === "active" && deps.onActivated) {
    try {
      await deps.onActivated(row);
    } catch {
      // swallow — the status patch already applied; the webhook still 200s.
    }
  }

  // A verified event whose purchase row we don't have (unknown purchase) is a
  // no-op success — Stripe gets a 200 so it stops retrying; nothing changed.
  return {
    status: 200,
    body: {
      received: true,
      handled: true,
      eventType: decision.eventType,
      lookupBy: decision.lookupBy,
      matchedBy,
      status: decision.status,
      matched: Boolean(row),
      purchaseId: row?.id ?? null,
    },
  };
}
