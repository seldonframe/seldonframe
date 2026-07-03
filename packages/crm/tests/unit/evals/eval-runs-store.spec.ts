// Tests for the eval-runs persistence store (Task 2 of the improve-verb +
// trust-rail plan:
// docs/superpowers/plans/2026-07-02-improve-verb-trust-rail.md).
//
// TDD focus: `summarizeRunForPersistence` is a PURE function — it takes a
// `RunAgentEvalsResult` (the real shape from run-agent-evals.ts, i.e.
// `{ results: { scenario, transcript, score }[], summary }`, NOT the
// brief's shorthand `{scenarioId,title,passed,failedChecks}`) and produces a
// `NewEvalRun` row, with NO I/O. The db wrapper fns (`recordEvalRun`,
// `getLatestEvalRun`, `listEvalRunsForSubject`) are thin org-scoped Drizzle
// passthroughs exercised by integration/e2e coverage elsewhere in the repo's
// harness (no local Postgres in this unit-test run) — this spec's job is to
// TDD the pure summarizer per the plan's binding ambiguity resolutions:
//   - passRate rounding: Math.round(summary.passRate * 100), clamped 0-100.
//   - "no transcript" test: a fake result whose objects carry extra
//     `transcript`/`turns` keys must NOT have those keys survive into
//     resultsSummary (assert via JSON.stringify).
//   - failedChecks carries check NAMES only (not full EvalCheck objects).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { summarizeRunForPersistence } from "@/lib/agents/evals/eval-runs-store";
import type {
  AgentEvalResult,
  RunAgentEvalsResult,
} from "@/lib/agents/evals/run-agent-evals";
import type { EvalScenario, EvalScore, EvalTranscript } from "@/lib/agents/evals/eval-types";

// ─── fakes ───────────────────────────────────────────────────────────────

function fakeScenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "scn-1",
    title: "No-heat emergency at 11pm",
    persona: "a worried tenant",
    opening: "My heat just died and it's freezing!",
    successCriteria: ["acknowledge urgency", "offer emergency slot"],
    mustDo: ["ask for address"],
    mustNotDo: ["quote a firm price"],
    ...overrides,
  };
}

function fakeTranscript(overrides: Partial<EvalTranscript> = {}): EvalTranscript {
  return {
    scenarioId: "scn-1",
    turns: [
      { role: "customer", text: "My heat just died!" },
      { role: "agent", text: "I'm sorry to hear that — let's get someone out." },
    ],
    ...overrides,
  };
}

function fakeScore(overrides: Partial<EvalScore> = {}): EvalScore {
  return {
    scenarioId: "scn-1",
    passed: true,
    score: 1,
    checks: [{ name: "safety:acknowledged_urgency", passed: true }],
    ...overrides,
  };
}

function fakeResult(overrides: Partial<AgentEvalResult> = {}): AgentEvalResult {
  return {
    scenario: fakeScenario(),
    transcript: fakeTranscript(),
    score: fakeScore(),
    ...overrides,
  };
}

function fakeRunResult(
  results: AgentEvalResult[],
  summaryOverrides: Partial<RunAgentEvalsResult["summary"]> = {},
): RunAgentEvalsResult {
  const total = results.length;
  const passed = results.filter((r) => r.score.passed).length;
  return {
    results,
    summary: {
      passed,
      total,
      passRate: total === 0 ? 0 : passed / total,
      ...summaryOverrides,
    },
  };
}

const BASE_INPUT = {
  orgId: "11111111-1111-1111-1111-111111111111",
  subjectKind: "agent" as const,
  subjectId: "22222222-2222-2222-2222-222222222222",
  kind: "manual" as const,
  graderModel: "claude-haiku-4-5",
  blueprintVersion: 3,
};

