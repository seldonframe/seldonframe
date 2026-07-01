// wallet store — the DB layer over the prepaid wallet (spec 1ff09dcb, P2).
//
// Bridges the PURE ledger (wallet-ledger.ts) to Postgres. The pure ops own the
// arithmetic + the invariants; this module owns persistence + the idempotency
// BACKSTOP. The DB is neon-http (stateless, single round-trip — NO interactive
// transactions), so money-safety here rests on two atomic primitives instead of
// a multi-statement tx:
//
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
import { db } from "@/db";
import {
  walletAccounts,
  walletTransactions,
  type WalletAccountRow,
  type WalletTransactionKind,
} from "@/db/schema/wallet";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";
import { debitIdempotencyKey } from "@/lib/build/wallet-ledger";

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
 *  balance on first touch. Idempotent via the UNIQUE(org_id, stripe_mode) index. */
export async function ensureWallet(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
): Promise<WalletAccountRow> {
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
}

/** The current balance (micro-dollars) for an org+mode. 0 when no wallet yet. */
export async function getWalletBalanceMicros(
  orgId: string,
  stripeMode: MarketplaceStripeMode = "test",
): Promise<number> {
  const [row] = await db
    .select({ balanceMicros: walletAccounts.balanceMicros })
    .from(walletAccounts)
    .where(and(eq(walletAccounts.orgId, orgId), eq(walletAccounts.stripeMode, stripeMode)))
    .limit(1);
  return nonNegMicros(row?.balanceMicros ?? 0);
}

/** Insert a ledger row keyed by idempotencyKey. Returns true if THIS call
 *  inserted it (money should move), false if a row already existed (duplicate →
 *  no-op). The UNIQUE(idempotency_key) constraint is the dedupe backstop. */
async function insertLedgerRow(args: {
  orgId: string;
  kind: WalletTransactionKind;
  amountMicros: number;
  idempotencyKey: string;
  runId?: string;
  stripeRef?: string;
}): Promise<boolean> {
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
 * on a duplicate.
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

  await ensureWallet(args.orgId, stripeMode);

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "topup",
    amountMicros: amount,
    idempotencyKey: key,
    stripeRef: args.stripeRef,
  });

  if (!fresh) {
    // Duplicate — credited already. Return the current balance, money unchanged.
    return {
      ok: true,
      balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode),
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
}

/**
 * Draw down the wallet for a successful run — a LEDGER decrement, NO Stripe call.
 * Idempotent on `runId` (key `debit:<runId>`): replaying the same run is a no-op
 * that debits ONCE. NEVER NEGATIVE: the balance UPDATE carries a
 * `WHERE balance_micros >= amount` guard, so if the balance can't cover it 0 rows
 * update — we then DELETE the just-inserted ledger row (so the run can be retried
 * once funded) and return "insufficient". The run endpoint also checks canAfford
 * BEFORE executing; this is the authoritative second line.
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

  // A 0-cost run draws nothing down — success, no ledger row.
  if (amount <= 0) {
    return {
      ok: true,
      balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode),
      applied: false,
      duplicate: false,
    };
  }

  await ensureWallet(args.orgId, stripeMode);
  const key = debitIdempotencyKey(runId);

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "debit",
    amountMicros: amount,
    idempotencyKey: key,
    runId,
  });

  if (!fresh) {
    // This run already debited — no-op (never double-debit).
    return {
      ok: true,
      balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode),
      applied: false,
      duplicate: true,
    };
  }

  // ATOMIC, NEVER-NEGATIVE decrement: only subtract when the balance covers it.
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
    // Guard failed — the balance can't cover it. Roll back the ledger row we just
    // inserted so this run can be retried after a top-up (and never half-debits).
    await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
    return { ok: false, reason: "insufficient" };
  }

  return {
    ok: true,
    balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
    applied: true,
    duplicate: false,
  };
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
 * report a full shortfall (nothing moved).
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

  await ensureWallet(args.orgId, stripeMode);
  const key = `voice:${callId}`;

  const balance = await getWalletBalanceMicros(args.orgId, stripeMode);
  const split = splitVoiceDrain(balance, amount);

  // Empty wallet — nothing to drain. Skip the insert (a 0-amount ledger row is
  // noise); the caller suspends the agent off the returned shortfall instead.
  if (split.drainedMicros === 0) {
    return {
      ok: true,
      applied: false,
      duplicate: false,
      drainedMicros: 0,
      shortfallMicros: split.shortfallMicros,
    };
  }

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "voice_debit",
    amountMicros: split.drainedMicros,
    idempotencyKey: key,
    runId: callId,
  });

  if (!fresh) {
    // This call already drained the wallet — no-op (never double-debit).
    return { ok: true, applied: false, duplicate: true, drainedMicros: 0, shortfallMicros: 0 };
  }

  let drained = split.drainedMicros;
  let shortfall = split.shortfallMicros;

  // ATOMIC, NEVER-NEGATIVE decrement: only subtract when the balance covers it.
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
    // A concurrent debit raced us between the read and the guarded update —
    // re-read the balance, re-split against the fresh number, and retry ONCE.
    const rebalance = await getWalletBalanceMicros(args.orgId, stripeMode);
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
      // Still can't drain anything — roll back the ledger row we inserted so
      // this call leaves no trace of a debit that never happened.
      await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
      return { ok: true, applied: false, duplicate: false, drainedMicros: 0, shortfallMicros: amount };
    }
  }

  return { ok: true, applied: true, duplicate: false, drainedMicros: drained, shortfallMicros: shortfall };
}

/**
 * Drain the wallet for a deployment's monthly phone number rental — a LEDGER
 * decrement, NO Stripe call. EXACTLY debitWalletForRun's shape/semantics: rent,
 * unlike voice minutes, IS refusable. Idempotent on `rent:<deploymentId>:
 * <monthKey>` — replaying the same month is a no-op. NEVER NEGATIVE: the
 * balance UPDATE carries a `WHERE balance_micros >= amount` guard; if the
 * balance can't cover it, 0 rows update and we DELETE the just-inserted ledger
 * row (so rent can be retried once funded) and return "insufficient".
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

  // A 0-cost rent draws nothing down — success, no ledger row.
  if (amount <= 0) {
    return {
      ok: true,
      balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode),
      applied: false,
      duplicate: false,
    };
  }

  await ensureWallet(args.orgId, stripeMode);
  const key = `rent:${deploymentId}:${monthKey}`;

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "number_rent",
    amountMicros: amount,
    idempotencyKey: key,
  });

  if (!fresh) {
    // This deployment's rent for this month already debited — no-op.
    return {
      ok: true,
      balanceMicros: await getWalletBalanceMicros(args.orgId, stripeMode),
      applied: false,
      duplicate: true,
    };
  }

  // ATOMIC, NEVER-NEGATIVE decrement: only subtract when the balance covers it.
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
    // Guard failed — the balance can't cover it. Roll back the ledger row so
    // this month's rent can be retried after a top-up.
    await db.delete(walletTransactions).where(eq(walletTransactions.idempotencyKey, key));
    return { ok: false, reason: "insufficient" };
  }

  return {
    ok: true,
    balanceMicros: nonNegMicros(decremented[0]?.balanceMicros ?? 0),
    applied: true,
    duplicate: false,
  };
}

/**
 * Accrue a builder's EARNING on a run they sold (cost − 5% fee), as a ledger
 * `earning` row keyed `earning:<runId>` (idempotent per run). This records what
 * the builder is owed; the actual payout via Connect is a follow-up. It does NOT
 * move the renter's balance (the debit already did) and adds to the SELLER org's
 * earnings ledger only — so it credits the seller wallet's running total of what
 * they've earned. Never throws on a duplicate.
 */
