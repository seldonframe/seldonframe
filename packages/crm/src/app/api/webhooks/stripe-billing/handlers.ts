// Phase 2 (2026-06-18 pricing migration) — billing-state consolidation.
//
// `organizations.subscription` (JSONB) is the SINGLE SOURCE OF TRUTH for
// the platform subscription. The app reads it via
// `lib/billing/subscription.ts::getOrgSubscription` and
// `lib/billing/tier-resolver.ts::resolveTierForWorkspace`. Historically
// this webhook wrote the legacy `users.planId/stripeCustomerId/
// stripeSubscriptionId` columns instead, so the two could drift. This
// module moves the writes onto `organizations.subscription`.
//
// Why an extracted, dependency-injected handler (not inline in route.ts):
//   - The route does signature verification + I/O wiring; this module
//     does the pure state mapping so it's unit-testable WITHOUT a DB,
//     Stripe SDK, or secret keys (mirrors the lib/billing DI pattern
//     used by hasFeature(deps) / attachPaymentMethodToUser({repo})).
//   - Tier is resolved entirely from the price ids the event already
//     carries (subscription.items[].price.id, or session.metadata for
//     checkout). NO `stripe.subscriptions.retrieve` round-trip — the
//     events ship the data we need, and this keeps the handler pure.
//
// Org resolution order (see BillingWebhookStore.resolveOrgId, backed in
// the route by organizations.subscription->>'stripeCustomerId' /
// 'stripeSubscriptionId' lookups + users.orgId):
//   1. event metadata.orgId — set by /api/stripe/checkout via BOTH
//      `metadata` and `subscription_data.metadata`, so it rides on the
//      checkout session AND every later subscription event.
//   2. metadata.userId → users.orgId.
//   3. the subscription id already stored on an org's subscription.
//   4. the customer id already stored on an org's subscription.
//
// Idempotency: the processed Stripe event ids live in
// `organizations.subscription.stripeProcessedEventIds` (capped at 100,
// newest-first) — the same list the Connect-side webhook uses. A
// re-delivered event id is a no-op.

import type Stripe from "stripe";
import type { OrganizationSubscription } from "@/db/schema";
import { AGENCY_WORKSPACE_OVERAGE_PRICE_ID } from "@/lib/billing/price-ids";
import { resolveTierFromPriceIds } from "@/lib/billing/tier-resolve";
import { normalizeTierId, type BillingTier } from "@/lib/billing/features";

/** The narrow persistence + resolution surface the handler needs. The
 *  route supplies a DB-backed implementation; tests supply an in-memory
 *  fake. `updateOrgSubscription` MUST merge (preserve sibling keys in
 *  `organizations.subscription`) — the production impl in
 *  lib/billing/subscription.ts does a read-modify-write spread, which is
 *  equivalent to a `jsonb_set` of each provided key. */
export interface BillingWebhookStore {
  resolveOrgId(args: {
    metadata?: Record<string, string> | null;
    customerId?: string | null;
    subscriptionId?: string | null;
  }): Promise<string | null>;
  getOrgSubscription(orgId: string): Promise<OrganizationSubscription>;
  updateOrgSubscription(orgId: string, updates: Partial<OrganizationSubscription>): Promise<void>;
}

type SubscriptionStatus = NonNullable<OrganizationSubscription["status"]>;

export type BillingHandlerResult =
  | { orgId: string; action: "applied"; tier: BillingTier; status: SubscriptionStatus }
  | { orgId: string; action: "duplicate" }
  | null;

const PROCESSED_EVENT_CAP = 100;

/** Stripe subscription statuses we persist; anything else (incomplete,
 *  incomplete_expired, paused, …) is normalized to the closest of ours. */
function mapSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  switch (value) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    default:
      return "active";
  }
}

