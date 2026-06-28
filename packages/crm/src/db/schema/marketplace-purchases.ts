// 2026-06-28 — Recurring & Metered Agent Billing (#139) P0.
//
// One row per attempt to BUY a marketplace agent listing through Stripe Connect
// on the SELLER's connected account. ADDITIVE only — a brand-new table, no edits
// to any existing table. The fiat-Connect settlement record behind the
// storefront/rental install path (the 5% MARKETPLACE_FEE_PERCENT is the Stripe
// application fee routed to SF; the rest transfers to the seller's account).
//
// MONEY-SAFE: `stripeMode` records whether the row was created against Stripe
// TEST or LIVE keys (resolveBillingMode). v1 default is 'test'; a 'live' row is
// only written when SF_MARKETPLACE_BILLING_LIVE=true AND a live key is present
// AND the seller's Connect account is charges_enabled. No real card is charged in
// any dev/test path — the whole flow is inert without a Stripe key.
//
// jsonb-free on purpose: this is a flat settlement ledger (mirrors invoices /
// acp_checkout_sessions). Buyer-scoped reads use buyerOrgId; the webhook (P4)
// reconciles by stripeCheckoutId; seller earnings (P5) roll up by sellerOrgId.
//
// Migration: drizzle/0058_marketplace_purchases.sql (journaled idx 35).

import { desc, sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Which pricing model the purchase settles under (mirrors marketplace_listings
 *  .price_model). v1 only the `onetime` Checkout is wired; the rest are reserved
 *  for P2/P3 (monthly / metered subscriptions). */
export type MarketplacePriceModel = "onetime" | "monthly" | "per_usage" | "per_outcome";

/** Whether the row was created against Stripe TEST or LIVE keys. The money-safety
 *  tell: a 'live' row implies a real charge was attempted; everything in dev/test
 *  is 'test'. */
export type MarketplaceStripeMode = "test" | "live";

/** Settlement lifecycle. `pending` on create (Checkout opened, not yet paid);
 *  the P4 webhook moves it to active / past_due / canceled / failed. */
export type MarketplacePurchaseStatus =
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "failed";

export const marketplacePurchases = pgTable(
  "marketplace_purchases",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** The purchased marketplace_listings.id (kept as a plain uuid, not an FK, so
     *  the settlement ledger survives a listing being unpublished/deleted). */
    listingId: uuid("listing_id").notNull(),
    /** The listing slug, denormalized for the buyer/seller surfaces + event
     *  attribution without re-querying the listing. */
    slug: text("slug").notNull(),
    /** The buyer's org (the side that pays). Buyer-scoped reads filter on this. */
    buyerOrgId: uuid("buyer_org_id").notNull(),
    /** The seller / agent-creator's org — the Connect charge destination + the
     *  side the 5% fee accrues against (earnings rollup). */
    sellerOrgId: uuid("seller_org_id").notNull(),
    /** The pricing model this row settles under (MarketplacePriceModel). */
    priceModel: text("price_model").$type<MarketplacePriceModel>().notNull(),
    /** Total charged to the buyer, integer cents. */
    amountCents: integer("amount_cents").notNull().default(0),
    /** SF's 5% marketplace fee in cents (computeMarketplaceFeeCents). */
    feeCents: integer("fee_cents").notNull().default(0),
    /** 'test' | 'live' — which Stripe key mode created this row. */
    stripeMode: text("stripe_mode").$type<MarketplaceStripeMode>().notNull().default("test"),
    /** The buyer's Stripe customer id (set once the buyer pays). Nullable. */
    stripeCustomerId: text("stripe_customer_id"),
    /** The Stripe Checkout Session id (one-time path). Webhook reconciles on it. */
    stripeCheckoutId: text("stripe_checkout_id"),
    /** The Stripe Subscription id (recurring path, P2+). Nullable for one-time. */
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Settlement status (MarketplacePurchaseStatus). */
    status: text("status").$type<MarketplacePurchaseStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Buyer's purchases (the "Subscribed / Past due" surface) + idempotent install.
    index("marketplace_purchases_buyer_idx").on(table.buyerOrgId, desc(table.createdAt)),
    // Seller earnings rollup over settled rows (P5).
    index("marketplace_purchases_seller_idx").on(table.sellerOrgId, desc(table.createdAt)),
    // Webhook reconciliation by the Stripe Checkout session id (P4).
    index("marketplace_purchases_checkout_idx").on(table.stripeCheckoutId),
  ],
);

export type MarketplacePurchaseRow = typeof marketplacePurchases.$inferSelect;
export type NewMarketplacePurchase = typeof marketplacePurchases.$inferInsert;
