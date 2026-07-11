import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { lifecycleGate, EVAL_PASS_THRESHOLD } from "@/lib/agents/lifecycle/gate";
import type { EvalRun } from "@/db/schema/eval-runs";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function fakeEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "run-1",
    orgId: ORG_ID,
    subjectKind: "template",
    subjectId: TEMPLATE_ID,
    kind: "manual",
    passRate: 100,
    scenarioCount: 3,
    passedCount: 3,
    graderModel: "claude-haiku",
    blueprintVersion: null,
    resultsSummary: [],
    createdAt: new Date(),
    ...overrides,
  } as EvalRun;
}

describe("EVAL_PASS_THRESHOLD", () => {
  test("is 80", () => {
    assert.equal(EVAL_PASS_THRESHOLD, 80);
  });
});

describe("lifecycleGate", () => {
  test("eval passes + supervised run succeeded → both true, missing empty", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 90 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result, { evalPass: true, supervisedRun: true, missing: [] });
  });

  test("no eval run yet → evalPass false, missing includes eval_pass", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => null,
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.equal(result.evalPass, false);
    assert.ok(result.missing.includes("eval_pass"));
  });

  test("eval run below threshold (passRate 79) → evalPass false", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 79 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.equal(result.evalPass, false);
  });

  test("eval run exactly at threshold (passRate 80) → evalPass true", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 80 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.equal(result.evalPass, true);
  });

  test("eval run with zero scenarios never passes even at 100% passRate", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun({ passRate: 100, scenarioCount: 0 }),
        hasSucceededSupervisedRun: async () => true,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.equal(result.evalPass, false);
  });

  test("no succeeded supervised run → supervisedRun false, missing includes supervised_run", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => fakeEvalRun(),
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.equal(result.supervisedRun, false);
    assert.ok(result.missing.includes("supervised_run"));
  });

  test("neither gate satisfied → missing has both, in order", async () => {
    const result = await lifecycleGate(
      {
        getLatestEvalRun: async () => null,
        hasSucceededSupervisedRun: async () => false,
      },
      { orgId: ORG_ID, templateId: TEMPLATE_ID },
    );
    assert.deepEqual(result.missing, ["eval_pass", "supervised_run"]);
  });
});
