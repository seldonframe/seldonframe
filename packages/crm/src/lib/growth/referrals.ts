// Referral wallet credits — virality pack Task 5 (MONEY, inert behind
// SF_REFERRALS_ENABLED).
//
// "Refer a builder, both of you get a wallet credit" — the growth loop that
// turns the /build powered-by badge and share-card links into new
// workspaces. This module owns the WHOLE flag-gated lifecycle:
//
//   1. Attribution (recordReferral): stamped once, at workspace-creation
//      time, from the `sf_ref` cookie /build's server component set when
//      the visitor arrived via `?ref=<referrerOrgId>` (see
//      app/build/page.tsx + the anonymous-workspace creation call site).
//   2. Credit (maybeCreditReferral): called fail-soft after a
//      credit-worthy event (today: a successful deploy — see the deploy
//      route's post-success call site) — pays BOTH the referrer and the
//      referee a flat SF_REFERRAL_CREDIT_CENTS bonus, ONCE, ever.
//
// MONEY-SAFETY (non-negotiable):
//   • SF_REFERRALS_ENABLED absent/false → EVERY entry point below is a
//     total no-op. No row is inserted, no wallet is ever touched.
//   • Self-referral (referrerOrgId === refereeOrgId) is rejected outright —
//     never recorded, so it can never be credited.
//   • ONE credit pair per referee, EVER: referrals.refereeOrgId is UNIQUE
//     (see db/schema/referrals.ts), and maybeCreditReferral only credits a
//     row whose status is still 'pending' — a replayed call for an
//     already-'credited' row is a pure no-op. Defense in depth: the wallet
//     ledger's OWN UNIQUE(idempotency_key) constraint (wallet-store.ts) is
//     the last-line backstop even if this status check were somehow
//     bypassed.
//   • Credits are WALLET LEDGER rows only, via the EXISTING
//     creditReferralToWallet primitive in wallet-store.ts (which itself
//     reuses insertLedgerRow's exact dedupe-then-increment idiom every
//     other wallet-store write path uses) — kind 'referral_credit',
//     NEVER Stripe, NEVER cash. The idempotency keys are the two exact
//     strings the plan mandates:
//       referral:referrer:<refereeOrgId>
//       referral:referee:<refereeOrgId>
//   • Amount is SF_REFERRAL_CREDIT_CENTS (default 500 cents = $5.00),
//     converted to micros via MICRO_PER_CENT so it lines up 1:1 with every
//     other wallet amount in the codebase.
//   • Wallet mode via resolveWalletStripeMode (the SAME key-derived
//     resolver every other metered call site uses) — a referral credit in
//     dev/test never lands in a 'live' wallet or vice-versa.
//
// DI'd (repo convention — mirrors fork-listing.ts) so the whole lifecycle
// unit-tests with fakes: no DB, no env leakage between tests. The two
// exported entry points (recordReferral / maybeCreditReferral) are thin
// wrappers that bind the REAL deps; every call site in the app imports
// ONLY these two functions (plus referralsEnabled for the cookie-capture
// gate) and never touches the DI'd core directly.

import { MICRO_PER_CENT } from "@/lib/build/run-cost";
// resolveBillingMode is pure (env → 'test'|'live', no DB/network import — see
// its own file header) and is exactly what wallet-store.ts re-exports as
// resolveWalletStripeMode. Safe to import eagerly at module scope (unlike the
// DB-backed deps below, which stay lazy so this file never pulls in a live
// connection just by being imported).
import { resolveBillingMode } from "@/lib/marketplace/billing/billing-mode";

// ─── the flag gate ───────────────────────────────────────────────────────

/** A plain env-like record — NodeJS.ProcessEnv | Record<string, string |
 *  undefined> (the repo convention, e.g. lib/emails/welcome.ts's
 *  pickFromAddress) so a bare `{ SF_REFERRALS_ENABLED: "true" }` fixture
 *  type-checks in tests without needing every ProcessEnv field (like
 *  NODE_ENV) populated. */
export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

/** True iff SF_REFERRALS_ENABLED is EXACTLY "true". Absent, "false", or any
 *  other value (garbage-tolerant — never throws, never half-enables on a
 *  typo like "1" or "TRUE") means disabled. This is the single switch that
 *  makes every referral entry point a no-op. */
export function referralsEnabled(env: EnvLike): boolean {
  return (env.SF_REFERRALS_ENABLED ?? "").trim() === "true";
}

/** SF_REFERRAL_CREDIT_CENTS default — $5.00. Exported so tests can assert
 *  the default without hardcoding a magic number twice. */
export const REFERRAL_CREDIT_CENTS_DEFAULT = 500;

