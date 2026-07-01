// payout.ts — the PURE money-OUT orchestration (spec 2026-07-01-builder-payout).
// No DB, no Stripe, no clock: every side effect is an injected dep, so the
// money-safety invariants are unit-tested with fakes (no network, no real key,
// no charge). The route + the dashboard action both call this with the same real
// deps (payout-deps.ts).
//
// MONEY-SAFETY (see the plan's Global Constraints):
//   • flag off / no org → { disabled } (no transfer).
//   • no connected + payouts-enabled account → { connect_required } (no transfer).
//   • withdrawable < MIN_WITHDRAW_USD → { below_min } (no transfer).
//   • else: create the Transfer with idempotencyKey = payout:<orgId>:<grossEarned
//     Micros> (a MONOTONIC high-water mark, so the same earning level can't
//     double-pay but new earnings get a fresh key), THEN record the ledger row.
//     Record only whole cents actually transferred; sub-cent dust stays withdrawable.

import { MICRO_PER_CENT } from "@/lib/build/run-cost";

/** The minimum withdrawal (USD) — avoids dust + transfer inefficiency. */
export const MIN_WITHDRAW_USD = 10;

const MICRO_PER_DOLLAR = 1_000_000;

export type ConnectedAccount = { stripeAccountId: string; payoutsEnabled: boolean };

export type RequestPayoutDeps = {
  /** SF_MARKETPLACE_BILLING is ON (isBillingEnabled(env)). Off → inert. */
  billingEnabled: boolean;
  /** The minimum withdrawal in USD (MIN_WITHDRAW_USD). */
  minWithdrawUsd: number;
  /** The builder's active Connect account (+ payouts_enabled), or null. */
  getConnectedAccount: (orgId: string) => Promise<ConnectedAccount | null>;
  /** Σ earning − Σ payout (micro-dollars) — the amount transferable. */
  getWithdrawableMicros: (orgId: string) => Promise<number>;
  /** Σ earning (micro-dollars) — the cumulative high-water mark for the key. */
  getGrossEarnedMicros: (orgId: string) => Promise<number>;
  /** Create a Stripe Transfer (platform balance → the connected account). */
  createTransfer: (i: {
    orgId: string;
    amountCents: number;
    destinationAccountId: string;
    idempotencyKey: string;
  }) => Promise<{ transferId: string }>;
  /** Record the payout ledger row (idempotent on payout:<transferId>). */
  recordPayout: (i: { orgId: string; amountMicros: number; transferId: string }) => Promise<void>;
  /** Where to send the builder to connect their bank (dashboard). */
  onboardingUrl: (orgId: string) => Promise<string | null>;
};

export type PayoutResult =
  | { status: "paid"; amountUsd: number; transferId: string }
  | { status: "connect_required"; onboardingUrl: string | null }
  | { status: "below_min"; withdrawableUsd: number; minUsd: number }
  | { status: "disabled" };

/** Round to cents for display. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp to a finite, non-negative integer of micros. */
function nonNegMicros(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

export async function requestPayout(
  input: { orgId: string },
  deps: RequestPayoutDeps,
): Promise<PayoutResult> {
  const orgId = (input?.orgId ?? "").trim();
  if (!orgId) return { status: "disabled" };
  if (!deps.billingEnabled) return { status: "disabled" };

  const account = await deps.getConnectedAccount(orgId);
  if (!account || !account.payoutsEnabled) {
    return { status: "connect_required", onboardingUrl: await deps.onboardingUrl(orgId) };
  }

  const withdrawableMicros = nonNegMicros(await deps.getWithdrawableMicros(orgId));
  const withdrawableUsd = withdrawableMicros / MICRO_PER_DOLLAR;
  if (withdrawableUsd < deps.minWithdrawUsd) {
    return { status: "below_min", withdrawableUsd: round2(withdrawableUsd), minUsd: deps.minWithdrawUsd };
  }

  // Transfer only whole cents; the sub-cent remainder stays withdrawable (never
  // over-record a payout).
  const amountCents = Math.floor(withdrawableMicros / MICRO_PER_CENT);
  const paidMicros = amountCents * MICRO_PER_CENT;

  // The idempotency high-water mark: cumulative GROSS earned (monotonic). Two
  // withdrawals at different earning levels get different keys (both settle); a
  // retry/double-click at the SAME level gets the same key (Stripe returns the
  // first transfer — no second money movement).
  const grossMicros = nonNegMicros(await deps.getGrossEarnedMicros(orgId));
  const idempotencyKey = `payout:${orgId}:${grossMicros}`;

  const { transferId } = await deps.createTransfer({
    orgId,
    amountCents,
    destinationAccountId: account.stripeAccountId,
    idempotencyKey,
  });

  // Only AFTER the transfer succeeds: record the ledger row (dedupe on transferId).
  await deps.recordPayout({ orgId, amountMicros: paidMicros, transferId });

  return { status: "paid", amountUsd: round2(paidMicros / MICRO_PER_DOLLAR), transferId };
}
