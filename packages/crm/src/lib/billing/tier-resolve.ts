// 2026-06-18 pricing migration. Central resolver: given an arbitrary
// list of Stripe price IDs (from a subscription's items.data), figure
// out which tier the org is on. Used by the webhook handler so a
// multi-price subscription resolves correctly. The new base prices map
// to builder / workspace / agency; legacy Growth/Scale base prices
// grandfather to workspace / agency. The no-subscription sentinel is
// "inactive".

import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "./price-ids";
import type { BillingTier } from "./features";

/** Resolve the org's tier from a list of Stripe price ids on the
 *  subscription. Scans for the "highest" base price found:
 *    agency > workspace > builder > inactive
 *  Legacy price ids resolve to workspace (Growth/Cloud Starter) or
 *  agency (Scale/Cloud Pro/Cloud Agency). Overage/metered prices are
 *  ignored — they ride along with a base. */
export function resolveTierFromPriceIds(priceIds: (string | null | undefined)[]): BillingTier {
  const set = new Set(
    priceIds.filter((p): p is string => typeof p === "string" && p.length > 0)
  );

  if (set.size === 0) return "inactive";

  // Agency takes precedence (heaviest tier).
  if (
    set.has(AGENCY_BASE_PRICE_ID) ||
    set.has(SCALE_BASE_PRICE_ID) ||
    set.has(LEGACY_CLOUD_PRO_PRICE_ID) ||
    set.has(LEGACY_CLOUD_AGENCY_PRICE_ID)
  ) {
    return "agency";
  }

  if (
    set.has(WORKSPACE_PRICE_ID) ||
    set.has(GROWTH_BASE_PRICE_ID) ||
    set.has(LEGACY_CLOUD_STARTER_PRICE_ID)
  ) {
    return "workspace";
  }

  if (set.has(BUILDER_PRICE_ID)) {
    return "builder";
  }

  return "inactive";
}

/** Resolve the tier from a Stripe Subscription object. Pulls every
 *  item's price.id and routes through `resolveTierFromPriceIds`. */
export function resolveTierFromSubscription(subscription: {
  items: { data: Array<{ price?: { id?: string | null } | null }> };
}): BillingTier {
  const priceIds = subscription.items.data.map((item) => item.price?.id ?? null);
  return resolveTierFromPriceIds(priceIds);
}
