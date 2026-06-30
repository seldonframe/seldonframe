// wallet ledger — the PURE prepaid-wallet ledger ops (spec 1ff09dcb, P2 Task 1).
//
// MONEY-SAFETY: this is the accounting core of the REAL money path (the prepaid
// wallet a Stripe top-up funds and every build run draws down). It is PURE — no
// IO, no Stripe, no clock, no env — so it's exhaustively unit-testable without a
// card. The DB store (wallet-store.ts) wraps these: it loads the current
// WalletState, calls one op, and persists the returned transaction inside a
// transaction with a UNIQUE(idempotencyKey) constraint as the last-line backstop.
//
// The three invariants these functions GUARANTEE:
//   • NEVER NEGATIVE — debitForRun rejects ("insufficient") when balance < cost;
//     it never drives the balance below 0. An exact-balance debit lands at 0.
//   • IDEMPOTENT ON runId — a run can never double-debit. Replaying debitForRun
//     with a runId already in `debitedRunIds` returns the SAME balance + no new
//     transaction (duplicate:true).
//   • IDEMPOTENT ON idempotencyKey — a top-up credit whose key is already in
//     `appliedKeys` (a Stripe webhook re-delivery) credits ONCE.
//
// Accounting unit is MICRO-DOLLARS ($1 = 1_000_000 micros), matching run-cost.ts
// (computeRunCost.calculatedCost) so the cost computed by the run path debits the
// wallet 1:1 with no rounding.

/** The kind of a wallet transaction. `topup` = money in (Stripe Checkout);
 *  `debit` = a per-run drawdown (the ledger decrement — NO Stripe call); the
 *  `earning` accrual (builder's net) is recorded by the run path, not minted here. */
export type WalletTransactionKind = "topup" | "debit" | "earning";

/** A transaction the store should PERSIST. Pure data — the store stamps the id +
 *  createdAt. `idempotencyKey` is UNIQUE (the dedupe backstop); `runId` is set on
 *  debits/earnings; `stripeRef` is the Stripe session/event id on top-ups. */
export type WalletTransaction = {
  orgId: string;
  kind: WalletTransactionKind;
  /** Always a positive integer of micro-dollars (the magnitude of the move). */
  amountMicros: number;
  /** The run this transaction belongs to (debit/earning), if any. */
  runId?: string;
  /** The Stripe session/event id backing a top-up, if any. */
  stripeRef?: string;
  /** The UNIQUE dedupe key (topup: the Stripe session id; debit: derived from runId). */
  idempotencyKey: string;
};

/** The current wallet snapshot the pure ops read. The store builds this from the
 *  wallet_accounts balance + the set of already-applied idempotency keys and the
 *  set of runIds already debited (both derived from wallet_transactions). */
export type WalletState = {
  /** Current balance in micro-dollars (≥ 0 — never negative). */
  balanceMicros: number;
  /** Idempotency keys already applied (for credit dedupe). */
  appliedKeys: Set<string>;
  /** runIds already debited (for the per-run double-debit guard). */
  debitedRunIds: Set<string>;
};

/** A successful op: the new state, and the transaction to persist (absent when
 *  the op was a no-op: a duplicate, or a 0-amount debit). `duplicate` flags an
 *  idempotent replay (the store must NOT insert a second transaction). */
export type LedgerOk = {
  ok: true;
  state: WalletState;
  transaction?: WalletTransaction;
  duplicate?: boolean;
};

/** A rejected op. `insufficient` = the balance can't cover the debit (the 402
 *  path); `invalid` = bad input (non-positive top-up, missing key). NEVER throws. */
export type LedgerReject = { ok: false; reason: "insufficient" | "invalid" };

export type LedgerResult = LedgerOk | LedgerReject;

/** Clamp to a finite, non-negative integer of micros; junk/negative → 0. Mirrors
 *  run-cost.ts's nonNegInt so the two money paths round identically. */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/** Read the current balance (micro-dollars). */
export function balanceMicros(state: WalletState): number {
  return nonNegMicros(state.balanceMicros);
}

/**
 * Can the wallet cover a run that costs `costMicros`? True iff balance ≥ cost.
 * A non-positive / junk cost clamps to 0 (a free run is always affordable, never
 * blocked on bad input). This is the gate the run endpoint checks BEFORE executing
 * — a false here returns 402 and the run does NOT run. Pure; never throws.
 */
export function canAfford(state: WalletState, costMicros: number): boolean {
  return balanceMicros(state) >= nonNegMicros(costMicros);
}

