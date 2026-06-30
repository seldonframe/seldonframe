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
