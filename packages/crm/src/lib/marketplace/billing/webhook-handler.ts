// #139 P4 — the PURE marketplace-billing webhook decision.
//
// `handleMarketplaceStripeEvent(event)` maps a VERIFIED Stripe event to a single
// status transition for the marketplace_purchases ledger. It is pure: no Stripe
// import beyond the type, no db, no network. The route does signature
// verification + applies the returned decision through the DI'd store; this
// function only decides WHAT to change and by WHICH key.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: a webhook moves NO money — it only verifies (in the route) and
// flips a status. This function never charges, never calls Stripe, never throws.
// An unknown event type or an event that carries no usable reconciliation key →
// { handled: false } (the route returns 200 + does nothing). It is therefore
// idempotent by construction: the only effect is a status field write, and the
// store applies it on the natural key (checkout id / subscription id), so a
// repeat delivery re-writes the SAME status — a no-op, never a double-charge.
// ─────────────────────────────────────────────────────────────────────────────
//
// Event → transition table (the only events we act on):
//   checkout.session.completed (payment OR subscription)
//        → look up by CHECKOUT id (session.id) → status:active,
//          + stamp stripeSubscriptionId (session.subscription) when present,
//          + stamp stripeCustomerId (session.customer) when present.
//   invoice.paid / invoice.payment_succeeded
//        → look up by SUBSCRIPTION id → status:active.
//   invoice.payment_failed
//        → look up by SUBSCRIPTION id → status:past_due.
//   customer.subscription.deleted
//        → look up by SUBSCRIPTION id → status:canceled.
//   anything else → { handled:false } (no-op).

import type Stripe from "stripe";
import type {
  MarketplacePurchaseStatus,
  NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";

/** Which natural key the decision reconciles the purchase row on. */
export type MarketplaceLookupBy = "checkout" | "subscription" | "customer";

/** The fields the webhook is allowed to patch on a purchase row. Intentionally a
 *  subset of the insert type so a typo can't write an arbitrary column. */
export type MarketplacePurchasePatch = Partial<
  Pick<
    NewMarketplacePurchase,
    "status" | "stripeSubscriptionId" | "stripeCustomerId"
  >
>;

/** A single (key-kind, key) the applier can reconcile a row on. */
export type MarketplaceLookupRef = { lookupBy: MarketplaceLookupBy; lookupKey: string };

/** The pure decision the route applies. `handled:false` ⇒ the route does nothing
 *  (200, no store write). `handled:true` ⇒ the route patches the row found by
 *  (`lookupBy`, `lookupKey`) with `patch` — and, if that primary key matches no
 *  row, RETRIES with `fallback` (when present). The fallback makes activation
 *  robust to webhook ORDERING: an `invoice.paid` that races ahead of the
 *  `checkout.session.completed` that stamps the subscription id can still match
 *  the row by CUSTOMER id (and the patch then stamps the subscription id so later
 *  events match directly). */
export type MarketplaceWebhookDecision =
  | { handled: false; reason: string }
  | {
      handled: true;
      lookupBy: MarketplaceLookupBy;
      lookupKey: string;
      /** Optional second key tried only when the primary matches no row. */
      fallback?: MarketplaceLookupRef;
      status: MarketplacePurchaseStatus;
      patch: MarketplacePurchasePatch;
      eventType: string;
    };

/** A handled:false result with a reason (for logging + the test assertions). */
function noop(reason: string): MarketplaceWebhookDecision {
  return { handled: false, reason };
}

/** Pull a string id out of a Stripe "string | {id} | null" expandable field. */
function refId(
  value: string | { id?: string } | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  return value.id?.trim() || null;
}

/** The subscription id off an Invoice — the field moved across Stripe API
 *  versions (top-level `subscription` in basil; `parent.subscription_details`
 *  in newer shapes), so read both defensively. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (
    invoice as Stripe.Invoice & {
      subscription?: string | { id?: string } | null;
    }
  ).subscription;
  const fromDirect = refId(direct);
  if (fromDirect) return fromDirect;

  const parent = (
    invoice as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
    }
  ).parent;
  return refId(parent?.subscription_details?.subscription ?? null);
}

/**
 * Map a verified Stripe event to a marketplace_purchases status transition.
 * Pure — no I/O, never throws. Unknown event types and events missing the
 * reconciliation key resolve to { handled:false } so the route 200s + no-ops.
 */
export function handleMarketplaceStripeEvent(
  event: Stripe.Event,
): MarketplaceWebhookDecision {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkoutId = (session.id ?? "").trim();
      if (!checkoutId) return noop("checkout.session.completed_missing_session_id");

      const patch: MarketplacePurchasePatch = { status: "active" };
      const subscriptionId = refId(session.subscription);
      if (subscriptionId) patch.stripeSubscriptionId = subscriptionId;
      const customerId = refId(session.customer);
      if (customerId) patch.stripeCustomerId = customerId;

      return {
        handled: true,
        lookupBy: "checkout",
        lookupKey: checkoutId,
        status: "active",
        patch,
        eventType: event.type,
      };
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return noop(`${event.type}_missing_subscription_id`);
      const customerId = refId(invoice.customer);
      // Stamp BOTH ids so a row matched by EITHER key ends up carrying the
      // subscription id (a customer-id fallback match must back-fill the sub id so
      // subsequent invoices match by subscription directly).
      const patch: MarketplacePurchasePatch = {
        status: "active",
        stripeSubscriptionId: subscriptionId,
      };
      if (customerId) patch.stripeCustomerId = customerId;
      return {
        handled: true,
        lookupBy: "subscription",
        lookupKey: subscriptionId,
        // ORDERING-RACE fallback: if no row carries this subscription id yet (the
        // invoice raced ahead of checkout.session.completed), match by the
        // customer id instead. Only added when the invoice carries a customer.
        ...(customerId ? { fallback: { lookupBy: "customer" as const, lookupKey: customerId } } : {}),
        status: "active",
        patch,
        eventType: event.type,
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return noop("invoice.payment_failed_missing_subscription_id");
      const customerId = refId(invoice.customer);
      const patch: MarketplacePurchasePatch = {
        status: "past_due",
        stripeSubscriptionId: subscriptionId,
      };
      if (customerId) patch.stripeCustomerId = customerId;
      return {
        handled: true,
        lookupBy: "subscription",
        lookupKey: subscriptionId,
        // Same ordering-race fallback as invoice.paid: match by customer id when
        // no row carries the subscription id yet.
        ...(customerId ? { fallback: { lookupBy: "customer" as const, lookupKey: customerId } } : {}),
        status: "past_due",
        patch,
        eventType: event.type,
      };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = (subscription.id ?? "").trim();
      if (!subscriptionId) return noop("customer.subscription.deleted_missing_id");
      return {
        handled: true,
        lookupBy: "subscription",
        lookupKey: subscriptionId,
        status: "canceled",
        patch: { status: "canceled" },
        eventType: event.type,
      };
    }

    default:
      return noop(`unhandled_event_type:${event.type}`);
  }
}
