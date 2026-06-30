// run cost — the pure run-cost calculator (spec 1ff09dcb, P1 Task 3).
//
// MONEY-SAFETY: this is the heart of P1's "calculate, don't charge" contract. It
// computes what a SUCCESSFUL run WOULD cost — Monid's billing.calculatedCost, in
// MICRO-DOLLARS — but moves NO money. The run endpoint records this as a usage
// event (the meter); the actual drawdown is the prepaid WALLET in P2. An errored
// run never reaches here (it records cost 0, not billable).
//
// The three pricing rules (from the catalog price):
//   • per_call    — a FLAT amount per run (resultCount ignored).
//   • per_result  — base + amount × items (Monid's PER_RESULT). resultCount is
//                   how many items the run returned; defaults to 1.
//   • per_outcome — a FLAT amount per billable outcome (one successful run = one
//                   outcome on this rail), like per_call.
//
// The 5% marketplace fee is echoed (feeCents/netCents) from the SAME primitive
// the checkout + earnings + x402 rail use (computeMarketplaceFeeCents), so the
// builder's "you keep 95%" is exact and consistent. Pure — no IO, no clock, no
// env, no "use server". Never throws; every amount clamps to a non-negative whole
// number of cents.

import { computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import type { CatalogPrice } from "@/lib/build/discover";

/** Micro-dollars per cent. $1 = 1_000_000 micro-dollars (Monid's accounting
 *  unit), so 1 cent = 10_000 micro-dollars. Exported so the wire echo + any P2
 *  wallet math share the one constant. */
export const MICRO_PER_CENT = 10_000;

/** The computed cost of a run. `calculatedCost` is the micro-dollar figure (the
 *  Monid field name); `amountCents` is the same in whole cents; fee/net split it
 *  by the 5% marketplace fee. NONE of these is charged in P1 — they're recorded. */
export type RunCost = {
  /** What the run would cost the renter, in cents (≥ 0, integer). */
  amountCents: number;
  /** The same amount in micro-dollars (amountCents × MICRO_PER_CENT) — Monid's
   *  billing.calculatedCost. */
  calculatedCost: number;
  /** SF's 5% marketplace fee on the amount, in cents. */
  feeCents: number;
  /** What the builder keeps after the fee (amountCents − feeCents). */
  netCents: number;
};

/** Clamp to a finite, non-negative integer (cents/items); junk/negative → 0. */
function nonNegInt(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/**
 * Compute the (uncharged) cost of one successful run.
 *
 * @param price        the entry's catalog price (per_call | per_result | per_outcome).
 * @param resultCount  how many items the run returned (per_result only; default 1).
 *                     Ignored for per_call / per_outcome (a single flat charge).
 * Pure; never throws. The returned amount is always a non-negative integer of
 * cents, with the matching micro-dollar figure and the 5% fee/net split.
 */
export function computeRunCost(price: CatalogPrice, resultCount?: number): RunCost {
  const unit = nonNegInt(price?.amountCents);
  const base = nonNegInt(price?.baseCents);

  let amountCents: number;
  switch (price?.type) {
    case "per_result": {
      // resultCount defaults to 1 (one run, one item) when not provided; an
      // explicit non-positive count → 0 items (bills only the base, if any).
      const items = resultCount === undefined ? 1 : nonNegInt(resultCount);
      amountCents = base + unit * items;
      break;
    }
    case "per_call":
    case "per_outcome":
    default:
      // A flat charge per run. (An unknown type falls here → flat, the safe
      // minimum-surprise default.)
      amountCents = unit;
      break;
  }

  amountCents = nonNegInt(amountCents);
  const feeCents = computeMarketplaceFeeCents(amountCents);
  return {
    amountCents,
    calculatedCost: amountCents * MICRO_PER_CENT,
    feeCents,
    netCents: Math.max(0, amountCents - feeCents),
  };
}
