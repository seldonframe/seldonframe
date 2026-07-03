// 2026-07-02 — Virality Pack Task 5: referral wallet credits (MONEY, inert
// behind SF_REFERRALS_ENABLED).
//
// ONE additive table. A referral is captured when a visitor arrives at
// /build carrying `?ref=<referrerOrgId>` (an httpOnly `sf_ref` cookie, 90d)
// and that cookie is present when they create a new workspace — see
// lib/growth/referrals.ts for the full flag-gated capture + credit flow.
//
// MONEY-SAFE:
//   • refereeOrgId is UNIQUE — one referral row per referee EVER. A referee
//     can only ever be attributed to the FIRST referrer that landed them
//     (recordReferral no-ops on a second insert attempt for the same
//     referee), and can only ever be credited ONCE (maybeCreditReferral
//     transitions status 'pending' → 'credited' exactly once).
//   • This table records ATTRIBUTION only — it never holds money itself.
//     The actual credit is a `wallet_transactions` row (kind
//     'referral_credit', additive to WalletTransactionKind in
//     db/schema/wallet.ts) inserted via the EXISTING wallet-store credit
//     primitive, keyed by the UNIQUE idempotency keys
//     `referral:referrer:<refereeOrgId>` / `referral:referee:<refereeOrgId>`
//     — so even if this row's status flips more than once under a race, the
//     wallet ledger's own UNIQUE(idempotency_key) constraint is the
//     last-line backstop against a double-credit (mirrors every other
//     wallet-store.ts write path).
//   • Inert without the flag: SF_REFERRALS_ENABLED absent/false makes every
//     entry point (recordReferral, maybeCreditReferral) a pure no-op — no
//     row is ever inserted, no wallet is ever touched.
//
// No FK constraints on referrerOrgId/refereeOrgId (mirrors
// marketplace-purchases.ts's convention of plain uuid columns) — a
// settlement/attribution ledger should survive an org being deleted, and a
// referrer id sometimes originates from a cookie that could reference an
// org that no longer exists (the credit path simply fails soft in that case).
//
// Migration: drizzle/0061_referrals.sql (journaled idx 37).

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Referral lifecycle. `pending` on capture (the referee hasn't completed a
 *  credit-worthy action yet); `credited` once maybeCreditReferral has
 *  successfully credited BOTH wallets (idempotent — this only ever happens
 *  once per row). */
export type ReferralStatus = "pending" | "credited";

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** The org whose /build?ref=<id> link brought the referee in. Not an FK
     *  (see file header) — a plain uuid, like marketplace_purchases'
     *  buyer/seller org columns. */
    referrerOrgId: uuid("referrer_org_id").notNull(),
    /** The newly-created org that was referred. UNIQUE — the money-safety
     *  invariant: one referral (and therefore one credit pair) per referee,
     *  ever. */
    refereeOrgId: uuid("referee_org_id").notNull(),
    /** Attribution source — e.g. 'powered_by' (the badge on a generated
     *  site) or 'share_card' (the deploy share-card link). Free text so new
     *  growth-loop entry points don't need a migration to add a source. */
    source: text("source").notNull(),
    /** pending | credited (ReferralStatus). Defaults 'pending' on capture. */
    status: text("status").$type<ReferralStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Stamped the moment maybeCreditReferral successfully credits both
     *  wallets. Null while status is 'pending'. */
    creditedAt: timestamp("credited_at", { withTimezone: true }),
  },
  (table) => [
    // The money-safety invariant: one referral row per referee, EVER.
    uniqueIndex("referrals_referee_org_uniq").on(table.refereeOrgId),
    // Referrer-scoped reads (a future "who have I referred" surface).
    index("referrals_referrer_idx").on(table.referrerOrgId),
  ],
);

export type ReferralRow = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
