import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeIntoFlowModel } from "@/lib/recordings/merge-traces";
import type { TraceLlm, TraceLlmRequest, WorkflowTrace, FlowModel } from "@/lib/recordings/trace-schema";

function validTrace(overrides: Record<string, unknown> = {}): WorkflowTrace {
  return {
    title: "Book a follow-up call",
    goal: "Schedule a follow-up call after a sales demo",
    apps: ["gmail", "calendly"],
    steps: [
      {
        index: 0,
        app: "gmail",
        action: "read email",
        intent: "find the demo attendee's reply",
        dataIn: ["inbox"],
        dataOut: ["attendee email"],
        checks: ["attendee replied"],
      },
      {
        index: 1,
        app: "calendly",
        action: "create booking link",
        intent: "send a scheduling link",
        dataIn: ["attendee email"],
        dataOut: ["booking link"],
        checks: ["link is valid"],
      },
    ],
    variables: ["attendee email"],
    constants: ["30 minute call"],
    branches: [{ condition: "attendee has no reply", behavior: "send a reminder" }],
    openQuestions: ["what timezone to default to"],
    ...overrides,
  } as WorkflowTrace;
}

function validModel(overrides: Record<string, unknown> = {}): FlowModel {
  return {
    ...validTrace(),
    recordingsSeen: 1,
    coverage: [],
    ...overrides,
  } as FlowModel;
}

function makeFakeLlm(responses: unknown[]): { llm: TraceLlm; requests: TraceLlmRequest[]; callCount: () => number } {
  const requests: TraceLlmRequest[] = [];
  let index = 0;
  const llm: TraceLlm = async (req) => {
    requests.push(req);
    if (index >= responses.length) {
      throw new Error("fake llm queue exhausted");
    }
    const response = responses[index];
    index += 1;
    return response;
  };
  return { llm, requests, callCount: () => requests.length };
}

test("mergeIntoFlowModel promotes the first recording deterministically without calling the llm", async () => {
  const { llm, callCount } = makeFakeLlm([]);
  const trace = validTrace();

  const result = await mergeIntoFlowModel({ model: null, trace, llm });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.recordingsSeen, 1);
    assert.deepEqual(result.model.coverage, []);
    assert.equal(result.model.title, trace.title);
    assert.deepEqual(result.whatChanged, [`Learned the happy path: ${trace.title}`]);
    assert.deepEqual(result.openQuestions, trace.openQuestions);
  }
  assert.equal(callCount(), 0);
});

test("mergeIntoFlowModel merges a second recording via one llm call (happy path)", async () => {
  const model = validModel();
  const trace = validTrace({ title: "Book a follow-up call (edge case: no reply)" });

  const mergedModelJson = {
    ...validTrace(),
    recordingsSeen: 99, // deliberately wrong — caller must force it
    coverage: [],
  };

  const { llm, callCount } = makeFakeLlm([
    { model: mergedModelJson, whatChanged: ["Learned a new branch: no reply"], openQuestions: ["still unclear: reminder delay"] },
  ]);

  const result = await mergeIntoFlowModel({ model, trace, llm });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.whatChanged, ["Learned a new branch: no reply"]);
    assert.deepEqual(result.openQuestions, ["still unclear: reminder delay"]);
  }
  assert.equal(callCount(), 1);
});

test("mergeIntoFlowModel forces recordingsSeen to model.recordingsSeen + 1 even when the llm returns a different number", async () => {
  const model = validModel({ recordingsSeen: 3 });
  const trace = validTrace();

  const { llm } = makeFakeLlm([
    { model: { ...validTrace(), recordingsSeen: 99, coverage: [] }, whatChanged: [], openQuestions: [] },
  ]);

  const result = await mergeIntoFlowModel({ model, trace, llm });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.recordingsSeen, 4);
  }
});

test("mergeIntoFlowModel retries once on a validation failure, then returns ok:false if still invalid", async () => {
  const model = validModel();
  const trace = validTrace();

  const { llm, callCount } = makeFakeLlm([
    { model: { title: "" }, whatChanged: [], openQuestions: [] }, // malformed
    { model: { title: "" }, whatChanged: [], openQuestions: [] }, // still malformed
  ]);

  const result = await mergeIntoFlowModel({ model, trace, llm });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /validation/i);
  }
  assert.equal(callCount(), 2, "expected exactly one retry (2 calls total)");
});

test("mergeIntoFlowModel retries once on a validation failure, then succeeds", async () => {
  const model = validModel();
  const trace = validTrace();

  const { llm, callCount } = makeFakeLlm([
    { model: { title: "" }, whatChanged: [], openQuestions: [] }, // malformed
    { model: { ...validTrace(), recordingsSeen: 1, coverage: [] }, whatChanged: ["fixed"], openQuestions: [] },
  ]);

  const result = await mergeIntoFlowModel({ model, trace, llm });

  assert.equal(result.ok, true);
  assert.equal(callCount(), 2);
});
