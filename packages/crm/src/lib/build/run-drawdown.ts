// run drawdown — the per-run wallet GATE + DEBIT + EARNING, factored out of the
// run endpoint so the money path is unit-testable WITHOUT a DB or Stripe (spec
// 1ff09dcb, P2 Task 3).
//
// THE PER-RUN MONEY PATH (and what makes it safe):
//   1) gateRunAffordability(deps, org, cost) runs BEFORE execution. When billing
//      is ON and the cost is positive, it reads the balance and returns
//      allowed:false if the wallet can't cover it → the route 402s and does NOT
//      execute (no negative balance, no work done for free). Flag off or a 0-cost
//      run → allowed (today's behavior).
//   2) settleRunDrawdown(deps, …) runs ONLY AFTER a successful run. It DEBITS the
//      wallet — a LEDGER decrement, NO Stripe call (the only Stripe call in the
//      rail is the top-up) — idempotent on runId, and accrues the builder's
//      EARNING (cost − 5% fee) as a ledger `earning` row. An insufficient debit
//      at settle (a race after the gate) → charged:false + NO earning (never a
//      half-bill). Flag off / 0-cost → charged:false (unchanged).
//
// The deps are DB-backed in prod (wallet-store.ts) and faked in tests. This module
// has no DB/Stripe import — it's pure orchestration over the seams.

import type { RunCost } from "@/lib/build/run-cost";
import { MICRO_PER_CENT } from "@/lib/build/run-cost";

/** The wallet seams the drawdown needs. DB-backed in prod (wallet-store.ts). */
export type RunDrawdownDeps = {
  /** Whether marketplace billing is ON (isBillingEnabled(process.env)). When
   *  false, the wallet is NOT enforced and runs are never charged (today's path). */
  billingEnabled: boolean;
  /** Read the renter's current wallet balance (micro-dollars). */
  getBalanceMicros: (orgId: string) => Promise<number>;
  /** Debit the wallet for a successful run (idempotent on runId; never negative). */
  debitForRun: (input: {
    orgId: string;
    runId: string;
    amountMicros: number;
  }) => Promise<{ ok: boolean; balanceMicros?: number; applied?: boolean; duplicate?: boolean; reason?: string }>;
  /** Accrue the builder's earning (cost − fee) as a ledger `earning` row
   *  (idempotent on runId). Payout via Connect is a follow-up. */
  accrueEarning: (input: {
    sellerOrgId: string;
    runId: string;
    netMicros: number;
  }) => Promise<{ ok: boolean; applied?: boolean }>;
};

/** Clamp to a finite, non-negative integer of micros. */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

export type RunGateResult = {
  /** Whether the run may proceed. false ⇒ the route returns 402 + does NOT execute. */
  allowed: boolean;
  /** Whether the wallet was actually enforced (billing on + positive cost). When
   *  false the run is allowed because the wallet doesn't apply, not because it's
   *  funded. */
  enforced: boolean;
  /** The renter's balance at gate time (micro-dollars) — for the 402 body. */
  balanceMicros: number;
  /** The cost the gate checked (micro-dollars). */
  costMicros: number;
};

/**
 * The PRE-EXECUTION affordability gate. When billing is ON and the cost is
 * positive, read the balance and require balance ≥ cost. Flag off or a 0-cost run
 * → allowed (not enforced). Returns the balance + cost for the caller's 402 body.
 * Never throws beyond a deps failure.
 */
export async function gateRunAffordability(
  deps: RunDrawdownDeps,
  orgId: string,
  cost: RunCost,
): Promise<RunGateResult> {
  const costMicros = nonNegMicros(cost?.calculatedCost);

  // Not enforced: billing off, or a free run (nothing to pay).
  if (!deps.billingEnabled || costMicros <= 0) {
    return { allowed: true, enforced: false, balanceMicros: 0, costMicros };
  }

  const balanceMicros = nonNegMicros(await deps.getBalanceMicros(orgId));
  return {
    allowed: balanceMicros >= costMicros,
    enforced: true,
    balanceMicros,
    costMicros,
  };
}

export type SettleRunInput = {
  /** The renter org (the side whose wallet is debited). */
  renterOrgId: string;
  /** The builder/creator org (the side the earning accrues to). May be undefined
   *  for a tool run with no creator — then no earning is accrued. */
  sellerOrgId?: string;
  runId: string;
  cost: RunCost;
};

export type SettleRunResult = {
  /** True iff the wallet was actually debited for this run (or already had been —
   *  a duplicate). false ⇒ flag off, 0-cost, or an insufficient-balance race. */
  charged: boolean;
  /** The wallet balance after the debit (micro-dollars), when charged. */
  balanceMicros?: number;
};

/**
 * Settle a SUCCESSFUL run: DEBIT the renter's wallet (ledger only, NO Stripe) and
 * accrue the builder's EARNING. Idempotent on runId. Returns charged:true (+ the
 * new balance) when the debit applied (or was a duplicate). Flag off, a 0-cost
 * run, or an insufficient debit (a post-gate race) → charged:false and NO earning
 * (never a half-bill). The earning accrual is itself idempotent on runId in the
 * store, so it is safe to call on a duplicate debit.
 */
export async function settleRunDrawdown(
  deps: RunDrawdownDeps,
  input: SettleRunInput,
): Promise<SettleRunResult> {
  const costMicros = nonNegMicros(input.cost?.calculatedCost);

  // Flag off or a free run → never charged (today's money-safe behavior).
  if (!deps.billingEnabled || costMicros <= 0) {
    return { charged: false };
  }

  const debit = await deps.debitForRun({
    orgId: input.renterOrgId,
    runId: input.runId,
    amountMicros: costMicros,
  });

  if (!debit.ok) {
    // Insufficient at settle (a race after the gate) → do NOT accrue an earning
    // for an unbilled run.
    return { charged: false };
  }

  // Accrue the builder's net (cost − 5% fee) as an `earning` row. Idempotent on
  // runId in the store, so a duplicate debit re-accrue is safe. Only when there's
  // a creator org to credit.
  const netMicros = nonNegMicros(input.cost?.netCents) * MICRO_PER_CENT;
  if (input.sellerOrgId && netMicros > 0) {
    await deps.accrueEarning({
      sellerOrgId: input.sellerOrgId,
      runId: input.runId,
      netMicros,
    });
  }

  return { charged: true, balanceMicros: debit.balanceMicros };
}
