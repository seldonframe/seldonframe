// 2026-06-18 pricing migration — checkout line-item assembly.
//
// Flat per-tier base price at checkout (Builder $19 / Workspace $49 /
// Agency $297). The new tiers have no metered overage lines at
// checkout; the Agency $10 quantity-licensed "extra client workspace"
// item is attached/synced POST-activation (Phase 4), not here.

import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
} from "./price-ids";
import type { TierId } from "./plans";
import type { BillingTier } from "./features";

export type CheckoutLineItem = {
  price: string;
  /** Flat-recurring base prices use quantity: 1. */
  quantity?: 1;
};

const TIER_BASE_PRICE: Record<TierId, string> = {
  builder: BUILDER_PRICE_ID,
  workspace: WORKSPACE_PRICE_ID,
  agency: AGENCY_BASE_PRICE_ID,
};

/**
 * Build the line_items array for a Stripe Checkout subscription
 * targeting the given tier. Returns null for "inactive" (no checkout
 * needed) and a single base-price line item for each paid tier.
 */
export function buildCheckoutLineItemsForTier(tier: BillingTier): CheckoutLineItem[] | null {
  if (tier === "inactive") return null;
  const base = TIER_BASE_PRICE[tier];
  if (!base) return null;
  return [{ price: base, quantity: 1 }];
}

/** Map a single base-tier priceId (the value clients pass) to a TierId.
 *  Returns null if the priceId isn't a recognized base price. */
export function tierFromBasePriceId(priceId: string | null | undefined): TierId | null {
  if (!priceId) return null;
  if (priceId === BUILDER_PRICE_ID) return "builder";
  if (priceId === WORKSPACE_PRICE_ID) return "workspace";
  if (priceId === AGENCY_BASE_PRICE_ID) return "agency";
  return null;
}
