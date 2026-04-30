// April 30, 2026 — multi-price checkout item assembly.
//
// Stripe subscriptions can have multiple line items: a flat base price
// + one or more metered prices that bill against a configured meter.
// Both growth and scale ship with metered overage lines, so checkout
// has to attach the right combo:
//
//   Growth — [growth_base, growth_contacts, growth_agent_runs]
//   Scale  — [scale_base, scale_agent_runs]   (contacts are unlimited)
//
// If a metered price id isn't configured (env var unset, price not yet
// created in Stripe Dashboard), we DROP that line from the subscription.
// The flat base still works; the meter events are still reported, they
// just aren't billed until the price exists. That keeps checkout from
// 400ing when ops creates the live tier prices ahead of the metered
// prices.

import {
  GROWTH_BASE_PRICE_ID,
  GROWTH_CONTACTS_PRICE_ID,
  GROWTH_AGENT_RUNS_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  SCALE_AGENT_RUNS_PRICE_ID,
} from "./price-ids";
import type { TierId } from "./plans";

export type CheckoutLineItem = {
  price: string;
  /** Metered prices MUST omit quantity (Stripe rejects checkout with
   *  quantity on a metered/usage_in_arrears price). Flat-recurring
   *  prices use quantity: 1. */
  quantity?: 1;
};

/**
 * Build the line_items array for a Stripe Checkout subscription
 * targeting the given tier. Returns null for "free" (no checkout
 * needed) and a list of line items for growth + scale.
 *
 * Metered overage prices that aren't configured (env-empty) are
 * silently dropped — the resulting subscription will still pass
 * Stripe's validation because the base flat price is always present.
 */
export function buildCheckoutLineItemsForTier(tier: TierId): CheckoutLineItem[] | null {
  if (tier === "free") return null;

  if (tier === "growth") {
    const items: CheckoutLineItem[] = [{ price: GROWTH_BASE_PRICE_ID, quantity: 1 }];
    if (GROWTH_CONTACTS_PRICE_ID) items.push({ price: GROWTH_CONTACTS_PRICE_ID });
    if (GROWTH_AGENT_RUNS_PRICE_ID) items.push({ price: GROWTH_AGENT_RUNS_PRICE_ID });
    return items;
  }

  if (tier === "scale") {
    const items: CheckoutLineItem[] = [{ price: SCALE_BASE_PRICE_ID, quantity: 1 }];
    if (SCALE_AGENT_RUNS_PRICE_ID) items.push({ price: SCALE_AGENT_RUNS_PRICE_ID });
    return items;
  }

  return null;
}

/** Map a single base-tier priceId (the value clients pass) to a TierId.
 *  Returns null if the priceId isn't a recognized base price. */
export function tierFromBasePriceId(priceId: string | null | undefined): TierId | null {
  if (!priceId) return null;
  if (priceId === GROWTH_BASE_PRICE_ID) return "growth";
  if (priceId === SCALE_BASE_PRICE_ID) return "scale";
  return null;
}