describe("summarizeRunForPersistence", () => {
  test("is pure and returns a NewEvalRun-shaped row with the org/subject/kind carried through verbatim", () => {
    const result = fakeRunResult([fakeResult()]);
    const row = summarizeRunForPersistence({ ...BASE_INPUT, result });

    assert.equal(row.orgId, BASE_INPUT.orgId);
    assert.equal(row.subjectKind, BASE_INPUT.subjectKind);
    assert.equal(row.subjectId, BASE_INPUT.subjectId);
    assert.equal(row.kind, BASE_INPUT.kind);
    assert.equal(row.graderModel, BASE_INPUT.graderModel);
    assert.equal(row.blueprintVersion, BASE_INPUT.blueprintVersion);
  });

  test("rounds passRate 0.875 -> 88 (Math.round(passRate*100))", () => {
    // 7/8 = 0.875 -> *100 = 87.5 -> Math.round = 88.
    const results = Array.from({ length: 8 }, (_, i) =>
      fakeResult({
        scenario: fakeScenario({ id: `scn-${i}` }),
        score: fakeScore({ scenarioId: `scn-${i}`, passed: i < 7 }),
      }),
    );
    const result = fakeRunResult(results);
    assert.equal(result.summary.passRate, 0.875);

    const row = summarizeRunForPersistence({ ...BASE_INPUT, result });
    assert.equal(row.passRate, 88);
    assert.equal(row.scenarioCount, 8);
    assert.equal(row.passedCount, 7);
  });

  test("clamps passRate to [0, 100] even if summary.passRate is out of the normal 0..1 range", () => {
    const overPassRate = fakeRunResult([fakeResult()], { passRate: 1.5 });
    const overRow = summarizeRunForPersistence({ ...BASE_INPUT, result: overPassRate });
    assert.equal(overRow.passRate, 100);

    const underPassRate = fakeRunResult([fakeResult()], { passRate: -0.3 });
    const underRow = summarizeRunForPersistence({ ...BASE_INPUT, result: underPassRate });
    assert.equal(underRow.passRate, 0);
  });

  test("empty run -> passRate 0 and scenarioCount 0", () => {
    const result = fakeRunResult([]);
    const row = summarizeRunForPersistence({ ...BASE_INPUT, result });

    assert.equal(row.passRate, 0);
    assert.equal(row.scenarioCount, 0);
    assert.equal(row.passedCount, 0);
    assert.deepEqual(row.resultsSummary, []);
  });

  test("resultsSummary maps id/title/passed/failedChecks (check NAMES only) per scenario", () => {
    const passingResult = fakeResult({
      scenario: fakeScenario({ id: "scn-pass", title: "Happy path booking" }),
      score: fakeScore({
        scenarioId: "scn-pass",
        passed: true,
        checks: [{ name: "safety:no_pii_leak", passed: true }],
      }),
    });
    const failingResult = fakeResult({
      scenario: fakeScenario({ id: "scn-fail", title: "Angry customer demands refund" }),
      score: fakeScore({
        scenarioId: "scn-fail",
        passed: false,
        checks: [
          { name: "safety:acknowledged_urgency", passed: false, detail: "never apologized" },
          { name: "mustNotDo:quote_firm_price", passed: false, detail: "quoted $150 flat" },
          { name: "mustDo:ask_for_address", passed: true },
        ],
      }),
    });

    const result = fakeRunResult([passingResult, failingResult]);
    const row = summarizeRunForPersistence({ ...BASE_INPUT, result });

    assert.equal(row.resultsSummary?.length, 2);

    const [passRow, failRow] = row.resultsSummary!;
    assert.equal(passRow.id, "scn-pass");
    assert.equal(passRow.title, "Happy path booking");
    assert.equal(passRow.passed, true);
    assert.deepEqual(passRow.failedChecks ?? [], []);

    assert.equal(failRow.id, "scn-fail");
    assert.equal(failRow.title, "Angry customer demands refund");
    assert.equal(failRow.passed, false);
    // NAMES only — not the full EvalCheck objects (no `detail`, no `passed`
    // sub-fields on the array entries themselves).
    assert.deepEqual(failRow.failedChecks, [
      "safety:acknowledged_urgency",
      "mustNotDo:quote_firm_price",
    ]);
    for (const name of failRow.failedChecks ?? []) {
      assert.equal(typeof name, "string");
    }
  });

  test("does NOT carry raw transcript/turns fields into resultsSummary, even when present on the input objects", () => {
    // A result whose scenario/transcript/score objects carry EXTRA
    // transcript/turns keys (simulating a caller accidentally passing
    // through more than the pure contract allows). The summarizer must not
    // copy them into resultsSummary — assert their total absence via
    // JSON.stringify, per the plan's binding "no transcript" test.
    const contaminated: AgentEvalResult & {
      scenario: EvalScenario & { transcript?: unknown; turns?: unknown };
      score: EvalScore & { transcript?: unknown; turns?: unknown };
    } = {
      scenario: {
        ...fakeScenario({ id: "scn-leaky", title: "Leaky scenario" }),
        transcript: "RAW CUSTOMER TRANSCRIPT: hi my ssn is 123-45-6789",
        turns: [{ role: "customer", text: "sensitive stuff" }],
      },
      transcript: {
        ...fakeTranscript({ scenarioId: "scn-leaky" }),
        turns: [
          { role: "customer", text: "RAW: my card number is 4111111111111111" },
          { role: "agent", text: "RAW reply with PII" },
        ],
      },
      score: {
        ...fakeScore({ scenarioId: "scn-leaky", passed: false, checks: [] }),
        transcript: "RAW transcript echoed onto the score object",
        turns: [{ role: "agent", text: "more raw turns" }],
      },
    };

    const result = fakeRunResult([contaminated]);
    const row = summarizeRunForPersistence({ ...BASE_INPUT, result });

    const serialized = JSON.stringify(row.resultsSummary);
    assert.ok(
      !serialized.includes("transcript"),
      `resultsSummary must not contain a "transcript" key/value; got: ${serialized}`,
    );
    assert.ok(
      !serialized.includes("turns"),
      `resultsSummary must not contain a "turns" key/value; got: ${serialized}`,
    );
    assert.ok(
      !serialized.includes("RAW"),
      `resultsSummary must not leak raw transcript content; got: ${serialized}`,
    );

    // Also assert the WHOLE row (not just resultsSummary) is clean — the
    // pure fn must never smuggle transcript data anywhere in its output.
    const wholeRow = JSON.stringify(row);
    assert.ok(!wholeRow.includes("transcript"), "row must not contain a \"transcript\" key/value anywhere");
    assert.ok(!wholeRow.includes("turns"), "row must not contain a \"turns\" key/value anywhere");
  });

  test("is pure: calling it twice with the same input produces deep-equal output (no shared mutable state, no clock/randomness)", () => {
    const result = fakeRunResult([fakeResult(), fakeResult({
      scenario: fakeScenario({ id: "scn-2", title: "Second scenario" }),
      score: fakeScore({ scenarioId: "scn-2", passed: false, checks: [{ name: "criteria:offer_slot", passed: false }] }),
    })]);

    const first = summarizeRunForPersistence({ ...BASE_INPUT, result });
    const second = summarizeRunForPersistence({ ...BASE_INPUT, result });

    assert.deepEqual(first, second);
  });

  test("passes graderModel/blueprintVersion through as null when given null", () => {
    const result = fakeRunResult([fakeResult()]);
    const row = summarizeRunForPersistence({
      ...BASE_INPUT,
      graderModel: null,
      blueprintVersion: null,
      result,
    });
    assert.equal(row.graderModel, null);
    assert.equal(row.blueprintVersion, null);
  });
});
