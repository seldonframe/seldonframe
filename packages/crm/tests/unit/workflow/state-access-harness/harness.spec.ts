// SLICE 3 synthesis comparison harness — runs each of 10 scenarios
// through both paths (baseline: mcp_tool_call-only; candidate: with
// new state-access step types), measures correctness + readability,
// aggregates results.
//
// Per audit §9.1. Artifact category per L-17 — counted separately
// from dispatcher unit-test LOC.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { AgentSpecSchema, type AgentSpec } from "../../../../src/lib/agents/validator";
import type { ComparisonScenario } from "./scenarios";
import { SCENARIOS } from "./scenarios";

type PathMetrics = {
  stepCount: number;
  distinctStepTypes: Set<string>;
  mcpToolCallCount: number;
  stateAccessStepCount: number;
  parseSuccess: boolean;
};

function measurePath(spec: AgentSpec): PathMetrics {
  const parseResult = AgentSpecSchema.safeParse(spec);
  const types = new Set<string>();
  let mcpCount = 0;
  let stateCount = 0;
  for (const step of spec.steps) {
    types.add(step.type);
    if (step.type === "mcp_tool_call") mcpCount += 1;
    if (step.type === "read_state" || step.type === "write_state" || step.type === "emit_event") {
      stateCount += 1;
    }
  }
  return {
    stepCount: spec.steps.length,
    distinctStepTypes: types,
    mcpToolCallCount: mcpCount,
    stateAccessStepCount: stateCount,
    parseSuccess: parseResult.success,
  };
}

type ScenarioResult = {
  scenarioId: string;
  baseline: PathMetrics;
  candidate: PathMetrics;
  distributionMatch: boolean;
};

function scoreScenario(scenario: ComparisonScenario): ScenarioResult {
  const baseline = measurePath(scenario.baseline);
  const candidate = measurePath(scenario.candidate);
  // Distribution-match heuristic: for scenarios where a state-
  // access pattern is expected, the candidate must use at least
  // one of the new step types.
  let distributionMatch = true;
  if (scenario.stateAccessPatternExpected !== "emit-without-state") {
    distributionMatch = candidate.stateAccessStepCount >= 1;
  } else {
    // emit-without-state → expect at least one emit_event in candidate.
    distributionMatch = candidate.distinctStepTypes.has("emit_event");
  }
  return {
    scenarioId: scenario.id,
    baseline,
    candidate,
    distributionMatch,
  };
}

describe("SLICE 3 synthesis comparison harness — §9.1", () => {
  test("all 10 scenarios present with expected axes", () => {
    assert.equal(SCENARIOS.length, 10);
    for (const s of SCENARIOS) {
      assert.ok(s.id, "scenario has id");
      assert.ok(s.nlIntent, "scenario has nlIntent");
      assert.ok(s.baseline, "scenario has baseline");
      assert.ok(s.candidate, "scenario has candidate");
    }
  });

  test("both paths parse cleanly via AgentSpecSchema for every scenario", () => {
    for (const s of SCENARIOS) {
      const b = AgentSpecSchema.safeParse(s.baseline);
      const c = AgentSpecSchema.safeParse(s.candidate);
      assert.ok(b.success, `baseline parse failed for ${s.id}: ${b.success ? "" : JSON.stringify(b.error.issues)}`);
      assert.ok(c.success, `candidate parse failed for ${s.id}: ${c.success ? "" : JSON.stringify(c.error.issues)}`);
    }
  });

  test("distribution match holds for ≥8 of 10 scenarios (§9.1 gate)", () => {
    const results = SCENARIOS.map(scoreScenario);
    const matches = results.filter((r) => r.distributionMatch).length;
    assert.ok(
      matches >= 8,
      `expected ≥8 of 10 scenarios to match expected type distribution; got ${matches}`,
    );
  });

  test("candidate reduces mcp_tool_call count for state-touching scenarios", () => {
    // Aggregate across scenarios where stateAccessPatternExpected
    // is not emit-only.
    const stateScenarios = SCENARIOS.filter(
      (s) => s.stateAccessPatternExpected !== "emit-without-state",
    );
    let totalBaselineMcp = 0;
    let totalCandidateMcp = 0;
    for (const s of stateScenarios) {
      totalBaselineMcp += measurePath(s.baseline).mcpToolCallCount;
      totalCandidateMcp += measurePath(s.candidate).mcpToolCallCount;
    }
    assert.ok(
      totalCandidateMcp < totalBaselineMcp,
      `candidate path should call fewer mcp_tool_call tools overall (baseline: ${totalBaselineMcp}, candidate: ${totalCandidateMcp})`,
    );
  });

  test("candidate increases step-type diversity", () => {
    // Average distinct-step-types count across scenarios.
    const results = SCENARIOS.map(scoreScenario);
    const avgBaseline =
      results.reduce((sum, r) => sum + r.baseline.distinctStepTypes.size, 0) / results.length;
    const avgCandidate =
      results.reduce((sum, r) => sum + r.candidate.distinctStepTypes.size, 0) / results.length;
    assert.ok(
      avgCandidate > avgBaseline,
      `candidate's avg distinct-step-types should be > baseline's (baseline: ${avgBaseline.toFixed(2)}, candidate: ${avgCandidate.toFixed(2)})`,
    );
  });

  test("step-count preserved or reduced in candidate (no step inflation)", () => {
    // Each scenario: candidate step count should be ≤ baseline.
    // The new step types are meant to REPLACE mcp_tool_calls, not
    // add steps alongside them.
    for (const s of SCENARIOS) {
      const b = measurePath(s.baseline);
      const c = measurePath(s.candidate);
      assert.ok(
        c.stepCount <= b.stepCount,
        `scenario ${s.id}: candidate step count (${c.stepCount}) exceeds baseline (${b.stepCount}) — step inflation`,
      );
    }
  });

  test("aggregate readability report — informational, not gate-worthy", () => {
    const results = SCENARIOS.map(scoreScenario);
    const report = {
      scenarioCount: results.length,
      distributionMatches: results.filter((r) => r.distributionMatch).length,
      avgBaselineSteps:
        results.reduce((s, r) => s + r.baseline.stepCount, 0) / results.length,
      avgCandidateSteps:
        results.reduce((s, r) => s + r.candidate.stepCount, 0) / results.length,
      totalBaselineMcp: results.reduce((s, r) => s + r.baseline.mcpToolCallCount, 0),
      totalCandidateMcp: results.reduce((s, r) => s + r.candidate.mcpToolCallCount, 0),
      totalCandidateStateAccessSteps: results.reduce(
        (s, r) => s + r.candidate.stateAccessStepCount,
        0,
      ),
      avgBaselineDistinctTypes:
        results.reduce((s, r) => s + r.baseline.distinctStepTypes.size, 0) / results.length,
      avgCandidateDistinctTypes:
        results.reduce((s, r) => s + r.candidate.distinctStepTypes.size, 0) / results.length,
    };
    // Informational assertions — the close-out report cites these.
    assert.ok(report.distributionMatches >= 8);
    assert.ok(report.totalCandidateMcp < report.totalBaselineMcp);
    assert.ok(report.totalCandidateStateAccessSteps > 0);
    // Log-shaped output for close-out inclusion.
    // eslint-disable-next-line no-console
    console.log("[slice-3-harness] aggregate report:", JSON.stringify(report, null, 2));
  });
});
