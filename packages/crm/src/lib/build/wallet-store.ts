// wallet store — the DB layer over the prepaid wallet (spec 1ff09dcb, P2).
//
// Bridges the PURE ledger (wallet-ledger.ts) to Postgres. The pure ops own the
// arithmetic + the invariants; this module owns persistence + the idempotency
// BACKSTOP.
//
// Postgres RLS Phase 1 (spec docs/superpowers/specs/2026-07-03-postgres-rls-
// defense-in-depth-design.md): every function below now opens its DB work
// through withOrgRls(orgId, tx => …) instead of the raw module-level `db`.
// withOrgRls is INERT until Max sets DATABASE_URL_APP — until then it passes
// `tx` through as the exact same `db` these functions always used, so this
// rewiring is a no-op in behavior today and only starts enforcing tenant
// isolation at the database layer once the env var is set. See src/db/rls.ts
// for the full mechanism.
//
// Money-safety invariants (UNCHANGED by this rewiring — RLS is a second,
// independent lock, not a replacement):
//   1) INSERT the ledger row first with onConflictDoNothing on the UNIQUE
//      idempotency_key. If nothing inserted → it's a DUPLICATE (a webhook
//      re-delivery, or the same runId twice) → we no-op and return the current
//      balance. This is what makes top-ups + per-run debits impossible to apply
//      twice even under a race: the UNIQUE constraint, not a read-then-write.
//   2) Only AFTER the row inserted, apply the balance delta with ONE guarded
//      UPDATE:
//        • top-up/earning → balance += amount (unconditional add).
//        • debit          → balance -= amount WHERE balance >= amount (atomic;
//          can never drive the balance negative — if the guard fails, 0 rows
//          update and we surface "insufficient").
//
// Because the ledger row is the source of truth and the balance is a denormalized
// running total guarded atomically, a crash between (1) and (2) self-heals:
// reconcileBalance() can recompute balance from SUM(ledger) at any time. The pure
// canAfford gate still runs in the RUN ENDPOINT before execution (a 402 path);
// this store is the authoritative second line that no debit ever goes negative.
//
// MONEY-SAFE + inert: a wallet starts empty; with no Stripe key there are no
// top-ups, so every paid run 402s. stripeMode partitions wallets so a test top-up
// never funds a live run.

import { and, eq, sql } from "drizzle-orm";
import { withOrgRls, type RlsDb } from "@/db/rls";
import {
  walletAccounts,
  walletTransactions,
  type WalletAccountRow,
  type WalletTransactionKind,
} from "@/db/schema/wallet";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";
import { debitIdempotencyKey } from "@/lib/build/wallet-ledger";
import { resolveBillingMode } from "@/lib/marketplace/billing/billing-mode";

/**
 * resolveWalletStripeMode — the SAME key-derived resolver every metered call
 * site (voice webhook accept-gate + debit, SF-managed number rent, the rent
 * cron, Tier-0 readiness) must use to pick a wallet, re-exported here so
 * telephony/voice code doesn't need to import from `lib/marketplace/billing`.
 * Deliberately NOT a reimplementation — `resolveBillingMode` is already the
 * exact key-derived source the top-up credit path (wallet-topup.ts) and the
 * existing debit/read paths (run-drawdown-deps.ts, wallet/balance/route.ts)
 * use, so this alias guarantees the wallet a top-up credits is always the
 * wallet every metered path debits, with zero risk of a second
 * implementation drifting out of sync. Pure; no I/O.
 */
export const resolveWalletStripeMode = resolveBillingMode;

/** The result of a credit/debit: the new balance (micro-dollars) + whether the
 *  op actually moved money (`applied`) or was an idempotent no-op (`duplicate`).
 *  A debit that the balance couldn't cover is `{ ok:false, reason:"insufficient" }`. */
export type WalletApplyResult =
  | { ok: true; balanceMicros: number; applied: boolean; duplicate: boolean }
  | { ok: false; reason: "insufficient" | "invalid" };