export async function accrueBuilderEarning(args: {
  sellerOrgId: string;
  runId: string;
  netMicros: number;
  stripeMode?: MarketplaceStripeMode;
}): Promise<{ ok: true; applied: boolean }> {
  const stripeMode = args.stripeMode ?? "test";
  const amount = nonNegMicros(args.netMicros);
  const runId = (args.runId ?? "").trim();
  if (amount <= 0 || !runId) return { ok: true, applied: false };

  const fresh = await insertLedgerRow({
    orgId: args.sellerOrgId,
    kind: "earning",
    amountMicros: amount,
    idempotencyKey: `earning:${runId}`,
    runId,
  });
  return { ok: true, applied: fresh };
}

/** Sum a builder's accrued earnings (micro-dollars) across all `earning` rows. */
export async function getBuilderEarningsMicros(sellerOrgId: string): Promise<number> {
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
}

/**
 * The builder's WITHDRAWABLE earnings (micro-dollars) = Σ earning − Σ payout,
 * clamped ≥ 0. This is what a payout may transfer (vs getBuilderEarningsMicros,
 * which stays GROSS — lifetime earned — for the "$X earned" surface + the payout
 * idempotency high-water mark). Org-scoped, mode-agnostic (mirrors the gross reader).
 */
export async function getWithdrawableEarningsMicros(sellerOrgId: string): Promise<number> {
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
}

/**
 * Record a completed payout as a `payout` ledger row (SUBTRACTS from withdrawable).
 * Idempotent on `payout:<transferId>` (the wallet ledger's UNIQUE dedupe backstop):
 * a re-record of the same Stripe transfer is a no-op → one transfer maps to exactly
 * one ledger row even if recordBuilderPayout is retried after a mid-flight crash.
 * Never throws on a duplicate.
 */
export async function recordBuilderPayout(args: {
  orgId: string;
  amountMicros: number;
  transferId: string;
}): Promise<{ ok: true; applied: boolean }> {
  const amount = nonNegMicros(args.amountMicros);
  const transferId = (args.transferId ?? "").trim();
  if (amount <= 0 || !transferId) return { ok: true, applied: false };

  const fresh = await insertLedgerRow({
    orgId: args.orgId,
    kind: "payout",
    amountMicros: amount,
    idempotencyKey: `payout:${transferId}`,
    stripeRef: transferId,
  });
  return { ok: true, applied: fresh };
}
