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

export type CheckoutMetadata = {
  /** Org the subscription belongs to. The Phase 2 billing webhook
   *  resolves the org from this first (resolveOrgIdForBillingEvent). */
  orgId: string;
  /** Resolved tier id — the webhook reads this to set
   *  organizations.subscription.tier without a Stripe round-trip. */
  tier: TierId;
  /** Base flat price id — webhook tier-resolution fallback + stored as
   *  stripePriceId. */
  priceId: string;
  userId: string;
  workspaceId: string;
  /** Stable alias kept for older webhook/back-office consumers. */
  seldonframe_user_id: string;
  type: "self_service_workspace";
};

export type CheckoutSessionParams = {
  mode: "subscription";
  customer_email?: string;
  client_reference_id: string;
  line_items: CheckoutLineItem[];
  success_url: string;
  cancel_url: string;
  metadata: CheckoutMetadata;
  subscription_data: { metadata: CheckoutMetadata };
};

export type BuildCheckoutSessionInput = {
  tier: BillingTier;
  userId: string;
  orgId: string;
  workspaceId: string;
  customerEmail?: string | null;
  origin: string;
  successPath: string;
  cancelPath: string;
};

/**
 * Assemble the Stripe Checkout Session create params for a self-service
 * tier subscription. Pure (no I/O) so the payment-critical metadata
 * contract is unit-testable without auth / db / the Stripe SDK.
 *
 * Returns null when the tier has no checkout (inactive / unknown) so the
 * route can 400 instead of creating an empty session.
 *
 * CONTRACT (Phase 2 webhook depends on this): `metadata.orgId` and
 * `metadata.tier` are stamped on BOTH the top-level session `metadata`
 * AND `subscription_data.metadata`, so they ride on the checkout session
 * event AND every later customer.subscription.* event.
 */
export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionInput
): CheckoutSessionParams | null {
  const lineItems = buildCheckoutLineItemsForTier(input.tier);
  if (!lineItems || lineItems.length === 0) return null;

  // Safe: a non-null line-item array means the tier is a real paid
  // TierId (inactive short-circuits above), so narrow it for metadata.
  const tier = input.tier as TierId;
  const basePriceId = lineItems[0].price;

  const metadata: CheckoutMetadata = {
    orgId: input.orgId,
    tier,
    priceId: basePriceId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    seldonframe_user_id: input.userId,
    type: "self_service_workspace",
  };

  return {
    mode: "subscription",
    customer_email: input.customerEmail ?? undefined,
    client_reference_id: input.userId,
    line_items: lineItems,
    success_url: `${input.origin}${input.successPath}`,
    cancel_url: `${input.origin}${input.cancelPath}`,
    metadata,
    // Same metadata on the subscription so orgId + tier ride every later
    // customer.subscription.* / invoice.* event (the webhook's primary
    // org-resolution + tier source).
    subscription_data: { metadata },
  };
}
