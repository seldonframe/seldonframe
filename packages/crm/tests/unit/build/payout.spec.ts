// requestPayout — the PURE money-OUT orchestration (spec 2026-07-01-builder-
// payout). Pins the money-safety invariants: disabled when the flag is off,
// connect_required without an enabled account, below_min under $10, ONE transfer
// then ONE ledger record on success, no phantom record when the transfer throws,
// and the idempotency-key = cumulative gross-earned (so two withdrawals at the
// same earning level can't double-pay, but new earnings get a fresh key).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  requestPayout,
  MIN_WITHDRAW_USD,
  type RequestPayoutDeps,
} from "../../../src/lib/build/payout";

const MICRO = 1_000_000;

/** A deps builder with money-safe defaults (enabled, connected, funded); each
 *  test overrides only what it exercises. Records every createTransfer call. */
function makeDeps(over: Partial<RequestPayoutDeps> = {}): {
  deps: RequestPayoutDeps;
  transfers: { amountCents: number; destinationAccountId: string; idempotencyKey: string }[];
  recorded: { amountMicros: number; transferId: string }[];
} {
  const transfers: { amountCents: number; destinationAccountId: string; idempotencyKey: string }[] = [];
  const recorded: { amountMicros: number; transferId: string }[] = [];
  const deps: RequestPayoutDeps = {
    billingEnabled: true,
    minWithdrawUsd: MIN_WITHDRAW_USD,
    getConnectedAccount: async () => ({ stripeAccountId: "acct_1", payoutsEnabled: true }),
    getWithdrawableMicros: async () => 25 * MICRO,
    getGrossEarnedMicros: async () => 25 * MICRO,
    createTransfer: async (i) => {
      transfers.push({ amountCents: i.amountCents, destinationAccountId: i.destinationAccountId, idempotencyKey: i.idempotencyKey });
      return { transferId: "tr_1" };
    },
    recordPayout: async (i) => {
      recorded.push({ amountMicros: i.amountMicros, transferId: i.transferId });
    },
    onboardingUrl: async () => "https://app.seldonframe.com/build/wallet",
    ...over,
  };
  return { deps, transfers, recorded };
}

describe("requestPayout", () => {
  test("flag OFF → disabled, no transfer", async () => {
    const { deps, transfers } = makeDeps({ billingEnabled: false });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.deepEqual(r, { status: "disabled" });
    assert.equal(transfers.length, 0);
  });

  test("missing org → disabled, no transfer", async () => {
    const { deps, transfers } = makeDeps();
    const r = await requestPayout({ orgId: "  " }, deps);
    assert.deepEqual(r, { status: "disabled" });
    assert.equal(transfers.length, 0);
  });

  test("no connected account → connect_required + onboarding link, no transfer", async () => {
    const { deps, transfers } = makeDeps({ getConnectedAccount: async () => null });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "connect_required");
    assert.equal((r as { onboardingUrl: string }).onboardingUrl, "https://app.seldonframe.com/build/wallet");
    assert.equal(transfers.length, 0);
  });

  test("account exists but payouts not enabled → connect_required", async () => {
    const { deps } = makeDeps({ getConnectedAccount: async () => ({ stripeAccountId: "acct_1", payoutsEnabled: false }) });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "connect_required");
  });

  test("withdrawable below the $10 minimum → below_min, no transfer", async () => {
    const { deps, transfers } = makeDeps({ getWithdrawableMicros: async () => 9.99 * MICRO });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(r.status, "below_min");
    assert.equal((r as { minUsd: number }).minUsd, 10);
    assert.equal((r as { withdrawableUsd: number }).withdrawableUsd, 9.99);
    assert.equal(transfers.length, 0);
  });

  test("funded → ONE transfer of the withdrawable, THEN ONE ledger record, paid", async () => {
    const { deps, transfers, recorded } = makeDeps({
      getWithdrawableMicros: async () => 25 * MICRO,
      getGrossEarnedMicros: async () => 40 * MICRO, // gross ≥ withdrawable (some already paid)
    });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.deepEqual(r, { status: "paid", amountUsd: 25, transferId: "tr_1" });
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0]!.amountCents, 2500);
    assert.equal(transfers[0]!.destinationAccountId, "acct_1");
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.amountMicros, 25 * MICRO);
    assert.equal(recorded[0]!.transferId, "tr_1");
  });

  test("idempotency key = payout:<orgId>:<grossEarnedMicros> (NOT the amount)", async () => {
    const { deps, transfers } = makeDeps({
      getWithdrawableMicros: async () => 25 * MICRO,
      getGrossEarnedMicros: async () => 40 * MICRO,
    });
    await requestPayout({ orgId: "o1" }, deps);
    assert.equal(transfers[0]!.idempotencyKey, `payout:o1:${40 * MICRO}`);
  });

  test("idempotency-key stability: same gross → same key; more earnings → different key", async () => {
    const a = makeDeps({ getWithdrawableMicros: async () => 10 * MICRO, getGrossEarnedMicros: async () => 10 * MICRO });
    await requestPayout({ orgId: "o1" }, a.deps);
    const b = makeDeps({ getWithdrawableMicros: async () => 10 * MICRO, getGrossEarnedMicros: async () => 10 * MICRO });
    await requestPayout({ orgId: "o1" }, b.deps);
    assert.equal(a.transfers[0]!.idempotencyKey, b.transfers[0]!.idempotencyKey); // same level → collapses
    const c = makeDeps({ getWithdrawableMicros: async () => 15 * MICRO, getGrossEarnedMicros: async () => 25 * MICRO });
    await requestPayout({ orgId: "o1" }, c.deps);
    assert.notEqual(a.transfers[0]!.idempotencyKey, c.transfers[0]!.idempotencyKey); // new earnings → new key
  });

  test("a createTransfer that throws surfaces the error and records NO ledger row", async () => {
    const { deps, recorded } = makeDeps({
      createTransfer: async () => { throw new Error("stripe boom"); },
    });
    await assert.rejects(() => requestPayout({ orgId: "o1" }, deps), /stripe boom/);
    assert.equal(recorded.length, 0); // no phantom payout row
  });

  test("records only whole cents actually transferred; sub-cent dust stays (not over-recorded)", async () => {
    // 25.005 dollars = 25_005_000 micros → transfers 2500 cents = 25_000_000 micros; 5_000 micros dust remains.
    const { deps, transfers, recorded } = makeDeps({
      getWithdrawableMicros: async () => 25_005_000,
      getGrossEarnedMicros: async () => 25_005_000,
    });
    const r = await requestPayout({ orgId: "o1" }, deps);
    assert.equal(transfers[0]!.amountCents, 2500);
    assert.equal(recorded[0]!.amountMicros, 25_000_000);
    assert.equal((r as { amountUsd: number }).amountUsd, 25);
  });
});