export type CreditTopupInput = {
  orgId: string;
  /** The top-up amount in micro-dollars (must be > 0). */
  amountMicros: number;
  /** UNIQUE dedupe key — the Stripe Checkout session id (so a webhook re-delivery
   *  credits once). REQUIRED: a credit with no key can't be deduped → rejected. */
  idempotencyKey: string;
  /** The Stripe session/event id recorded on the row (often == idempotencyKey). */
  stripeRef?: string;
};

/**
 * Credit a top-up (money IN). Returns the new state + a `topup` transaction, or:
 *   • a no-op `{ ok:true, duplicate:true }` (balance unchanged, no transaction)
 *     when the idempotencyKey was already applied — credits ONCE.
 *   • `{ ok:false, reason:"invalid" }` for a non-positive/non-finite amount or a
 *     missing idempotencyKey (no zero/negative/un-dedupable credit row).
 * Pure; never throws.
 */
export function creditTopup(state: WalletState, input: CreditTopupInput): LedgerResult {
  const key = (input.idempotencyKey ?? "").trim();
  if (!key) return { ok: false, reason: "invalid" };

  const amount = nonNegMicros(input.amountMicros);
  if (amount <= 0) return { ok: false, reason: "invalid" };

  // IDEMPOTENT: an already-applied key credits once.
  if (state.appliedKeys.has(key)) {
    return { ok: true, state, duplicate: true };
  }

  const nextKeys = new Set(state.appliedKeys);
  nextKeys.add(key);

  const transaction: WalletTransaction = {
    orgId: input.orgId,
    kind: "topup",
    amountMicros: amount,
    idempotencyKey: key,
    ...(input.stripeRef ? { stripeRef: input.stripeRef } : {}),
  };

  return {
    ok: true,
    state: {
      balanceMicros: balanceMicros(state) + amount,
      appliedKeys: nextKeys,
      debitedRunIds: state.debitedRunIds,
    },
    transaction,
  };
}

/** The idempotency key for a run's debit — derived from the runId so a run can
 *  only ever debit ONCE (the UNIQUE(idempotencyKey) backstop enforces this even
 *  under a race). Exported so the run path + the store agree on the key. */
export function debitIdempotencyKey(runId: string): string {
  return `debit:${runId}`;
}

export type DebitForRunInput = {
  orgId: string;
  /** The run being charged. Its debit is idempotent on this id. */
  runId: string;
  /** The cost in micro-dollars (computeRunCost.calculatedCost). */
  amountMicros: number;
};

/**
 * Draw down the wallet for a successful run — a LEDGER decrement, NO Stripe call.
 * Returns the new state + a `debit` transaction, or:
 *   • `{ ok:false, reason:"insufficient" }` when balance < cost — the balance is
 *     UNCHANGED and never goes negative (the run endpoint must 402 + NOT execute,
 *     but this guard also protects a post-execution debit).
 *   • a no-op `{ ok:true, duplicate:true }` when this runId was already debited
 *     (idempotent — a run NEVER double-debits).
 *   • a no-op `{ ok:true }` with no transaction when the cost is 0 (a free run
 *     records no debit row).
 * Pure; never throws.
 */
export function debitForRun(state: WalletState, input: DebitForRunInput): LedgerResult {
  const runId = (input.runId ?? "").trim();
  if (!runId) return { ok: false, reason: "invalid" };

  const amount = nonNegMicros(input.amountMicros);

  // A 0-cost run draws nothing down — success, but no debit row.
  if (amount <= 0) return { ok: true, state };

  // IDEMPOTENT: a run already debited is a no-op (never double-debit).
  if (state.debitedRunIds.has(runId)) {
    return { ok: true, state, duplicate: true };
  }

  // NEVER NEGATIVE: reject when the balance can't cover it.
  if (balanceMicros(state) < amount) {
    return { ok: false, reason: "insufficient" };
  }

  const nextRunIds = new Set(state.debitedRunIds);
  nextRunIds.add(runId);
  const key = debitIdempotencyKey(runId);
  const nextKeys = new Set(state.appliedKeys);
  nextKeys.add(key);

  const transaction: WalletTransaction = {
    orgId: input.orgId,
    kind: "debit",
    amountMicros: amount,
    runId,
    idempotencyKey: key,
  };

  return {
    ok: true,
    state: {
      balanceMicros: balanceMicros(state) - amount,
      appliedKeys: nextKeys,
      debitedRunIds: nextRunIds,
    },
    transaction,
  };
}
