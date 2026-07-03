// 2026-06-30 — Builder Marketplace (spec 1ff09dcb) P2: the PREPAID WALLET.
//
// Two ADDITIVE tables (no edits to any existing table) behind the build/run
// money path: a Stripe top-up funds a balance; every successful build run draws
// it down by a LEDGER decrement (no Stripe call per run — that's the point of
// prepaid). The pure ledger ops live in lib/build/wallet-ledger.ts; the store
// (lib/build/wallet-store.ts) persists what they return.
//
// MONEY-SAFETY:
//   • wallet_accounts.balance_micros is the single balance per (org, stripeMode);
//     it is NEVER negative (the ledger rejects an over-debit before any write).
//   • wallet_transactions.idempotency_key is UNIQUE — the last-line backstop that
//     makes top-up credits (idempotent on the Stripe session id) and per-run
//     debits (idempotent on the runId, key = `debit:<runId>`) impossible to apply
//     twice even under a race. A run can NEVER double-debit.
//   • stripe_mode mirrors marketplace_purchases: 'test' by default; a 'live' row
//     only when a live Stripe key created the top-up (resolveBillingMode). Dev/test
//     is inert (no Stripe key → no top-up → an empty wallet → every paid run 402s).
//
// Accounting unit is MICRO-DOLLARS ($1 = 1_000_000) — matches run-cost.ts's
// calculatedCost so a run's computed cost debits the wallet 1:1, no rounding.
//
// Migration: drizzle/0059_build_wallet.sql (journaled idx 36).

import { desc, sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

/** The kind of a wallet transaction. `topup` = money in (Stripe Checkout);
 *  `debit` = a per-run drawdown (ledger decrement, no Stripe call); `earning` =
 *  the builder's accrued net (cost − 5% fee) on a run they sold; `payout` = a
 *  withdrawal of accrued earnings to the builder's bank (a Stripe Connect
 *  Transfer), which SUBTRACTS from what's withdrawable; `voice_debit` = a voice
 *  call's metered usage draining the wallet (never refused — drains whatever
 *  the balance covers, per-call idempotent); `number_rent` = the monthly phone
 *  number rental drawdown (refusable, unlike voice minutes); `referral_credit`
 *  = money IN for either side of a completed referral (virality pack Task 5 —
 *  NEVER Stripe, inert without SF_REFERRALS_ENABLED, idempotent on the keys
 *  `referral:referrer:<refereeOrgId>` / `referral:referee:<refereeOrgId>` —
 *  see lib/growth/referrals.ts). */
export type WalletTransactionKind =
  | "topup"
  | "debit"
  | "earning"
  | "payout"
  | "voice_debit"
  | "number_rent"
  | "referral_credit";

/** One prepaid balance per (org, Stripe mode). A workspace tops this up via
 *  Stripe Checkout; every successful build run draws it down. Never negative. */
export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** The owning workspace/org. */
    orgId: uuid("org_id").notNull(),
    /** Current balance in MICRO-DOLLARS ($1 = 1_000_000). bigint (micros of a
     *  funded wallet can exceed a 32-bit int) — read as a JS number via the
     *  bigint mode:"number" below. NEVER negative. */
    balanceMicros: bigint("balance_micros", { mode: "number" }).notNull().default(0),
    /** 'test' | 'live' — which Stripe key mode this wallet settles under. A wallet
     *  is per-mode so test top-ups can never fund live runs (or vice-versa). */
    stripeMode: text("stripe_mode").$type<MarketplaceStripeMode>().notNull().default("test"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One wallet per (org, mode) — the natural key the store upserts on.
    uniqueIndex("wallet_accounts_org_mode_uniq").on(table.orgId, table.stripeMode),
  ],
);

/** The append-only journal of every balance move. The store derives the wallet's
 *  applied-keys / debited-runIds sets from here to feed the pure ledger. */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** The owning org (denormalized for org-scoped reads + earnings rollup). */
    orgId: uuid("org_id").notNull(),
    /** topup | debit | earning (WalletTransactionKind). */
    kind: text("kind").$type<WalletTransactionKind>().notNull(),
    /** The magnitude of the move in MICRO-DOLLARS (always a positive integer; the
     *  `kind` carries the sign — topup/earning add, debit subtracts). */
    amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
    /** The run this row belongs to (debit/earning). Nullable for top-ups. */
    runId: text("run_id"),
    /** The Stripe session/event id backing a top-up. Nullable for debits. */
    stripeRef: text("stripe_ref"),
    /** UNIQUE dedupe key — the LAST-LINE money-safety backstop. topup: the Stripe
     *  session id; debit: `debit:<runId>`; earning: `earning:<runId>`; payout:
     *  `payout:<transferId>`; voice_debit: `voice:<callId>`; number_rent:
     *  `rent:<deploymentId>:<YYYY-MM>`. A duplicate insert violates this
     *  constraint → the store treats it as an idempotent no-op, so a
     *  credit/debit can NEVER apply twice. */
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The dedupe backstop (UNIQUE). Top-up + per-run idempotency rests on this.
    uniqueIndex("wallet_transactions_idempotency_uniq").on(table.idempotencyKey),
    // Org-scoped transaction history (statements / earnings rollup), newest first.
    index("wallet_transactions_org_idx").on(table.orgId, desc(table.createdAt)),
  ],
);

export type WalletAccountRow = typeof walletAccounts.$inferSelect;
export type NewWalletAccount = typeof walletAccounts.$inferInsert;
export type WalletTransactionRow = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
