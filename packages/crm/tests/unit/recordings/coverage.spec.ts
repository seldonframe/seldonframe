import { test } from "node:test";
import assert from "node:assert/strict";
import { coverFlowModel } from "@/lib/recordings/coverage";
import { findToolsByKeywords } from "@/lib/agents/generate/tool-catalog";
import type { FlowModel } from "@/lib/recordings/trace-schema";

function modelWithSteps(steps: FlowModel["steps"]): FlowModel {
  return {
    title: "Test flow",
    goal: "Test goal",
    apps: Array.from(new Set(steps.map((s) => s.app))),
    steps,
    variables: [],
    constants: [],
    branches: [],
    openQuestions: [],
    recordingsSeen: 1,
    coverage: [],
  };
}

test("coverFlowModel: a gmail step is green with a matched toolkit", () => {
  const model = modelWithSteps([
    {
      index: 0,
      app: "gmail",
      action: "read email",
      intent: "find the reply",
      dataIn: [],
      dataOut: [],
      checks: [],
    },
  ]);

  const coverage = coverFlowModel(model);

  assert.equal(coverage.length, 1);
  assert.equal(coverage[0].tier, "green");
  assert.equal(coverage[0].toolkit, "gmail");
  assert.match(coverage[0].reason, /gmail/);
});

test("coverFlowModel: an unknown desktop app is red even with an actiony verb", () => {
  const model = modelWithSteps([
    {
      index: 0,
      app: "QuickBooks Desktop",
      action: "create an invoice",
      intent: "bill the client",
      dataIn: [],
      dataOut: [],
      checks: [],
    },
  ]);

  const coverage = coverFlowModel(model);

  assert.equal(coverage[0].tier, "red");
  assert.equal(coverage[0].toolkit, undefined);
  assert.match(coverage[0].reason, /human/);
});

test("coverFlowModel: an unmatched but actiony web step is yellow", () => {
  const model = modelWithSteps([
    {
      index: 0,
      app: "Salesforce",
      action: "create a new lead record",
      intent: "log the prospect",
      dataIn: [],
      dataOut: [],
      checks: [],
    },
  ]);

  const coverage = coverFlowModel(model);

  assert.equal(coverage[0].tier, "yellow");
  assert.equal(coverage[0].toolkit, undefined);
  assert.match(coverage[0].reason, /approval/i);
});

test("coverFlowModel: a Gmail step whose action text mentions 'X drafts / tweets' still binds gmail, never postiz", () => {
  const model = modelWithSteps([
    {
      index: 0,
      app: "Gmail",
      action: "Click Send to forward the 'X drafts — 3 tweets' email",
      intent: "forward the drafts to the client",
      dataIn: [],
      dataOut: [],
      checks: [],
    },
  ]);

  const coverage = coverFlowModel(model);
  const gmailMatch = findToolsByKeywords("gmail")[0];

  assert.equal(coverage[0].tier, "green");
  assert.equal(coverage[0].toolkit, gmailMatch.toolkitSlug ?? gmailMatch.id);
  assert.notEqual(coverage[0].toolkit, "postiz");
});

test("coverFlowModel: output length matches steps length and stepIndex stays aligned", () => {
  const model = modelWithSteps([
    { index: 0, app: "gmail", action: "read email", intent: "a", dataIn: [], dataOut: [], checks: [] },
    { index: 1, app: "Salesforce", action: "update a record", intent: "b", dataIn: [], dataOut: [], checks: [] },
    { index: 2, app: "QuickBooks Desktop", action: "print a report", intent: "c", dataIn: [], dataOut: [], checks: [] },
  ]);

  const coverage = coverFlowModel(model);

  assert.equal(coverage.length, 3);
  coverage.forEach((entry, position) => {
    assert.equal(entry.stepIndex, position);
  });
});
