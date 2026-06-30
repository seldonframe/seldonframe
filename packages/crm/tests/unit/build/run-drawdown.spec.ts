// run drawdown — the per-run wallet gate + debit + earning, factored into a pure
// orchestration helper so the run endpoint's money path is unit-testable WITHOUT a
// DB or Stripe (spec 1ff09dcb, P2 Task 3).
//
// MONEY-SAFETY (the contract these tests pin):
//   • The DRAWDOWN IS LEDGER-ONLY — NO Stripe call per run (the only Stripe call
//     in the rail is the top-up). The helper's deps are a balance read + a debit +
//     an earning accrual, all DB-backed in prod, faked here.
//   • The GATE runs BEFORE execution: gateRun(cost) → insufficient when the
//     balance can't cover the floor cost → the route 402s and does NOT execute.
//   • The DEBIT runs only AFTER a successful run, is idempotent on runId, and can
//     never drive the balance negative.
//   • EARNINGS: the builder accrues (cost − 5% fee) as a ledger `earning` row.
//   • FLAG OFF / wallet unfunded path is unchanged (charged:false) — today's
//     money-safe behavior.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  gateRunAffordability,
  settleRunDrawdown,
  type RunDrawdownDeps,
} from "../../../src/lib/build/run-drawdown";
import { computeRunCost } from "../../../src/lib/build/run-cost";

// ─── fakes ───────────────────────────────────────────────────────────────────

function makeDeps(
  over: Partial<RunDrawdownDeps> & { balanceMicros?: number; billingEnabled?: boolean } = {},
): {
  deps: RunDrawdownDeps;
  debits: Array<{ runId: string; amountMicros: number }>;
  earnings: Array<{ sellerOrgId: string; runId: string; netMicros: number }>;
} {
  const debits: Array<{ runId: string; amountMicros: number }> = [];
  const earnings: Array<{ sellerOrgId: string; runId: string; netMicros: number }> = [];
  let balance = over.balanceMicros ?? 1_000_000; // $1.00 by default
  const deps: RunDrawdownDeps = {
    billingEnabled: over.billingEnabled ?? true,
    getBalanceMicros: async () => balance,
    debitForRun: async ({ runId, amountMicros }) => {
      if (balance < amountMicros) return { ok: false, reason: "insufficient" };
      balance -= amountMicros;
      debits.push({ runId, amountMicros });
      return { ok: true, balanceMicros: balance, applied: true, duplicate: false };
    },
    accrueEarning: async ({ sellerOrgId, runId, netMicros }) => {
      earnings.push({ sellerOrgId, runId, netMicros });
      return { ok: true, applied: true };
    },
    ...over,
  };
  return { deps, debits, earnings };
}

// ─── the gate (BEFORE execution) ─────────────────────────────────────────────

describe("gateRunAffordability — the pre-execution 402 gate", () => {
  test("flag OFF → always allowed (today's behavior, no wallet involvement)", async () => {
    const { deps } = makeDeps({ billingEnabled: false, balanceMicros: 0 });
    const cost = computeRunCost({ type: "per_call", amountCents: 100 }); // $1
    const gate = await gateRunAffordability(deps, "org-1", cost);
    assert.equal(gate.allowed, true);
    assert.equal(gate.enforced, false); // wallet not enforced when flag off
  });

  test("flag ON + a free (0¢) run → allowed even on an empty wallet", async () => {
    const { deps } = makeDeps({ balanceMicros: 0 });
    const cost = computeRunCost({ type: "per_call", amountCents: 0 });
    const gate = await gateRunAffordability(deps, "org-1", cost);
    assert.equal(gate.allowed, true);
  });

  test("flag ON + sufficient balance → allowed", async () => {
    const { deps } = makeDeps({ balanceMicros: 1_000_000 }); // $1
    const cost = computeRunCost({ type: "per_call", amountCents: 50 }); // $0.50
    const gate = await gateRunAffordability(deps, "org-1", cost);
    assert.equal(gate.allowed, true);
    assert.equal(gate.enforced, true);
  });

  test("flag ON + INSUFFICIENT balance → NOT allowed (the 402 path)", async () => {
    const { deps } = makeDeps({ balanceMicros: 10_000 }); // $0.01
    const cost = computeRunCost({ type: "per_call", amountCents: 100 }); // $1
    const gate = await gateRunAffordability(deps, "org-1", cost);
    assert.equal(gate.allowed, false);
    assert.equal(gate.enforced, true);
  });
});

