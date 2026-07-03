-- packages/crm/drizzle/0061_referrals.sql
-- 2026-07-02 — Virality Pack Task 5: referral wallet credits (MONEY, inert
-- behind SF_REFERRALS_ENABLED).
--
-- ONE additive table. A referral is captured when a visitor arrives at
-- /build carrying `?ref=<referrerOrgId>` (an httpOnly `sf_ref` cookie) and
-- that cookie is present when they create a new workspace. See
-- db/schema/referrals.ts + lib/growth/referrals.ts for the full doc.
--
-- MONEY-SAFE:
--   • referee_org_id is UNIQUE — one referral row per referee EVER. A
--     referee can only ever be attributed to the FIRST referrer that landed
--     them, and can only ever be credited ONCE.
--   • This table records ATTRIBUTION only — it never holds money itself.
--     The actual credit is a wallet_transactions row (kind
--     'referral_credit', additive to WalletTransactionKind in
--     db/schema/wallet.ts — no migration needed for a new TEXT enum value),
--     inserted via the existing wallet-store credit primitive, keyed by the
--     UNIQUE idempotency keys `referral:referrer:<refereeOrgId>` /
--     `referral:referee:<refereeOrgId>` — the wallet_transactions table's
--     OWN UNIQUE(idempotency_key) constraint (0059_build_wallet.sql) is the
--     last-line backstop against a double-credit.
--   • Inert without the flag: SF_REFERRALS_ENABLED absent/false makes every
--     entry point a pure no-op — no row is ever inserted here, no wallet is
--     ever touched.
--
-- Additive only + idempotent (CREATE … IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "referrals" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_org_id"   UUID NOT NULL,
  "referee_org_id"    UUID NOT NULL,
  "source"            TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "credited_at"       TIMESTAMPTZ
);

-- The money-safety invariant: one referral row per referee, EVER.
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referee_org_uniq"
  ON "referrals" ("referee_org_id");

-- Referrer-scoped reads (a future "who have I referred" surface).
CREATE INDEX IF NOT EXISTS "referrals_referrer_idx"
  ON "referrals" ("referrer_org_id");
