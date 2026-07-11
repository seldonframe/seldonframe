// TDD for T1 (self-describing compiled bindings): flowModelToBundle must emit
// composio connector bindings whose `enabledTools` is the curated default
// allowlist for the toolkit — NEVER an empty array — so a compiled agent's
// tools are usable the moment it's created, without a separate discovery/
// connect step. This is the fix for the 2026-07-11 incident (DB row
// 32a12952-c2ec-468b-8636-3aa5fd76ae7d): a supervised run whose only bound
// tool was a composio binding with enabledTools:[] had literally zero real
// tools available, so the model could only ever say "I can't do this."

import { test } from "node:test";
import assert from "node:assert/strict";

import { flowModelToBundle } from "./compile-agent";
import { defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";
import type { FlowModel, WorkflowTrace } from "@/lib/recordings/trace-schema";

function minimalModel(overrides: Partial<FlowModel> = {}): FlowModel {
  return {
    title: "Forward invoices to QuickBooks",
    goal: "Forward every invoice email into QuickBooks",
    apps: ["gmail"],
    steps: [
      {
        index: 0,
        app: "gmail",
        action: "Read invoice email",
        intent: "Find the invoice email",
        dataIn: [],
        dataOut: ["invoice"],
        checks: [],
      },
    ],
    variables: [],
    constants: [],
    branches: [],
    openQuestions: [],
    recordingsSeen: 1,
    coverage: [
      { stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matches gmail send" },
    ],
    ...overrides,
  };
}

function minimalTrace(model: FlowModel): WorkflowTrace {
  return {
    title: model.title,
    goal: model.goal,
    apps: model.apps,
    steps: model.steps,
    variables: model.variables,
    constants: model.constants,
    branches: model.branches,
    openQuestions: model.openQuestions,
  };
}

test("a green-coverage composio toolkit compiles to a binding with the curated default tools, never an empty allowlist", () => {
  const model = minimalModel();
  const { bundle } = flowModelToBundle({
    model,
    recordings: [{ label: null, trace: minimalTrace(model) }],
  });

  const gmailBinding = (bundle.blueprint.connectors ?? []).find(
    (c) => c.kind === "composio" && c.enabledToolkits.includes("gmail"),
  );
  assert.ok(gmailBinding, "expected a composio gmail binding");
  assert.ok(gmailBinding!.kind === "composio");
  assert.deepEqual(
    (gmailBinding as { enabledTools: string[] }).enabledTools,
    defaultToolsForToolkits(["gmail"]),
  );
  assert.notDeepEqual((gmailBinding as { enabledTools: string[] }).enabledTools, []);
});

test("a green-coverage postiz (vetted) step still compiles with an empty allowlist (unchanged — vetted connectors have no toolkit-default catalog)", () => {
  const model = minimalModel({
    coverage: [{ stepIndex: 0, tier: "green", toolkit: "postiz", reason: "matches postiz post" }],
  });
  const { bundle } = flowModelToBundle({
    model,
    recordings: [{ label: null, trace: minimalTrace(model) }],
  });

  const postizBinding = (bundle.blueprint.connectors ?? []).find(
    (c) => c.kind === "vetted" && c.id === "postiz",
  );
  assert.ok(postizBinding, "expected a vetted postiz binding");
  assert.deepEqual((postizBinding as { enabledTools: string[] }).enabledTools, []);
});
