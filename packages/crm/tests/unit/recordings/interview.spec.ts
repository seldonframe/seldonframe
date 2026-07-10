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
  test("happy path: produces a reply and passes through openQuestions", async () => {
    const { llm } = queueLlm([{ reply: "Good question — fall back to the phone number.", openQuestions: ["Anything else?"] }]);
    const result = await interviewTurn({
      model: fakeModel(),
      interviewLog: [],
      message: "What if there's no email?",
      llm,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.reply, "Good question — fall back to the phone number.");
      assert.deepEqual(result.openQuestions, ["Anything else?"]);
    }
  });

  test("openQuestions defaults to [] when absent", async () => {
    const { llm } = queueLlm([{ reply: "All clear." }]);
    const result = await interviewTurn({ model: fakeModel(), interviewLog: [], message: "ok", llm });
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

  test("no retry — exactly one llm call per turn", async () => {
    const { llm, requests } = queueLlm([{ reply: "ok", openQuestions: [] }]);
    await interviewTurn({ model: fakeModel(), interviewLog: [], message: "hi", llm });
    assert.equal(requests.length, 1);
  });

  test("request includes prior interview log + the new message", async () => {
    const { llm, requests } = queueLlm([{ reply: "ok", openQuestions: [] }]);
    await interviewTurn({
      model: fakeModel(),
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
});
