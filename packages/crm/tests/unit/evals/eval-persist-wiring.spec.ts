// Task 3 of the improve-verb + trust-rail plan
// (docs/superpowers/plans/2026-07-02-improve-verb-trust-rail.md): wire T2's
// persistence store (eval-runs-store.ts) into the existing
// `runAgentEvalsAction` and into the workspace-state route's per-agent
// `last_eval_run` signal.
//
// `eval-actions.ts` is "use server" — only async functions may be exported
// from it (scripts/check-use-server.sh enforces this), so the persistable
// core (summarize → recordEvalRun → update agent_templates.evalScore) is
// extracted into a plain DI-friendly module,
// src/lib/agents/evals/persist-template-run.ts, that this spec exercises
// directly with FAKE deps — no Postgres, no real run-agent-evals call.
//
// Coverage:
//   - happy path: exactly one `recordEvalRun` call carrying the row built by
//     `summarizeRunForPersistence` (org/subject/kind/grader/version threaded
//     through), and exactly one `updateTemplateEvalScore` call whose value is
//     the SAME row's `passRate` (not re-derived separately — single source of
//     truth).
//   - `recordEvalRun` throwing → swallowed: the function does not throw, and
//     `updateTemplateEvalScore` is NOT called (nothing to score off a run
//     that didn't persist).
//   - `updateTemplateEvalScore` throwing → swallowed: the function does not
//     throw (the eval run itself already succeeded and must never be
//     clawed back over a scoreboard write failing).
//   - a structured console.warn fires on either failure (event name check —
//     loose enough to survive wording edits, strict enough to prove a
//     warning actually happened).

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  persistTemplateEvalRun,
  type PersistTemplateEvalRunDeps,
} from "@/lib/agents/evals/persist-template-run";
import type { AgentEvalResult, RunAgentEvalsResult } from "@/lib/agents/evals/run-agent-evals";
import type { EvalScenario, EvalScore, EvalTranscript } from "@/lib/agents/evals/eval-types";
import type { NewEvalRun } from "@/db/schema/eval-runs";

type UpdateEvalScoreArgs = Parameters<PersistTemplateEvalRunDeps["updateTemplateEvalScore"]>[0];

// ─── fakes (mirrors eval-runs-store.spec.ts's fixtures) ─────────────────────

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
      passRate: total > 0 ? passed / total : 0,
      ...summaryOverrides,
    },
  };
}

const BASE_ARGS = {
  orgId: "org-1",
  templateId: "tmpl-1",
  graderModel: "claude-haiku-4-5",
  result: fakeRunResult([
    fakeResult({ scenario: fakeScenario({ id: "scn-pass" }), score: fakeScore({ scenarioId: "scn-pass", passed: true }) }),
    fakeResult({
      scenario: fakeScenario({ id: "scn-fail", title: "Angry customer" }),
      score: fakeScore({ scenarioId: "scn-fail", passed: false, checks: [{ name: "mustNotDo:quote_firm_price", passed: false }] }),
    }),
  ]),
};

describe("persistTemplateEvalRun — happy path", () => {
  test("records exactly one eval_runs row (subjectKind:'template', kind:'manual') and updates evalScore to the SAME row's passRate", async () => {
    const recordEvalRun = mock.fn(async (_row: NewEvalRun) => ({ id: "run-1" }));
    const updateTemplateEvalScore = mock.fn(async (_args: UpdateEvalScoreArgs) => {});

    await persistTemplateEvalRun(BASE_ARGS, { recordEvalRun, updateTemplateEvalScore });

    assert.equal(recordEvalRun.mock.calls.length, 1, "recordEvalRun called exactly once");
    const row = recordEvalRun.mock.calls[0].arguments[0];
    assert.equal(row.orgId, "org-1");
    assert.equal(row.subjectKind, "template");
    assert.equal(row.subjectId, "tmpl-1");
    assert.equal(row.kind, "manual");
    assert.equal(row.graderModel, "claude-haiku-4-5");
    assert.equal(row.blueprintVersion, null, "templates carry no blueprintVersion");
    assert.equal(row.passRate, 50, "1 of 2 passed → 50%");
    assert.equal(row.scenarioCount, 2);
    assert.equal(row.passedCount, 1);

    assert.equal(updateTemplateEvalScore.mock.calls.length, 1, "updateTemplateEvalScore called exactly once");
    const updateArgs = updateTemplateEvalScore.mock.calls[0].arguments[0];
    assert.equal(updateArgs.orgId, "org-1");
    assert.equal(updateArgs.templateId, "tmpl-1");
    assert.equal(
      updateArgs.evalScore,
      row.passRate,
      "the evalScore update MUST be the same value as the persisted row's passRate — single source of truth",
    );
  });

  test("a perfect run persists passRate 100 and threads it through to the update call", async () => {
    const recordEvalRun = mock.fn(async (_row: NewEvalRun) => ({ id: "run-2" }));
    const updateTemplateEvalScore = mock.fn(async (_args: UpdateEvalScoreArgs) => {});

    await persistTemplateEvalRun(
      { ...BASE_ARGS, result: fakeRunResult([fakeResult()]) },
      { recordEvalRun, updateTemplateEvalScore },
    );

    const row = recordEvalRun.mock.calls[0].arguments[0];
    assert.equal(row.passRate, 100);
    assert.equal(updateTemplateEvalScore.mock.calls[0].arguments[0].evalScore, 100);
  });
});

describe("persistTemplateEvalRun — failure isolation (never throws, never fails the eval run)", () => {
  test("recordEvalRun throwing: swallowed, logged, and updateTemplateEvalScore is NOT called", async () => {
    const recordEvalRun = mock.fn(async () => {
      throw new Error("connection refused");
    });
    const updateTemplateEvalScore = mock.fn(async (_args: UpdateEvalScoreArgs) => {});
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    try {
      await assert.doesNotReject(
        persistTemplateEvalRun(BASE_ARGS, { recordEvalRun, updateTemplateEvalScore }),
        "a persistence failure must never propagate — the eval run itself already succeeded",
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(updateTemplateEvalScore.mock.calls.length, 0, "no row was persisted, so nothing to score");
    assert.ok(warnCalls.length >= 1, "a structured warning must be logged on failure");
    const [firstArg] = warnCalls[0];
    assert.match(
      String(firstArg),
      /\[eval-actions\]/,
      "the warning is tagged with the module name",
    );
  });

  test("updateTemplateEvalScore throwing: swallowed and logged (the run was already persisted)", async () => {
    const recordEvalRun = mock.fn(async (_row: NewEvalRun) => ({ id: "run-3" }));
    const updateTemplateEvalScore = mock.fn(async () => {
      throw new Error("row not found");
    });
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    try {
      await assert.doesNotReject(
        persistTemplateEvalRun(BASE_ARGS, { recordEvalRun, updateTemplateEvalScore }),
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(recordEvalRun.mock.calls.length, 1, "the run WAS persisted before the score update failed");
    assert.ok(warnCalls.length >= 1, "a structured warning must be logged on failure");
  });
});
