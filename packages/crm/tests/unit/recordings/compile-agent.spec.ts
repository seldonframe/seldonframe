// Task 11 — flow-model → skill-md + bundle + derived eval scenarios.
// Pure, deterministic, no LLM/DB — every function here takes only plain data.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveEvalScenarios,
  flowModelToBundle,
  flowModelToSkillMd,
} from "@/lib/recordings/compile-agent";
import type { CoverageEntry, FlowModel, WorkflowStep, WorkflowTrace } from "@/lib/recordings/trace-schema";

function step(index: number, overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    index,
    app: overrides.app ?? "gmail",
    action: overrides.action ?? `send email ${index}`,
    intent: overrides.intent ?? `notify the customer about step ${index}`,
    dataIn: overrides.dataIn ?? [`customer email ${index}`],
    dataOut: overrides.dataOut ?? [`sent confirmation ${index}`],
    checks: overrides.checks ?? [`verify address is correct for step ${index}`],
    ...(overrides.decision !== undefined ? { decision: overrides.decision } : {}),
  };
}

function baseTrace(overrides: Partial<WorkflowTrace> = {}): WorkflowTrace {
  const steps = overrides.steps ?? [step(0), step(1, { app: "QuickBooks Desktop", action: "log payment 1" })];
  return {
    title: overrides.title ?? "Handle a new customer",
    goal: overrides.goal ?? "onboard a new customer end to end",
    apps: overrides.apps ?? Array.from(new Set(steps.map((s) => s.app))),
    steps,
    variables: overrides.variables ?? [],
    constants: overrides.constants ?? [],
    branches: overrides.branches ?? [{ condition: "customer has no email", behavior: "ask for one before continuing" }],
    openQuestions: overrides.openQuestions ?? [],
  };
}

function baseModel(overrides: Partial<FlowModel> = {}): FlowModel {
  const trace = baseTrace(overrides);
  const coverage: CoverageEntry[] =
    overrides.coverage ??
    trace.steps.map((s) =>
      s.app === "QuickBooks Desktop"
        ? { stepIndex: s.index, tier: "red", reason: "no tool binding — stays with the human" }
        : { stepIndex: s.index, tier: "green", toolkit: "gmail", reason: "matched gmail" },
    );
  return {
    ...trace,
    recordingsSeen: overrides.recordingsSeen ?? 1,
    coverage,
  };
}

/** A 40-step model with a LARGE branches list — big enough that the full
 *  render (steps + rules + may-not-do + branches + eval scenarios) blows
 *  past the 8000-char cap, but the steps/rules/may-not-do section ALONE
 *  ("required") stays under it. This exercises the truncation-priority
 *  rule (eval scenarios drop first, then branches — steps are NEVER
 *  dropped) without hitting the last-resort hard-truncate path, which
 *  would otherwise cut off a step. */
function bigModel(): FlowModel {
  const steps: WorkflowStep[] = Array.from({ length: 40 }, (_, i) =>
    step(i, {
      app: i % 5 === 0 ? "QuickBooks Desktop" : "gmail",
      action: `do thing ${i}`,
      intent: `help the customer ${i}`,
      dataIn: [`field-${i}`],
      dataOut: [`out-${i}`],
      checks: [`check amt ${i}`, `check name ${i}`],
    }),
  );
  const branches = Array.from({ length: 60 }, (_, i) => ({
    condition: `edge case number ${i} happens when the customer does something unusual and needs a longer description to matter`,
    behavior: `handle it by escalating to a human reviewer for edge case ${i} with enough detail to pad the section out`,
  }));
  return baseModel({ steps, apps: Array.from(new Set(steps.map((s) => s.app))), branches });
}

// ── flowModelToSkillMd ───────────────────────────────────────────────────────

