// wallet ledger — the PURE prepaid-wallet ledger ops (spec 1ff09dcb, P2 Task 1).
//
// MONEY-SAFETY is the whole point of these tests. The ledger is the REAL money
// path's accounting core, and it must be provably:
//   • never negative — a debit that exceeds the balance is REJECTED ("insufficient"),
//     it never drives the balance below 0.
//   • idempotent on runId — a run can never double-debit; replaying debitForRun
//     with the same runId is a no-op that returns the SAME balance.
//   • idempotent on idempotencyKey — a top-up credit applied twice (a webhook
//     re-delivery) credits ONCE.
// The ops are pure: they take the current WalletState (balance + the set of
// already-applied idempotency keys / debited runIds) and return either the new
// state + the transaction to persist, or a typed rejection. NO IO, NO Stripe,
// NO clock — the DB store wraps these and persists the returned transaction
// (with a UNIQUE(idempotencyKey) constraint as the last-line backstop).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  creditTopup,
  debitForRun,
  balanceMicros,
  canAfford,
  type WalletState,
} from "../../../src/lib/build/wallet-ledger";

/** A fresh empty wallet (0 balance, nothing applied). */
function emptyWallet(): WalletState {
  return { balanceMicros: 0, appliedKeys: new Set<string>(), debitedRunIds: new Set<string>() };
}

/** A wallet seeded with a balance (and no applied history). */
function fundedWallet(micros: number): WalletState {
  return { balanceMicros: micros, appliedKeys: new Set<string>(), debitedRunIds: new Set<string>() };
}

describe("balanceMicros / canAfford — reads", () => {
  test("balanceMicros reads the current balance", () => {
    assert.equal(balanceMicros(fundedWallet(50_000)), 50_000);
    assert.equal(balanceMicros(emptyWallet()), 0);
  });

  test("canAfford is true iff balance >= cost (a 0-cost run is always affordable)", () => {
    const w = fundedWallet(10_000);
    assert.equal(canAfford(w, 10_000), true); // exact
    assert.equal(canAfford(w, 9_999), true);
    assert.equal(canAfford(w, 10_001), false); // one micro short
    assert.equal(canAfford(w, 0), true); // free run
    assert.equal(canAfford(emptyWallet(), 0), true); // free run on empty wallet
    assert.equal(canAfford(emptyWallet(), 1), false);
  });

  test("canAfford treats a negative/NaN cost as 0 (affordable) — never blocks on junk", () => {
    assert.equal(canAfford(emptyWallet(), -5), true);
    assert.equal(canAfford(emptyWallet(), Number.NaN), true);
  });
});

describe("creditTopup — money IN", () => {
  test("credits the amount and returns a topup transaction", () => {
    const res = creditTopup(emptyWallet(), {
      orgId: "org_1",
      amountMicros: 100_000,
      idempotencyKey: "topup_sess_a",
      stripeRef: "cs_test_a",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.state.balanceMicros, 100_000);
    assert.ok(res.transaction);
    assert.equal(res.transaction.kind, "topup");
    assert.equal(res.transaction.amountMicros, 100_000);
    assert.equal(res.transaction.idempotencyKey, "topup_sess_a");
    assert.equal(res.transaction.stripeRef, "cs_test_a");
    assert.equal(res.transaction.orgId, "org_1");
  });

  test("is IDEMPOTENT on idempotencyKey — a re-applied credit is a no-op (credits once)", () => {
    const first = creditTopup(emptyWallet(), {
      orgId: "org_1",
      amountMicros: 100_000,
      idempotencyKey: "topup_sess_a",
    });
    assert.ok(first.ok);
    if (!first.ok) return;
    // Replay the SAME credit against the post-credit state (the webhook fires twice).
    const replay = creditTopup(first.state, {
      orgId: "org_1",
      amountMicros: 100_000,
      idempotencyKey: "topup_sess_a",
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.duplicate, true);
    // Balance unchanged — credited ONCE, not twice.
    assert.equal(replay.state.balanceMicros, 100_000);
    // No new transaction to persist on the duplicate.
    assert.equal(replay.transaction, undefined);
  });

  test("rejects a non-positive / non-finite top-up (no zero/negative credit row)", () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = creditTopup(emptyWallet(), {
        orgId: "org_1",
        amountMicros: bad,
        idempotencyKey: `k_${bad}`,
      });
      assert.equal(res.ok, false);
    }
  });

  test("rejects a credit with no idempotencyKey (can't dedupe → refuse)", () => {
    const res = creditTopup(emptyWallet(), {
      orgId: "org_1",
      amountMicros: 100_000,
      idempotencyKey: "",
    });
    assert.equal(res.ok, false);
  });
});

