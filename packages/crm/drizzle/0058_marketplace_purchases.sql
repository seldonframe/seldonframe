-- packages/crm/drizzle/0058_marketplace_purchases.sql
-- 2026-06-28 — Recurring & Metered Agent Billing (#139) P0.
--
-- One row per attempt to BUY a marketplace agent listing through Stripe Connect
-- on the SELLER's connected account (the 5% MARKETPLACE_FEE_PERCENT is the
-- application fee). ADDITIVE only — a brand-new table, no edits to any existing
-- table. Mirrors acp_checkout_sessions (the sibling billing table) but is the
-- fiat-Connect settlement record for the storefront/rental install path.
--
-- MONEY-SAFE: `stripe_mode` records whether the row was created against Stripe
-- TEST or LIVE keys (resolveBillingMode — KEY-DERIVED). A 'live' row is written
-- iff STRIPE_SECRET_KEY is a live key AND billing is enabled
-- (SF_MARKETPLACE_BILLING=true) AND the seller's Connect account is charges_enabled;
-- a test key (or no key → inert) is always 'test'. No real card is charged in
-- dev/test — the whole path is inert without a Stripe key.
--
-- Buyer-scoped reads use (buyer_org_id); the webhook (P4) reconciles by
-- (stripe_checkout_id); seller earnings (P5) roll up by (seller_org_id).

CREATE TABLE IF NOT EXISTS "marketplace_purchases" (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id"             UUID NOT NULL,
  "slug"                   TEXT NOT NULL,
  "buyer_org_id"           UUID NOT NULL,
  "seller_org_id"          UUID NOT NULL,
  "price_model"            TEXT NOT NULL,
  "amount_cents"           INTEGER NOT NULL DEFAULT 0,
  "fee_cents"              INTEGER NOT NULL DEFAULT 0,
  "stripe_mode"            TEXT NOT NULL DEFAULT 'test',
  "stripe_customer_id"     TEXT,
  "stripe_checkout_id"     TEXT,
  "stripe_subscription_id" TEXT,
  "status"                 TEXT NOT NULL DEFAULT 'pending',
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buyer's purchases (the "Subscribed / Past due" surface) + idempotent install.
CREATE INDEX IF NOT EXISTS "marketplace_purchases_buyer_idx"
  ON "marketplace_purchases" ("buyer_org_id", "created_at" DESC);

-- Seller earnings rollup over settled rows (P5).
CREATE INDEX IF NOT EXISTS "marketplace_purchases_seller_idx"
  ON "marketplace_purchases" ("seller_org_id", "created_at" DESC);

-- Webhook reconciliation by the Stripe Checkout session id (P4). Partial — only
-- rows that actually reached Stripe carry a checkout id.
CREATE INDEX IF NOT EXISTS "marketplace_purchases_checkout_idx"
  ON "marketplace_purchases" ("stripe_checkout_id")
  WHERE "stripe_checkout_id" IS NOT NULL;