/** Clamp to a finite, non-negative integer of micros (mirrors the pure ledger). */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/** Ensure (and return) the org's wallet row for a Stripe mode, creating it at a 0
 *  balance on first touch. Idempotent via the UNIQUE(org_id, stripe_mode) index.
 *  Runs inside the caller's withOrgRls tx when called from another store
 *  function (pass `tx` through); opens its OWN withOrgRls when called directly. */
export async function ensureWallet(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
  tx?: RlsDb,
): Promise<WalletAccountRow> {
  const run = async (db: RlsDb) => {
    await db
      .insert(walletAccounts)
      .values({ orgId, stripeMode, balanceMicros: 0 })
      .onConflictDoNothing({ target: [walletAccounts.orgId, walletAccounts.stripeMode] });
    const [row] = await db
      .select()
      .from(walletAccounts)
      .where(and(eq(walletAccounts.orgId, orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .limit(1);
    if (!row) throw new Error("wallet_accounts upsert returned no row");
    return row;
  };
  return tx ? run(tx) : withOrgRls(orgId, run);
}

/** The current balance (micro-dollars) for an org+mode. 0 when no wallet yet. */
export async function getWalletBalanceMicros(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
  tx?: RlsDb,
): Promise<number> {
  const run = async (db: RlsDb) => {
    const [row] = await db
      .select({ balanceMicros: walletAccounts.balanceMicros })
      .from(walletAccounts)
      .where(and(eq(walletAccounts.orgId, orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .limit(1);
    return nonNegMicros(row?.balanceMicros ?? 0);
  };
  return tx ? run(tx) : withOrgRls(orgId, run);
}

/** Insert a ledger row keyed by idempotencyKey. Returns true if THIS call
 *  inserted it (money should move), false if a row already existed (duplicate →
 *  no-op). The UNIQUE(idempotency_key) constraint is the dedupe backstop.
 *  Always called from WITHIN another function's withOrgRls tx — never opens
 *  its own, since it has no independent entry point. */
async function insertLedgerRow(
  db: RlsDb,
  args: {
    orgId: string;
    kind: WalletTransactionKind;
    amountMicros: number;
    idempotencyKey: string;
    runId?: string;
    stripeRef?: string;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(walletTransactions)
    .values({
      orgId: args.orgId,
      kind: args.kind,
      amountMicros: args.amountMicros,
      idempotencyKey: args.idempotencyKey,
      runId: args.runId ?? null,
      stripeRef: args.stripeRef ?? null,
    })
    .onConflictDoNothing({ target: walletTransactions.idempotencyKey })
    .returning({ id: walletTransactions.id });
  return inserted.length > 0;
}

/**
 * Credit a top-up (money IN). Idempotent on `idempotencyKey` (the Stripe session
 * id) — a re-applied credit (webhook re-delivery) is a no-op that credits ONCE.
 * Steps: ensure the wallet → insert the ledger row (dedupe backstop) → on a fresh
 * insert, balance += amount. Returns the new balance. Never negative; never throws
 * on a duplicate. The whole sequence runs inside ONE withOrgRls tx.
 */
export async function creditTopupToWallet(args: {
  orgId: string;
  amountMicros: number;
  idempotencyKey: string;
  stripeMode?: MarketplaceStripeMode;
  stripeRef?: string;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const key = (args.idempotencyKey ?? "").trim();
  if (amount <= 0 || !key) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "topup",
      amountMicros: amount,
      idempotencyKey: key,
      stripeRef: args.stripeRef,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const [updated] = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(walletAccounts.orgId, args.orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    return {
      ok: true,
      balanceMicros: nonNegMicros(updated?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Draw down the wallet for a successful run — a LEDGER decrement, NO Stripe call.
 * Idempotent on `runId` (key `debit:<runId>`): replaying the same run is a no-op
 * that debits ONCE. NEVER NEGATIVE: the balance UPDATE carries a
 * `WHERE balance_micros >= amount` guard, so if the balance can't cover it 0 rows
 * update — we then DELETE the just-inserted ledger row (so the run can be retried
 * once funded) and return "insufficient". The run endpoint also checks canAfford
 * BEFORE executing; this is the authoritative second line. Runs inside ONE
 * withOrgRls tx.
 */
export async function debitWalletForRun(args: {
  orgId: string;
  runId: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const runId = (args.runId ?? "").trim();
  if (!runId) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    if (amount <= 0) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: false,
      };
    }

    await ensureWallet(args.orgId, stripeMode, db);
    const key = debitIdempotencyKey(runId);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "debit",
      amountMicros: amount,
      idempotencyKey: key,
      runId,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${amount}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
      return { ok: false, reason: "insufficient" };
    }

    return {
      ok: true,
      balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/** Pure drain split: how much of a voice debit the balance can cover. Voice
 *  minutes are never refusable after the fact (unlike a build run) — the
 *  wallet drains `LEAST(balance, amount)` instead of rejecting the whole
 *  debit, and the caller acts on the returned shortfall (e.g. suspending the
 *  agent) rather than the debit itself failing. Garbage-tolerant: negative/NaN
 *  inputs clamp to 0 via nonNegMicros. */
export function splitVoiceDrain(
  balanceMicros: number,
  amountMicros: number,
): { drainedMicros: number; shortfallMicros: number } {
  const bal = nonNegMicros(balanceMicros);
  const amt = nonNegMicros(amountMicros);
  const drained = Math.min(bal, amt);
  return { drainedMicros: drained, shortfallMicros: amt - drained };
}

/**
 * Drain the wallet for a voice call's metered usage — a LEDGER decrement, NO
 * Stripe call. UNLIKE debitWalletForRun, this NEVER refuses: minutes already
 * spoken can't be un-spoken, so on insufficient balance it drains whatever the
 * wallet has (`splitVoiceDrain`) and returns the shortfall for the caller to
 * act on (e.g. suspending the agent), rather than failing the debit. Idempotent
 * on `callId` (key `voice:<callId>`) — replaying the same call is a no-op.
 *
 * The ledger records what was actually TAKEN (`drainedMicros`), never the
 * amount owed — the ledger states money movement, not debt. An empty wallet
 * (drainedMicros === 0) skips the insert entirely (a 0-amount row is noise).
 *
 * NEVER NEGATIVE: the balance UPDATE carries a `WHERE balance_micros >=
 * drainedMicros` guard (drained ≤ the balance we read, so it normally
 * succeeds); if a concurrent debit races us and the guard fails, we re-read +
 * re-split ONCE and retry, otherwise we DELETE the just-inserted ledger row and
 * report a full shortfall (nothing moved). All of this runs inside ONE
 * withOrgRls tx.
 */
export async function debitVoiceUsage(args: {
  orgId: string;
  callId: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<{
  ok: true;
  applied: boolean;
  duplicate: boolean;
  drainedMicros: number;
  shortfallMicros: number;
}> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const callId = (args.callId ?? "").trim();
  if (amount <= 0 || !callId) {
    return { ok: true, applied: false, duplicate: false, drainedMicros: 0, shortfallMicros: 0 };
  }

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);
    const key = `voice:${callId}`;

    const balance = await getWalletBalanceMicros(args.orgId, stripeMode, db);
    const split = splitVoiceDrain(balance, amount);

    if (split.drainedMicros === 0) {
      return {
        ok: true,
        applied: false,
        duplicate: false,
        drainedMicros: 0,
        shortfallMicros: split.shortfallMicros,
      };
    }

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "voice_debit",
      amountMicros: split.drainedMicros,
      idempotencyKey: key,
      runId: callId,
    });

    if (!fresh) {
      return { ok: true, applied: false, duplicate: true, drainedMicros: 0, shortfallMicros: 0 };
    }

    let drained = split.drainedMicros;
    let shortfall = split.shortfallMicros;

    let decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${drained}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${drained}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      const rebalance = await getWalletBalanceMicros(args.orgId, stripeMode, db);
      const resplit = splitVoiceDrain(rebalance, amount);
      drained = resplit.drainedMicros;
      shortfall = resplit.shortfallMicros;

      if (drained > 0) {
        decremented = await db
          .update(walletAccounts)
          .set({
            balanceMicros: sql`${walletAccounts.balanceMicros} - ${drained}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(walletAccounts.orgId, args.orgId),
              eq(walletAccounts.stripeMode, stripeMode),
              sql`${walletAccounts.balanceMicros} >= ${drained}`,
            ),
          )
          .returning({ balanceMicros: walletAccounts.balanceMicros });
      }

      if (drained === 0 || decremented.length === 0) {
        await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
        return { ok: true, applied: false, duplicate: false, drainedMicros: 0, shortfallMicros: amount };
      }

      await db
        .update(walletTransactions)
        .set({ amountMicros: drained })
        .where(eq(walletTransactions.idempotencyKey, key));
    }

    return { ok: true, applied: true, duplicate: false, drainedMicros: drained, shortfallMicros: shortfall };
  });
}

/**
 * Drain the wallet for a deployment's monthly phone number rental — a LEDGER
 * decrement, NO Stripe call. EXACTLY debitWalletForRun's shape/semantics: rent,
 * unlike voice minutes, IS refusable. Idempotent on `rent:<deploymentId>:
 * <monthKey>` — replaying the same month is a no-op. NEVER NEGATIVE: the
 * balance UPDATE carries a `WHERE balance_micros >= amount` guard; if the
 * balance can't cover it, 0 rows update and we DELETE the just-inserted ledger
 * row (so rent can be retried once funded) and return "insufficient". Runs
 * inside ONE withOrgRls tx.
 *
 * Called by /api/cron/voice-rent per-deployment, each with THAT deployment's
 * own orgId — the cron's overall sweep is cross-org, but each individual
 * debitNumberRent call here is correctly single-org-scoped (see this plan's
 * Locate-first item 5 for why the cron itself needs no other change).
 */
export async function debitNumberRent(args: {
  orgId: string;
  deploymentId: string;
  monthKey: string;
  amountMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const deploymentId = (args.deploymentId ?? "").trim();
  const monthKey = (args.monthKey ?? "").trim();
  if (!deploymentId || !monthKey) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    if (amount <= 0) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: false,
      };
    }

    await ensureWallet(args.orgId, stripeMode, db);
    const key = `rent:${deploymentId}:${monthKey}`;

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "number_rent",
      amountMicros: amount,
      idempotencyKey: key,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const decremented = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(walletAccounts.orgId, args.orgId),
          eq(walletAccounts.stripeMode, stripeMode),
          sql`${walletAccounts.balanceMicros} >= ${amount}`,
        ),
      )
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    if (decremented.length === 0) {
      await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
      return { ok: false, reason: "insufficient" };
    }

    return {
      ok: true,
      balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Accrue a builder's EARNING on a run they sold (cost − 5% fee), as a ledger
 * `earning` row keyed `earning:<runId>` (idempotent per run). This records what
 * the builder is owed; the actual payout via Connect is a follow-up. It does NOT
 * move the renter's balance (the debit already did) and adds to the SELLER org's
 * earnings ledger only — so it credits the seller wallet's running total of what
 * they've earned. Never throws on a duplicate. Scoped to the SELLER org's
 * withOrgRls context (the org whose earnings ledger this row belongs to).
 */
export async function accrueBuilderEarning(args: {
  sellerOrgId: string;
  runId: string;
  netMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.netMicros);
  const runId = (args.runId ?? "").trim();
  if (amount <= 0 || !runId) return { ok: true, applied: false };

  return withOrgRls(args.sellerOrgId, async (db) => {
    const fresh = await insertLedgerRow(db, {
      orgId: args.sellerOrgId,
      kind: "earning",
      amountMicros: amount,
      idempotencyKey: `earning:${runId}`,
      runId,
    });
    return { ok: true, applied: fresh };
  });
}

/** Sum a builder's accrued earnings (micro-dollars) across all `earning` rows.
 *  Scoped to the seller org's withOrgRls context. */
export async function getBuilderEarningsMicros(sellerOrgId: string): Promise<number> {
  return withOrgRls(sellerOrgId, async (db) => {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${walletTransactions.amountMicros}), 0)`,
      })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.orgId, sellerOrgId),
          eq(walletTransactions.kind, "earning"),
        ),
      );
    return nonNegMicros(Number(row?.total ?? 0));
  });
}

/**
 * The builder's WITHDRAWABLE earnings (micro-dollars) = Σ earning − Σ payout,
 * clamped ≥ 0. This is what a payout may transfer (vs getBuilderEarningsMicros,
 * which stays GROSS — lifetime earned — for the "$X earned" surface + the payout
 * idempotency high-water mark). Org-scoped, mode-agnostic (mirrors the gross reader).
 */
export async function getWithdrawableEarningsMicros(sellerOrgId: string): Promise<number> {
  return withOrgRls(sellerOrgId, async (db) => {
    const [row] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CASE
          WHEN ${walletTransactions.kind} = 'earning' THEN ${walletTransactions.amountMicros}
          WHEN ${walletTransactions.kind} = 'payout' THEN -${walletTransactions.amountMicros}
          ELSE 0 END), 0)`,
      })
      .from(walletTransactions)
      .where(eq(walletTransactions.orgId, sellerOrgId));
    return nonNegMicros(Number(row?.total ?? 0));
  });
}

/**
 * Credit a referral bonus (money IN, virality pack Task 5) — a LEDGER
 * increment, NEVER Stripe. This is the SAME shape as creditTopupToWallet
 * (ensure the wallet → insert the ledger row as the dedupe backstop → on a
 * fresh insert, balance += amount), generalized only in that the caller
 * supplies the idempotency key directly rather than deriving it from a
 * Stripe session id — lib/growth/referrals.ts passes the two UNIQUE keys the
 * plan mandates (`referral:referrer:<refereeOrgId>` /
 * `referral:referee:<refereeOrgId>`), one per side of the referral, so each
 * side can be credited independently and idempotently. Idempotent on
 * `idempotencyKey`: a replayed call (maybeCreditReferral called twice for an
 * already-credited referee) is a no-op that credits ONCE. Never throws. Runs
 * inside ONE withOrgRls tx.
 */
export async function creditReferralToWallet(args: {
  orgId: string;
  amountMicros: number;
  idempotencyKey: string;
  stripeMode?: MarketplaceStripeMode;
}): Promise<WalletApplyResult> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.amountMicros);
  const key = (args.idempotencyKey ?? "").trim();
  if (amount <= 0 || !key) return { ok: false, reason: "invalid" };

  return withOrgRls(args.orgId, async (db) => {
    await ensureWallet(args.orgId, stripeMode, db);

    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "referral_credit",
      amountMicros: amount,
      idempotencyKey: key,
    });

    if (!fresh) {
      return {
        ok: true,
        balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode, db),
        applied: false,
        duplicate: true,
      };
    }

    const [updated] = await db
      .update(walletAccounts)
      .set({
        balanceMicros: sql`${walletAccounts.balanceMicros} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(walletAccounts.orgId, args.orgId), eq(walletAccounts.stripeMode, stripeMode)))
      .returning({ balanceMicros: walletAccounts.balanceMicros });

    return {
      ok: true,
      balanceMicros: nonNegMicros(updated?.balanceMicros ?? 0),
      applied: true,
      duplicate: false,
    };
  });
}

/**
 * Record a completed payout as a `payout` ledger row (SUBTRACTS from withdrawable).
 * Idempotent on `payout:<transferId>` (the wallet ledger's UNIQUE dedupe backstop):
 * a re-record of the same Stripe transfer is a no-op → one transfer maps to exactly
 * one ledger row even if recordBuilderPayout is retried after a mid-flight crash.
 * Never throws on a duplicate. Scoped to the payee org's withOrgRls context.
 */
export async function recordBuilderPayout(args: {
  orgId: string;
  amountMicros: number;
  transferId: string;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.amountMicros);
  const transferId = (args.transferId ?? "").trim();
  if (amount <= 0 || !transferId) return { ok: true, applied: false };

  return withOrgRls(args.orgId, async (db) => {
    const fresh = await insertLedgerRow(db, {
      orgId: args.orgId,
      kind: "payout",
      amountMicros: amount,
      idempotencyKey: `payout:${transferId}`,
      stripeRef: transferId,
    });
    return { ok: true, applied: fresh };
  });
}
