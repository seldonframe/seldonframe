// The builder onboarding ladder — pure rung logic (spec 2026-06-30-builder-
// onboarding-lens). Pins each transition build→test→eval→list→price→observe,
// the current-rung = first-not-done rule, the soft test rung, and the load-
// bearing next-action copy the SKILL surfaces.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBuilderLadder,
  deriveBuilderSignals,
  buildLifecycleView,
  type BuilderSignals,
} from "../../../src/lib/build/builder-ladder";

const EMPTY: BuilderSignals = {
  hasAgent: false,
  evalHasRun: false,
  evalPassesGate: false,
  hasListing: false,
  hasPrice: false,
};

describe("buildBuilderLadder", () => {
  test("empty workspace → current rung is Build, next action asks to describe", () => {
    const l = buildBuilderLadder(EMPTY);
    assert.equal(l.currentRung, "build");
    assert.match(l.nextAction, /describe/i);
    assert.equal(l.progress.done, 0);
    assert.equal(l.progress.total, 6);
    assert.equal(l.rungs.length, 6);
  });

  test("has an agent, nothing else → current rung is Test (send_conversation_turn)", () => {
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true });
    assert.equal(l.currentRung, "test");
    assert.equal(l.rungs.find((r) => r.kind === "build")?.status, "done");
    assert.equal(l.rungs.find((r) => r.kind === "test")?.tool, "send_conversation_turn");
  });

  test("an eval has run but the gate is not met → current rung is Eval", () => {
    // Test is SOFT: it flips to done once an eval has run, so progression lands
    // on the real gate.
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true, evalHasRun: true });
    assert.equal(l.currentRung, "eval");
    assert.equal(l.rungs.find((r) => r.kind === "test")?.status, "done");
    assert.equal(l.rungs.find((r) => r.kind === "eval")?.tool, "run_agent_evals");
  });

  test("gate met, not listed → current rung is List (the self-adapt case)", () => {
    const l = buildBuilderLadder({ ...EMPTY, hasAgent: true, evalPassesGate: true });
    assert.equal(l.currentRung, "list");
    assert.equal(l.rungs.find((r) => r.kind === "eval")?.status, "done");
  });

  test("listed, not priced → current rung is Price", () => {
    const l = buildBuilderLadder({
      ...EMPTY,
      hasAgent: true,
      evalPassesGate: true,
      hasListing: true,
    });
    assert.equal(l.currentRung, "price");
    assert.equal(l.rungs.find((r) => r.kind === "price")?.tool, "set_usage_price");
  });

  test("all done → current rung is Observe & earn, progress 6/6", () => {
    const l = buildBuilderLadder({
      hasAgent: true,
      evalHasRun: true,
      evalPassesGate: true,
      hasListing: true,
      hasPrice: true,
    });
    assert.equal(l.currentRung, "observe");
    assert.match(l.nextAction, /wallet|earn|brain/i);
    assert.equal(l.progress.done, 6);
  });

  test("is deterministic and tolerates a malformed signal object", () => {
    const a = buildBuilderLadder(EMPTY);
    const b = buildBuilderLadder(EMPTY);
    assert.deepEqual(a, b);
    // @ts-expect-error — exercise the jsonb-edge tolerance
    assert.equal(buildBuilderLadder(undefined).currentRung, "build");
  });
});

describe("deriveBuilderSignals", () => {
  test("maps agent/eval/listing data to signals", () => {
    const s = deriveBuilderSignals({
      agentCount: 1,
      agentStats: [{ eval_total: 11, eval_meets_publish_gate: true }],
      marketplaceStatuses: [{ listed: true, priceModel: "per_usage" }],
    });
    assert.deepEqual(s, {
      hasAgent: true,
      evalHasRun: true,
      evalPassesGate: true,
      hasListing: true,
      hasPrice: true,
    });
  });

  test("a listed-but-unpriced (onetime/free) listing is not hasPrice", () => {
    const s = deriveBuilderSignals({
      agentCount: 1,
      agentStats: [{ eval_total: 0, eval_meets_publish_gate: null }],
      marketplaceStatuses: [{ listed: true, priceModel: "onetime" }],
    });
    assert.equal(s.hasListing, true);
    assert.equal(s.hasPrice, false);
    assert.equal(s.evalHasRun, false);
  });

  test("tolerates empty/malformed input", () => {
    // @ts-expect-error — jsonb edge
    const s = deriveBuilderSignals({});
    assert.equal(s.hasAgent, false);
    assert.equal(s.hasListing, false);
  });
});

describe("buildLifecycleView", () => {
  const AGENT = { name: "Ace", slug: "ace", status: "live", eval_total: 11, eval_meets_publish_gate: true, listed: true, priced: true };

  test("maps an agent to its furthest stage (live) + surfaces earnings", () => {
    const v = buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 12.5, walletBalanceUsd: 5 });
    assert.equal(v.agents[0]!.stage, "live");
    assert.equal(v.agents[0]!.live, true);
    assert.equal(v.earnings.accrued_usd, 12.5);
    assert.equal(v.earnings.payout_status, "coming_soon");
  });

  test("listed-but-unpriced → price stage; built-only-no-eval → eval stage", () => {
    const listed = buildLifecycleView({ agents: [{ ...AGENT, status: "test", priced: false }], earningsAccruedUsd: 0, walletBalanceUsd: 5 });
    assert.equal(listed.agents[0]!.stage, "price");
    const built = buildLifecycleView({ agents: [{ ...AGENT, status: "draft", eval_total: 0, eval_meets_publish_gate: null, listed: false, priced: false }], earningsAccruedUsd: 0, walletBalanceUsd: 5 });
    assert.equal(built.agents[0]!.stage, "eval");
  });

  test("fund_hint fires only when balance < $1; null otherwise", () => {
    assert.match(buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 0, walletBalanceUsd: 0 }).fund_hint!, /wallet topup/);
    assert.equal(buildLifecycleView({ agents: [AGENT], earningsAccruedUsd: 0, walletBalanceUsd: 5 }).fund_hint, null);
  });

  test("tolerates empty/malformed input", () => {
    const v = buildLifecycleView({});
    assert.deepEqual(v.agents, []);
    assert.equal(v.earnings.accrued_usd, 0);
    assert.equal(v.fund_hint, null);
  });
});