function asId(value: string | { id?: string | null } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

/** Pull every price id off a subscription's line items. */
function priceIdsFromItems(items: Stripe.Subscription["items"] | undefined): string[] {
  return (items?.data ?? [])
    .map((item) => item.price?.id ?? null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Pick the base flat price for `stripePriceId` storage — the first
 *  line item that is NOT the agency overage line. Falls back to the
 *  first price id for single-line subscriptions. */
function pickBasePriceId(priceIds: string[]): string | null {
  const base = priceIds.find(
    (id) => !AGENCY_WORKSPACE_OVERAGE_PRICE_ID || id !== AGENCY_WORKSPACE_OVERAGE_PRICE_ID,
  );
  return base ?? priceIds[0] ?? null;
}

/** Detect the Stripe subscription-item id for the $10 quantity-licensed
 *  "extra client workspace" overage line, so Phase 4 can update its
 *  quantity without re-scanning. Returns null when the subscription
 *  doesn't carry the overage price (non-agency, or agency still within
 *  included workspaces) or the overage price id isn't configured.
 *
 *  `overagePriceId` defaults to the env-backed AGENCY_WORKSPACE_OVERAGE_
 *  PRICE_ID; exposed as a param so the detection logic is unit-testable
 *  even when the env var is unset (it's env-only — no placeholder). */
export function detectWorkspaceOverageItemId(
  items: Stripe.Subscription["items"] | undefined,
  overagePriceId: string = AGENCY_WORKSPACE_OVERAGE_PRICE_ID,
): string | null {
  if (!overagePriceId) return null;
  const match = (items?.data ?? []).find((item) => item.price?.id === overagePriceId);
  return match?.id ?? null;
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

/** Append an event id to the idempotency list (newest-first, capped).
 *  Returns null if the id was already present (caller should no-op). */
function appendProcessedEventId(
  current: OrganizationSubscription,
  eventId: string,
): string[] | null {
  const processed = Array.isArray(current.stripeProcessedEventIds)
    ? current.stripeProcessedEventIds
    : [];
  if (processed.includes(eventId)) return null;
  return [eventId, ...processed].slice(0, PROCESSED_EVENT_CAP);
}

/**
 * Apply a single platform-billing Stripe event to
 * `organizations.subscription`. Pure except for the injected `store`.
 *
 * Returns:
 *   - { action: "applied", … } when state was written,
 *   - { action: "duplicate" } when the event id was already processed,
 *   - null when no org could be resolved (safe no-op — Stripe gets 2xx
 *     so it stops retrying an event for a workspace we don't own).
 */
export async function handleBillingSubscriptionEvent(
  event: Stripe.Event,
  store: BillingWebhookStore,
): Promise<BillingHandlerResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? null;
      const customerId = asId(session.customer);
      const subscriptionId = asId(session.subscription);

      const orgId = await store.resolveOrgId({ metadata, customerId, subscriptionId });
      if (!orgId) return null;

      const current = await store.getOrgSubscription(orgId);
      const processedEventIds = appendProcessedEventId(current, event.id);
      if (!processedEventIds) return { orgId, action: "duplicate" };

      // Tier from checkout metadata (set by /api/stripe/checkout). Fall
      // back to resolving the stored priceId through the price-id map.
      const metaPriceId = metadata?.priceId?.trim() || null;
      const tier =
        normalizeTierId(metadata?.tier) !== "inactive"
          ? normalizeTierId(metadata?.tier)
          : resolveTierFromPriceIds([metaPriceId]);
      const status: SubscriptionStatus = "active";

      await store.updateOrgSubscription(orgId, {
        tier,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: metaPriceId,
        stripeProcessedEventIds: processedEventIds,
      });

      return { orgId, action: "applied", tier, status };
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const metadata = subscription.metadata ?? null;
      const customerId = asId(subscription.customer);
      const subscriptionId = subscription.id ?? null;

      const orgId = await store.resolveOrgId({ metadata, customerId, subscriptionId });
      if (!orgId) return null;

      const current = await store.getOrgSubscription(orgId);
      const processedEventIds = appendProcessedEventId(current, event.id);
      if (!processedEventIds) return { orgId, action: "duplicate" };

      const priceIds = priceIdsFromItems(subscription.items);
      // 2026-07-08 post-review fix wave (BLOCKING) — METADATA-FIRST tier
      // resolution. Since price-ids.ts's BUILDER_PRICE_ID now equals
      // WORKSPACE_PRICE_ID (both tiers share one Stripe price until Max
      // creates a distinct Builder price), price-id inference alone can
      // no longer distinguish a "builder" subscriber from a
      // grandfathered "workspace" subscriber — resolveTierFromPriceIds
      // would relabel EVERY shared-price subscriber to "workspace" on
      // every renewal/quantity-change event, silently reassigning new
      // builder purchasers back to the frozen grandfathered tier.
      // subscription.metadata.tier is embedded at checkout
      // (buildCheckoutSessionParams's subscription_data.metadata) and
      // persists on the Stripe subscription object across its whole
      // lifetime (renewals included) — so it's the authoritative source
      // whenever it resolves to a real (non-"inactive") tier. Price-id
      // inference is now only the FALLBACK, for subscriptions that
      // predate metadata tagging (pre-2026-06-18 rows) or a genuine
      // Stripe-side price swap that didn't carry updated metadata.
      const metaTier = normalizeTierId(metadata?.tier);
      const tier = metaTier !== "inactive" ? metaTier : resolveTierFromPriceIds(priceIds);
      const status = mapSubscriptionStatus(subscription.status);
      const currentPeriodEnd = toIso(
        (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end,
      );
      const workspaceItemId = detectWorkspaceOverageItemId(subscription.items);

      await store.updateOrgSubscription(orgId, {
        tier,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: pickBasePriceId(priceIds),
        currentPeriodEnd,
        // Only set the overage item id when present; preserve any prior
        // value otherwise (don't clobber a known item with null on an
        // unrelated update event that omitted items).
        ...(workspaceItemId ? { stripeWorkspaceItemId: workspaceItemId } : {}),
        stripeProcessedEventIds: processedEventIds,
      });

      return { orgId, action: "applied", tier, status };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const metadata = subscription.metadata ?? null;
      const customerId = asId(subscription.customer);
      const subscriptionId = subscription.id ?? null;

      const orgId = await store.resolveOrgId({ metadata, customerId, subscriptionId });
      if (!orgId) return null;

      const current = await store.getOrgSubscription(orgId);
      const processedEventIds = appendProcessedEventId(current, event.id);
      if (!processedEventIds) return { orgId, action: "duplicate" };

      const status: SubscriptionStatus = "canceled";
      await store.updateOrgSubscription(orgId, {
        tier: "inactive",
        status,
        // Clear the live subscription pointer; keep customer id for back-
        // reference and keep all non-billing sibling keys (merge write).
        stripeSubscriptionId: null,
        stripeWorkspaceItemId: null,
        stripeProcessedEventIds: processedEventIds,
      });

      return { orgId, action: "applied", tier: "inactive", status };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const metadata = invoice.metadata ?? null;
      const customerId = asId(invoice.customer);
      const subscriptionId = asId(
        (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription,
      );

      const orgId = await store.resolveOrgId({ metadata, customerId, subscriptionId });
      if (!orgId) return null;

      const current = await store.getOrgSubscription(orgId);
      const processedEventIds = appendProcessedEventId(current, event.id);
      if (!processedEventIds) return { orgId, action: "duplicate" };

      // Invoice events drive STATUS only — the authoritative tier writer
      // is customer.subscription.updated (it carries the full item set).
      // Mutating tier here from a partial invoice risks a wrong write, so
      // we preserve the existing tier.
      const status: SubscriptionStatus = event.type === "invoice.payment_failed" ? "past_due" : "active";
      const tier = normalizeTierId(current.tier);

      await store.updateOrgSubscription(orgId, {
        status,
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        stripeProcessedEventIds: processedEventIds,
      });

      return { orgId, action: "applied", tier, status };
    }

    default:
      return null;
  }
}
