-- packages/crm/drizzle/0059_build_wallet.sql
-- 2026-06-30 — Builder Marketplace (spec 1ff09dcb) P2: the PREPAID WALLET.
--
-- Two ADDITIVE tables (no edits to any existing table) behind the build/run money
-- path. A Stripe Checkout top-up funds wallet_accounts.balance_micros; every
-- successful build run draws it down by a LEDGER decrement (NO Stripe call per
-- run — that's the whole point of prepaid). See db/schema/wallet.ts +
-- lib/build/wallet-ledger.ts for the full doc.
--
-- MONEY-SAFE:
--   • balance_micros is NEVER negative — the pure ledger rejects an over-debit
--     before any write (the run endpoint 402s instead of executing).
--   • wallet_transactions.idempotency_key is UNIQUE — the last-line backstop that
--     makes a top-up credit (idempotent on the Stripe session id) and a per-run
--     debit (idempotent on the runId, key `debit:<runId>`) impossible to apply
--     twice even under a race. A run can NEVER double-debit.
--   • stripe_mode defaults 'test'; a 'live' row only when a live Stripe key
--     created the top-up. Dev/test is inert (no key → no top-up → empty wallet).
--
-- Accounting unit is MICRO-DOLLARS ($1 = 1_000_000) — matches run-cost.ts.
-- Additive only + idempotent (CREATE … IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "wallet_accounts" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL,
  "balance_micros" BIGINT NOT NULL DEFAULT 0,
  "stripe_mode"    TEXT NOT NULL DEFAULT 'test',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One wallet per (org, mode) — the natural key the store upserts on. A per-mode
-- wallet keeps test top-ups from ever funding live runs (or vice-versa).
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_accounts_org_mode_uniq"
  ON "wallet_accounts" ("org_id", "stripe_mode");

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          UUID NOT NULL,
  "kind"            TEXT NOT NULL,
  "amount_micros"   BIGINT NOT NULL,
  "run_id"          TEXT,
  "stripe_ref"      TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The dedupe backstop (UNIQUE). Top-up + per-run idempotency rests on this: a
-- duplicate insert violates the constraint → the store treats it as a no-op, so a
-- credit/debit can NEVER apply twice.
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_idempotency_uniq"
  ON "wallet_transactions" ("idempotency_key");

-- Org-scoped transaction history (statements / earnings rollup), newest first.
CREATE INDEX IF NOT EXISTS "wallet_transactions_org_idx"
  ON "wallet_transactions" ("org_id", "created_at" DESC);