describe("debitForRun — the per-run drawdown (LEDGER only)", () => {
  test("debits the cost on a funded wallet and returns a debit transaction tagged with runId", () => {
    const res = debitForRun(fundedWallet(100_000), {
      orgId: "org_1",
      runId: "run_abc",
      amountMicros: 30_000,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.state.balanceMicros, 70_000); // 100k - 30k
    assert.ok(res.transaction);
    assert.equal(res.transaction.kind, "debit");
    assert.equal(res.transaction.amountMicros, 30_000);
    assert.equal(res.transaction.runId, "run_abc");
    // The debit's idempotency key is derived from the runId (one debit per run).
    assert.ok(res.transaction.idempotencyKey.includes("run_abc"));
  });

  test("REJECTS with reason 'insufficient' when balance < cost — balance UNCHANGED, never negative", () => {
    const w = fundedWallet(10_000);
    const res = debitForRun(w, { orgId: "org_1", runId: "run_x", amountMicros: 10_001 });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "insufficient");
    // The input wallet's balance is untouched (purity) and never went negative.
    assert.equal(w.balanceMicros, 10_000);
  });

  test("an EXACT-balance debit succeeds and lands the wallet at exactly 0 (never below)", () => {
    const res = debitForRun(fundedWallet(10_000), {
      orgId: "org_1",
      runId: "run_exact",
      amountMicros: 10_000,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.state.balanceMicros, 0);
  });

  test("is IDEMPOTENT on runId — replaying the same run does NOT double-debit", () => {
    const first = debitForRun(fundedWallet(100_000), {
      orgId: "org_1",
      runId: "run_dup",
      amountMicros: 30_000,
    });
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.state.balanceMicros, 70_000);
    // Replay the SAME runId against the post-debit state.
    const replay = debitForRun(first.state, {
      orgId: "org_1",
      runId: "run_dup",
      amountMicros: 30_000,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.duplicate, true);
    // Balance unchanged — debited ONCE. No second transaction.
    assert.equal(replay.state.balanceMicros, 70_000);
    assert.equal(replay.transaction, undefined);
  });

  test("a 0-cost run records NO debit (nothing to draw down) but is not an error", () => {
    const res = debitForRun(fundedWallet(100_000), {
      orgId: "org_1",
      runId: "run_free",
      amountMicros: 0,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.state.balanceMicros, 100_000); // unchanged
    assert.equal(res.transaction, undefined); // no zero-amount debit row
  });

  test("a fractional/negative cost is clamped to a non-negative integer of micros", () => {
    // negative → 0 cost → no debit
    const neg = debitForRun(fundedWallet(100_000), { orgId: "o", runId: "r1", amountMicros: -50 });
    assert.ok(neg.ok);
    if (neg.ok) assert.equal(neg.state.balanceMicros, 100_000);
    // fractional → floored
    const frac = debitForRun(fundedWallet(100_000), { orgId: "o", runId: "r2", amountMicros: 30_000.9 });
    assert.ok(frac.ok);
    if (frac.ok) assert.equal(frac.state.balanceMicros, 70_000);
  });
});

describe("a full top-up → debit sequence keeps the balance correct + non-negative", () => {
  test("credit 100k, debit 30k twice (distinct runs), then a 50k debit is rejected", () => {
    let w = emptyWallet();

    const c = creditTopup(w, { orgId: "o", amountMicros: 100_000, idempotencyKey: "t1" });
    assert.ok(c.ok);
    if (!c.ok) return;
    w = c.state;
    assert.equal(balanceMicros(w), 100_000);

    const d1 = debitForRun(w, { orgId: "o", runId: "r1", amountMicros: 30_000 });
    assert.ok(d1.ok);
    if (!d1.ok) return;
    w = d1.state;
    assert.equal(balanceMicros(w), 70_000);

    const d2 = debitForRun(w, { orgId: "o", runId: "r2", amountMicros: 30_000 });
    assert.ok(d2.ok);
    if (!d2.ok) return;
    w = d2.state;
    assert.equal(balanceMicros(w), 40_000);

    // 50k > 40k → rejected, balance stays 40k (never negative).
    const d3 = debitForRun(w, { orgId: "o", runId: "r3", amountMicros: 50_000 });
    assert.equal(d3.ok, false);
    assert.equal(balanceMicros(w), 40_000);
  });
});