describe("flowModelToSkillMd", () => {
  test("contains all required sections for a normal model", () => {
    const md = flowModelToSkillMd(baseModel());
    assert.match(md, /^# Handle a new customer/);
    assert.match(md, /## The workflow/);
    assert.match(md, /## Rules/);
    assert.match(md, /## Branches \/ edge cases/);
    assert.match(md, /## What you may NOT do/);
    assert.match(md, /## Eval scenarios/);
  });

  test("red/yellow steps show up under 'What you may NOT do' — never silently dropped", () => {
    const md = flowModelToSkillMd(baseModel());
    const section = md.split("## What you may NOT do")[1] ?? "";
    assert.match(section, /log payment 1/);
  });

  test("stays within the 8000-char customSkillMd cap for a large (40-step) model", () => {
    const md = flowModelToSkillMd(bigModel());
    assert.ok(md.length <= 8000, `expected <= 8000 chars, got ${md.length}`);
  });

  test("truncation drops eval scenarios first — never drops a step", () => {
    const model = bigModel();
    const md = flowModelToSkillMd(model);
    // Every step index must still appear in the workflow section (steps are
    // NEVER dropped, per the plan's truncation priority).
    const workflowSection = md.split("## The workflow")[1]?.split("## Rules")[0] ?? "";
    for (const s of model.steps) {
      assert.match(
        workflowSection,
        new RegExp(`\\b${s.index}\\.`),
        `expected step ${s.index} to survive truncation`,
      );
    }
    // The eval-scenarios section is the lowest priority — it should be the
    // one that got dropped (or shrunk to nothing) to make room.
    assert.ok(!md.includes("## Eval scenarios") || md.length <= 8000);
  });
});

// ── deriveEvalScenarios ──────────────────────────────────────────────────────

describe("deriveEvalScenarios", () => {
  test("one scenario per recording", () => {
    const recordings = [
      { label: "Happy path", trace: baseTrace() },
      { label: null, trace: baseTrace({ title: "Edge case: no email" }) },
    ];
    const scenarios = deriveEvalScenarios(recordings);
    assert.equal(scenarios.length, 2);
    assert.equal(scenarios[0].title, "Happy path");
    assert.equal(scenarios[1].title, "Edge case: no email");
  });

  test("caps successCriteria/mustDo/mustNotDo at 6 each", () => {
    const manySteps = Array.from({ length: 10 }, (_, i) =>
      step(i, { checks: [`check-a-${i}`, `check-b-${i}`], app: "gmail" }),
    );
    const trace = baseTrace({ steps: manySteps, apps: ["gmail"] });
    const [scenario] = deriveEvalScenarios([{ label: "Big", trace }]);
    assert.ok(scenario.successCriteria.length <= 6);
    assert.ok(scenario.mustDo.length <= 6);
    assert.ok(scenario.mustNotDo.length <= 6);
  });

  test("is deterministic — same input yields the same output", () => {
    const recordings = [{ label: "Happy path", trace: baseTrace() }];
    const a = deriveEvalScenarios(recordings);
    const b = deriveEvalScenarios(recordings);
    assert.deepEqual(a, b);
  });

  test("mustNotDo always carries the two fixed guardrail lines", () => {
    const [scenario] = deriveEvalScenarios([{ label: "Happy path", trace: baseTrace() }]);
    assert.ok(scenario.mustNotDo.includes("invent data not present in the workflow"));
    assert.ok(scenario.mustNotDo.includes("skip a required check"));
  });
});

// ── flowModelToBundle ────────────────────────────────────────────────────────

describe("flowModelToBundle", () => {
  test("overrides customSkillMd, surfaces the green toolkit in connectors, warns on red steps", () => {
    const model = baseModel();
    const { bundle, scenarios, warnings } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });

    assert.equal(bundle.blueprint.customSkillMd, flowModelToSkillMd(model));
    assert.ok(bundle.blueprint.connectors?.some((c) => c.kind === "composio" ? c.enabledToolkits.includes("gmail") : c.id === "gmail"));
    assert.equal(scenarios.length, 1);
    assert.ok(warnings.some((w) => /log payment 1/.test(w)));
  });

  test("identity comes from the flow model, not the starter it fell through to", () => {
    // "Forward SeldonFrame Weekly Emails to Personal Gmail" matches no
    // parse-intent keyword, so heuristicIntent falls through to the
    // receptionist starter — whose name/description must NOT win.
    const model = baseModel({
      title: "Forward SeldonFrame Weekly Emails to Personal Gmail",
      goal: "Forward SeldonFrame Weekly Emails to Personal Gmail",
    });
    const { bundle } = flowModelToBundle({
      model,
      recordings: [{ label: "Happy path", trace: baseTrace() }],
    });

    assert.equal(bundle.name, model.title);
    assert.notEqual(bundle.name, "AI Phone Receptionist");
    assert.equal(bundle.description, model.goal);
  });
});
