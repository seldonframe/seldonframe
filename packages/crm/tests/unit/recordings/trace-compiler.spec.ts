import { test } from "node:test";
import assert from "node:assert/strict";
import { compileTrace } from "@/lib/recordings/trace-compiler";
import type { TraceLlm, TraceLlmRequest } from "@/lib/recordings/trace-schema";

function validTraceJson(overrides: Record<string, unknown> = {}) {
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
  };
}

/** A fake TraceLlm backed by a queue of canned responses. Records every
 * request it was called with so tests can assert on prompt content + call
 * count. */
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

const frames = [{ base64: "AAAA" }];
const transcript = [{ atMs: 0, text: "opened gmail" }];

test("compileTrace happy path returns a validated trace", async () => {
  const { llm, callCount } = makeFakeLlm([
    { jobKind: "email-to-crm", confidence: 0.9, needsFramesReview: true }, // route
    validTraceJson(), // extract
  ]);

  const result = await compileTrace({ frames, transcript, llm });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.trace.title, "Book a follow-up call");
    assert.equal(result.trace.steps.length, 2);
  }
  assert.equal(callCount(), 2);
});

test("compileTrace retries once on a malformed extraction, then succeeds", async () => {
  const { llm, callCount } = makeFakeLlm([
    { jobKind: "email-to-crm", confidence: 0.9, needsFramesReview: true }, // route
    { title: "" }, // extract — malformed (fails min(1) on title, missing fields)
    validTraceJson(), // retry — valid
  ]);

  const result = await compileTrace({ frames, transcript, llm });

  assert.equal(result.ok, true);
  assert.equal(callCount(), 3, "expected route + extract + retry = 3 calls total");
});

test("compileTrace returns ok:false when both extraction attempts are malformed", async () => {
  const { llm, callCount } = makeFakeLlm([
    { jobKind: "email-to-crm", confidence: 0.9, needsFramesReview: true }, // route
    { title: "" }, // extract — malformed
    { title: "" }, // retry — still malformed
  ]);

  const result = await compileTrace({ frames, transcript, llm });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /validation/i);
  }
  assert.equal(callCount(), 3);
});

test("compileTrace returns ok:false without calling the llm when frames and transcript are both empty", async () => {
  const { llm, callCount } = makeFakeLlm([validTraceJson()]);

  const result = await compileTrace({ frames: [], transcript: [], llm });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "nothing to compile");
  }
  assert.equal(callCount(), 0);
});

test("compileTrace includes priorAnswers text in the extraction request", async () => {
  const { llm, requests } = makeFakeLlm([
    { jobKind: "email-to-crm", confidence: 0.9, needsFramesReview: true }, // route
    validTraceJson(), // extract
  ]);

  await compileTrace({
    frames,
    transcript,
    priorAnswers: ["We default to Pacific time"],
    llm,
  });

  const extractRequest = requests[1];
  const hasPriorAnswerText = extractRequest.user.some(
    (part) => part.type === "text" && part.text.includes("We default to Pacific time"),
  );
  assert.equal(hasPriorAnswerText, true);
});