/** Resolve the referral credit amount in CENTS from the environment,
 *  clamped to a non-negative integer (garbage/negative/zero env values fall
 *  back to the default rather than crediting nothing or a junk amount). */
function resolveReferralCreditCents(env: EnvLike): number {
  const raw = env.SF_REFERRAL_CREDIT_CENTS;
  if (raw === undefined) return REFERRAL_CREDIT_CENTS_DEFAULT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return REFERRAL_CREDIT_CENTS_DEFAULT;
  return Math.floor(parsed);
}

/** Cents → micro-dollars (matches every other wallet amount in the codebase —
 *  wallet-format.ts's MICRO_PER_CENT unit). */
function centsToMicros(cents: number): number {
  return Math.floor(cents) * MICRO_PER_CENT;
}

// ─── the two UNIQUE idempotency keys the plan mandates ──────────────────

/** The referrer's half of a credited referral pair. EXACT shape mandated by
 *  the plan — never change without a coordinated migration of any
 *  already-applied keys. */
export function referrerIdempotencyKey(refereeOrgId: string): string {
  return `referral:referrer:${refereeOrgId}`;
}

/** The referee's half of a credited referral pair. EXACT shape mandated by
 *  the plan. */
export function refereeIdempotencyKey(refereeOrgId: string): string {
  return `referral:referee:${refereeOrgId}`;
}

// ─── types ────────────────────────────────────────────────────────────────

/** Mirrors db/schema/referrals.ts's ReferralRow — kept as a local shape
 *  (rather than importing the Drizzle-inferred type) so this module and its
 *  tests never need a live DB connection to type-check. */
export type ReferralRow = {
  id: string;
  referrerOrgId: string;
  refereeOrgId: string;
  source: string;
  status: "pending" | "credited";
  createdAt: Date;
  creditedAt: Date | null;
};

export type RecordReferralArgs = {
  referrerOrgId: string;
  refereeOrgId: string;
  source: string;
};

/** The DI seam. Every real I/O this module performs — env reads, the
 *  referrals table, the wallet ledger — goes through here so
 *  recordReferral/maybeCreditReferral are pure control flow over fakes in
 *  tests. buildRealReferralsDeps() below binds the real DB + wallet-store. */
export type ReferralsDeps = {
  /** Plain env record (NOT process.env directly) — pure/testable, matches
   *  referralsEnabled's signature. */
  env: EnvLike;
  /** Look up the (at most one) referral row for a referee. Null when none
   *  recorded yet. */
  findReferralByRefereeOrgId: (refereeOrgId: string) => Promise<ReferralRow | null>;
  /** Insert a new 'pending' referral row. Returns null when the insert was a
   *  no-op (the UNIQUE(refereeOrgId) constraint already has a row for this
   *  referee — mirrors onConflictDoNothing().returning() returning empty). */
  insertReferral: (args: RecordReferralArgs) => Promise<ReferralRow | null>;
  /** Stamp a referral row 'credited' + creditedAt = now. */
  markReferralCredited: (id: string) => Promise<void>;
  /** The wallet-store credit primitive (creditReferralToWallet). DI'd so
   *  tests never touch a real wallet balance. */
  creditReferralToWallet: (args: {
    orgId: string;
    amountMicros: number;
    idempotencyKey: string;
    stripeMode: "test" | "live";
  }) => Promise<{ applied: boolean }>;
  /** The SAME key-derived resolver every other metered call site uses
   *  (wallet-store.ts's resolveWalletStripeMode, itself an alias for
   *  resolveBillingMode). Takes the env so it stays pure/DI'd here too. */
  resolveWalletStripeMode: (env: EnvLike) => "test" | "live";
};

// ─── recordReferral — attribution, stamped once at workspace creation ──

/**
 * Record that `refereeOrgId` was referred by `referrerOrgId` via `source`.
 * A pure no-op (writes NOTHING) when:
 *   • the flag is off (referralsEnabled(deps.env) is false), or
 *   • it's a self-referral (referrerOrgId === refereeOrgId), or
 *   • a referral for this refereeOrgId already exists (one row per referee
 *     EVER — insertReferral's UNIQUE(refereeOrgId) backstop; a second
 *     attempt with a DIFFERENT referrer/source still no-ops, so the first
 *     write always wins).
 * Never throws — every call site that invokes this must be fail-soft
 * regardless (a referral bug must never break /build or workspace
 * creation), and this function itself never surfaces a reason, only
 * whether anything happened.
 */
