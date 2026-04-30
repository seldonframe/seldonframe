// April 30, 2026 pricing migration. Central resolver: given an arbitrary
// list of Stripe price IDs (from a subscription's items.data), figure
// out which tier the org is on. Used by the webhook handler so a
// multi-price subscription (base flat + metered overages) resolves
// correctly to "growth" or "scale" — the single-price-resolution that
// existed before the migration only looked at items[0] and would have
// flapped depending on item ordering.

import {
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "./price-ids";
import type { TierId } from "./plans";

/** Resolve the org's tier from a list of Stripe price ids on the
 *  subscription. Scans for the "highest" base price found:
 *    Scale > Growth > Free
 *  Legacy price ids resolve to growth (Cloud Starter) or scale (Cloud
 *  Pro / Cloud Agency / Pro_3 / Pro_5 / Pro_10 / Pro_20). The metered
 *  overage prices are ignored — they ride along with a base. */
export function resolveTierFromPriceIds(priceIds: (string | null | undefined)[]): TierId {
  const set = new Set(
    priceIds.filter((p): p is string => typeof p === "string" && p.length > 0)
  );

  if (set.size === 0) return "free";

  // Scale takes precedence (heaviest tier).
  if (
    set.has(SCALE_BASE_PRICE_ID) ||
    set.has(LEGACY_CLOUD_PRO_PRICE_ID) ||
    set.has(LEGACY_CLOUD_AGENCY_PRICE_ID)
  ) {
    return "scale";
  }

  if (set.has(GROWTH_BASE_PRICE_ID) || set.has(LEGACY_CLOUD_STARTER_PRICE_ID)) {
    return "growth";
  }

  return "free";
}

/** Resolve the tier from a Stripe Subscription object. Pulls every
 *  item's price.id and routes through `resolveTierFromPriceIds`. */
export function resolveTierFromSubscription(subscription: {
  items: { data: Array<{ price?: { id?: string | null } | null }> };
}): TierId {
  const priceIds = subscription.items.data.map((item) => item.price?.id ?? null);
  return resolveTierFromPriceIds(priceIds);
}
