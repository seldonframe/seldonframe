import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { interviewTurn } from "@/lib/recordings/interview";
import type { FlowModel, TraceLlm } from "@/lib/recordings/trace-schema";

function fakeModel(): FlowModel {
  return {
    title: "Onboard a new client",
    goal: "Get a new client set up in every system",
    apps: ["gmail"],
    steps: [
      { index: 0, app: "gmail", action: "send welcome email", intent: "greet the client", dataIn: [], dataOut: [], checks: [] },
    ],
    variables: [],
    constants: [],
    branches: [],
    openQuestions: ["What if the client has no email on file?"],
    recordingsSeen: 1,
    coverage: [],
  };
}

function queueLlm(responses: unknown[]): { llm: TraceLlm; requests: unknown[] } {
  const queue = [...responses];
  const requests: unknown[] = [];
  const llm: TraceLlm = async (req) => {
    requests.push(req);
    const next = queue.shift();
    if (next === undefined) throw new Error("fake llm: no more queued responses");
    return next;
  };
  return { llm, requests };
}

describe("interviewTurn", () => {
  test("happy path: produces a reply, passes through openQuestions, and returns the (unchanged) model", async () => {
    const model = fakeModel();
    const { llm } = queueLlm([
      { reply: "Good question — fall back to the phone number.", model, openQuestions: ["Anything else?"] },
    ]);
    const result = await interviewTurn({
      model,
      interviewLog: [],
      message: "What if there's no email?",
      llm,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reply, "Good question — fall back to the phone number.");
      assert.deepEqual(result.openQuestions, ["Anything else?"]);
      assert.equal(result.model.title, model.title);
    }
  });

  test("openQuestions defaults to [] when absent", async () => {
    const model = fakeModel();
    const { llm } = queueLlm([{ reply: "All clear.", model }]);
    const result = await interviewTurn({ model, interviewLog: [], message: "ok", llm });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.openQuestions, []);
  });

  test("malformed llm JSON (no reply field) → ok:false", async () => {
    const { llm } = queueLlm([{ oops: true }]);
    const result = await interviewTurn({ model: fakeModel(), interviewLog: [], message: "ok", llm });
    assert.equal(result.ok, false);
  });

  test("non-object llm response → ok:false", async () => {
    const { llm } = queueLlm(["just a string"]);
    const result = await interviewTurn({ model: fakeModel(), interviewLog: [], message: "ok", llm });
    assert.equal(result.ok, false);
  });

  test("no retry on a merely-malformed 'reply' shape — exactly one llm call per turn", async () => {
    const model = fakeModel();
    const { llm, requests } = queueLlm([{ reply: "ok", model, openQuestions: [] }]);
    await interviewTurn({ model, interviewLog: [], message: "hi", llm });
    assert.equal(requests.length, 1);
  });

  test("request includes prior interview log + the new message", async () => {
    const model = fakeModel();
    const { llm, requests } = queueLlm([{ reply: "ok", model, openQuestions: [] }]);
    await interviewTurn({
      model,
      interviewLog: [{ role: "user", text: "first question" }, { role: "seldon", text: "first answer" }],
      message: "second question",
      llm,
    });
    const req = requests[0] as { user: Array<{ type: string; text?: string }> };
    const text = req.user.map((part) => part.text ?? "").join("\n");
    assert.match(text, /first question/);
    assert.match(text, /first answer/);
    assert.match(text, /second question/);
  });

  // ─── model-updating: answers actually reach the FlowModel ────────────────

  test("an answer that adds a rule merges into the returned model — never-lies: what Seldon says it learned is what compiles", async () => {
    const model = fakeModel();
    const updatedModel: FlowModel = {
      ...model,
      constants: [...model.constants, "always cc the office manager"],
      recordingsSeen: 99, // the LLM's own counter — must be ignored
    };
    const { llm } = queueLlm([
      { reply: "Got it — I'll always cc the office manager.", model: updatedModel, openQuestions: [] },
    ]);
    const result = await interviewTurn({
      model,
      interviewLog: [],
      message: "Always cc the office manager on the welcome email.",
      llm,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.model.constants, ["always cc the office manager"]);
      // recordingsSeen is force-preserved from the INPUT model server-side —
      // never trusted from the LLM.
      assert.equal(result.model.recordingsSeen, model.recordingsSeen);
      // coverage is recomputed after the merge, not passed through verbatim —
      // one entry per step.
      assert.equal(result.model.coverage.length, result.model.steps.length);
    }
  });

  test("malformed model in the LLM response → one retry with VALIDATION_ERROR, then success", async () => {
    const model = fakeModel();
    const { llm, requests } = queueLlm([
      { reply: "oops", model: { title: "" /* invalid: empty */ }, openQuestions: [] },
      { reply: "fixed", model, openQuestions: [] },
    ]);
    const result = await interviewTurn({ model, interviewLog: [], message: "hi", llm });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.reply, "fixed");
    assert.equal(requests.length, 2);
    const retryReq = requests[1] as { user: Array<{ type: string; text?: string }> };
    const retryText = retryReq.user.map((part) => part.text ?? "").join("\n");
    assert.match(retryText, /VALIDATION_ERROR/);
  });

  test("malformed model persists after retry → ok:false", async () => {
    const model = fakeModel();
    const { llm } = queueLlm([
      { reply: "oops", model: { title: "" }, openQuestions: [] },
      { reply: "still oops", model: { title: "" }, openQuestions: [] },
    ]);
    const result = await interviewTurn({ model, interviewLog: [], message: "hi", llm });
    assert.equal(result.ok, false);
  });
});