export async function recordReferral(
  args: RecordReferralArgs,
  deps: ReferralsDeps,
): Promise<void> {
  if (!referralsEnabled(deps.env)) return;
  if (!args.referrerOrgId || !args.refereeOrgId) return;
  if (args.referrerOrgId === args.refereeOrgId) return; // self-referral rejected

  await deps.insertReferral(args);
  // A null return (UNIQUE constraint already had a row for this referee) is
  // itself the desired no-op — nothing further to do either way.
}

// ─── maybeCreditReferral — the money-movement, idempotent ───────────────

export type MaybeCreditReferralResult = { credited: boolean };

/**
 * Credit BOTH the referrer and the referee a flat SF_REFERRAL_CREDIT_CENTS
 * bonus for a completed referral of `refereeOrgId`. Returns
 * `{ credited: false }` (crediting NOTHING) when:
 *   • the flag is off, or
 *   • no referral row exists for this referee, or
 *   • the referral row is already 'credited' (idempotent — a second call
 *     for the same referee is a pure no-op, no second ledger row for
 *     either party).
 * On the happy path (a 'pending' row exists, flag on): credits the
 * referrer via creditReferralToWallet with idempotency key
 * `referral:referrer:<refereeOrgId>`, then the referee with
 * `referral:referee:<refereeOrgId>`, both for the SAME amount and wallet
 * mode, then stamps the row 'credited' and returns `{ credited: true }`.
 * Never throws — callers (the deploy route) invoke this fail-soft.
 */
export async function maybeCreditReferral(
  refereeOrgId: string,
  deps: ReferralsDeps,
): Promise<MaybeCreditReferralResult> {
  if (!referralsEnabled(deps.env)) return { credited: false };
  if (!refereeOrgId) return { credited: false };

  const referral = await deps.findReferralByRefereeOrgId(refereeOrgId);
  if (!referral) return { credited: false };
  if (referral.status === "credited") return { credited: false }; // idempotent — already paid

  const creditCents = resolveReferralCreditCents(deps.env);
  const amountMicros = centsToMicros(creditCents);
  const stripeMode = deps.resolveWalletStripeMode(deps.env);

  await deps.creditReferralToWallet({
    orgId: referral.referrerOrgId,
    amountMicros,
    idempotencyKey: referrerIdempotencyKey(refereeOrgId),
    stripeMode,
  });
  await deps.creditReferralToWallet({
    orgId: referral.refereeOrgId,
    amountMicros,
    idempotencyKey: refereeIdempotencyKey(refereeOrgId),
    stripeMode,
  });

  await deps.markReferralCredited(referral.id);

  return { credited: true };
}

// ─── real deps (lazy — never imported in unit tests) ────────────────────

/** Build the real deps, binding the referrals table + the real wallet-store
 *  credit primitive + resolveWalletStripeMode. Lazy dynamic imports (mirrors
 *  fork-listing.ts's buildRealForkListingDeps) so this file has zero
 *  top-level DB/Drizzle imports and stays trivially importable from tests
 *  that only exercise the DI'd core above. */
export function buildRealReferralsDeps(): ReferralsDeps {
  return {
    env: process.env,
    findReferralByRefereeOrgId: async (refereeOrgId) => {
      const { db } = await import("@/db");
      const { referrals } = await import("@/db/schema/referrals");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.refereeOrgId, refereeOrgId))
        .limit(1);
      return row ?? null;
    },
    insertReferral: async (args) => {
      const { db } = await import("@/db");
      const { referrals } = await import("@/db/schema/referrals");
      const [created] = await db
        .insert(referrals)
        .values({
          referrerOrgId: args.referrerOrgId,
          refereeOrgId: args.refereeOrgId,
          source: args.source,
        })
        // Mirrors wallet-store.ts's dedupe idiom — a second insert for an
        // already-recorded referee (UNIQUE(referee_org_id)) is a no-op, not
        // a thrown constraint-violation error.
        .onConflictDoNothing({ target: referrals.refereeOrgId })
        .returning();
      return created ?? null;
    },
    markReferralCredited: async (id) => {
      const { db } = await import("@/db");
      const { referrals } = await import("@/db/schema/referrals");
      const { eq } = await import("drizzle-orm");
      await db
        .update(referrals)
        .set({ status: "credited", creditedAt: new Date() })
        .where(eq(referrals.id, id));
    },
    creditReferralToWallet: async (args) => {
      const { creditReferralToWallet } = await import("@/lib/build/wallet-store");
      const result = await creditReferralToWallet(args);
      return { applied: result.ok && result.applied === true };
    },
    // The SAME resolver wallet-store.ts exports as resolveWalletStripeMode
    // (a direct alias for this exact function) — reused here so there is
    // exactly ONE implementation of key-liveness in the codebase.
    resolveWalletStripeMode: resolveBillingMode,
  };
}