// ─── the settle (AFTER a successful run) ─────────────────────────────────────

describe("settleRunDrawdown — debit + earning after success (LEDGER only)", () => {
  test("debits the cost, accrues the builder earning, returns charged:true + new balance", async () => {
    const { deps, debits, earnings } = makeDeps({ balanceMicros: 1_000_000 });
    const cost = computeRunCost({ type: "per_call", amountCents: 100 }); // $1, fee 5¢, net 95¢
    const res = await settleRunDrawdown(deps, {
      renterOrgId: "org-renter",
      sellerOrgId: "org-seller",
      runId: "run_1",
      cost,
    });
    assert.equal(res.charged, true);
    // balance: $1.00 − $1.00 = 0 → 0 micros
    assert.equal(res.balanceMicros, 0);
    assert.equal(debits.length, 1);
    assert.equal(debits[0]!.amountMicros, cost.calculatedCost); // 100¢ × 10_000
    // earning = net (95¢) in micros = 95 × 10_000 = 950_000
    assert.equal(earnings.length, 1);
    assert.equal(earnings[0]!.sellerOrgId, "org-seller");
    assert.equal(earnings[0]!.netMicros, 950_000);
  });

  test("flag OFF → no debit, no earning, charged:false (unchanged behavior)", async () => {
    const { deps, debits, earnings } = makeDeps({ billingEnabled: false });
    const cost = computeRunCost({ type: "per_call", amountCents: 100 });
    const res = await settleRunDrawdown(deps, {
      renterOrgId: "org-renter",
      sellerOrgId: "org-seller",
      runId: "run_1",
      cost,
    });
    assert.equal(res.charged, false);
    assert.equal(debits.length, 0);
    assert.equal(earnings.length, 0);
  });

  test("a 0-cost run → no debit, charged:false (nothing to draw down)", async () => {
    const { deps, debits, earnings } = makeDeps();
    const cost = computeRunCost({ type: "per_call", amountCents: 0 });
    const res = await settleRunDrawdown(deps, {
      renterOrgId: "org-renter",
      sellerOrgId: "org-seller",
      runId: "run_free",
      cost,
    });
    assert.equal(res.charged, false);
    assert.equal(debits.length, 0);
    assert.equal(earnings.length, 0);
  });

  test("an insufficient debit at settle → charged:false, NO earning (no half-bill)", async () => {
    // Balance dropped below cost between the gate and settle (a race). The atomic
    // debit guard rejects → we do NOT accrue an earning for an unbilled run.
    const { deps, debits, earnings } = makeDeps({ balanceMicros: 10_000 }); // $0.01
    const cost = computeRunCost({ type: "per_call", amountCents: 100 }); // $1
    const res = await settleRunDrawdown(deps, {
      renterOrgId: "org-renter",
      sellerOrgId: "org-seller",
      runId: "run_race",
      cost,
    });
    assert.equal(res.charged, false);
    assert.equal(debits.length, 0);
    assert.equal(earnings.length, 0);
  });

  test("IDEMPOTENT: a duplicate debit (same runId) → charged reflects the debit, NO second earning", async () => {
    const { deps, earnings } = makeDeps({ balanceMicros: 1_000_000 });
    const cost = computeRunCost({ type: "per_call", amountCents: 100 });
    // Override debit to report a duplicate (the row already existed).
    deps.debitForRun = async () => ({ ok: true, balanceMicros: 0, applied: false, duplicate: true });
    const res = await settleRunDrawdown(deps, {
      renterOrgId: "org-renter",
      sellerOrgId: "org-seller",
      runId: "run_dup",
      cost,
    });
    // A duplicate debit means this run already settled — charged:true, but the
    // earning accrual is itself idempotent on runId in the store, so re-accruing
    // is safe; the helper still calls it (the store dedupes).
    assert.equal(res.charged, true);
    assert.equal(earnings.length, 1); // accrue is idempotent on runId in the store
  });
});
