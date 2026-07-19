import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { interviewTurn, decomposeAnswers } from "@/lib/recordings/interview";
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
      assert.equal(result.applied, true);
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
      assert.equal(result.applied, true);
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

  test("merge fails twice but a reply was produced → 200-path result, applied:false, model unchanged, honest reply", async () => {
    const model = fakeModel();
    const { llm } = queueLlm([
      { reply: "oops", model: { title: "" }, openQuestions: [] },
      { reply: "still oops", model: { title: "" }, openQuestions: [] },
    ]);
    const result = await interviewTurn({ model, interviewLog: [], message: "hi", llm });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, false);
      assert.deepEqual(result.model, model);
      assert.deepEqual(result.openQuestions, model.openQuestions);
      assert.match(result.reply, /couldn't apply|could not|rephrase/i);
    }
  });

  test("the llm call itself fails outright (no usable reply on either attempt) → ok:false unchanged", async () => {
    const { llm } = queueLlm([{ oops: true }, { oops: true }]);
    const result = await interviewTurn({ model: fakeModel(), interviewLog: [], message: "hi", llm });
    assert.equal(result.ok, false);
  });

  // ─── interview-merge decomposition (agent lifecycle slice) ────────────────

  function twoQuestionModel(): FlowModel {
    return { ...fakeModel(), openQuestions: ["What if the client has no email?", "Who approves the invoice?"] };
  }

  test("single open question → no decompose call — exactly one llm call, direct path unchanged", async () => {
    const model = fakeModel(); // one open question
    const { llm, requests } = queueLlm([{ reply: "ok", model, openQuestions: [] }]);
    const result = await interviewTurn({ model, interviewLog: [], message: "fall back to the phone", llm });
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
  });

  test("multi-answer message with >=2 open questions decomposes into 2 sequential per-pair merges, both applied", async () => {
    const model = twoQuestionModel();
    const merged1: FlowModel = { ...model, constants: ["fall back to the phone"] };
    const merged2: FlowModel = { ...merged1, variables: ["invoice approver: office manager"] };
    const { llm, requests } = queueLlm([
      // 1. decompose
      {
        pairs: [
          { question: "What if the client has no email?", answer: "fall back to the phone" },
          { question: "Who approves the invoice?", answer: "the office manager" },
        ],
      },
      // 2. merge pair 1
      { reply: "Got it — falling back to the phone.", model: merged1, openQuestions: ["Who approves the invoice?"] },
      // 3. merge pair 2
      { reply: "Got it — the office manager approves.", model: merged2, openQuestions: [] },
    ]);
    const result = await interviewTurn({
      model,
      interviewLog: [],
      message: "No email? Call them. Invoices are approved by the office manager.",
      llm,
    });
    assert.equal(requests.length, 3);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, true);
      assert.deepEqual(result.model.constants, merged2.constants);
      assert.deepEqual(result.model.variables, merged2.variables);
      assert.deepEqual(result.openQuestions, []);
      assert.equal(result.appliedPairs?.length, 2);
      assert.match(result.reply, /no email/i);
      assert.match(result.reply, /approves the invoice/i);
    }
  });

  test("pair 2's merge fails twice → pair 1 still applied, honest partial reply naming what didn't apply", async () => {
    const model = twoQuestionModel();
    const merged1: FlowModel = { ...model, constants: ["fall back to the phone"] };
    const { llm, requests } = queueLlm([
      // 1. decompose
      {
        pairs: [
          { question: "What if the client has no email?", answer: "fall back to the phone" },
          { question: "Who approves the invoice?", answer: "the office manager" },
        ],
      },
      // 2. merge pair 1 — succeeds
      { reply: "Got it — falling back to the phone.", model: merged1, openQuestions: ["Who approves the invoice?"] },
      // 3+4. merge pair 2 — fails both attempts (malformed model both times)
      { reply: "oops", model: { title: "" }, openQuestions: [] },
      { reply: "still oops", model: { title: "" }, openQuestions: [] },
    ]);
    const result = await interviewTurn({
      model,
      interviewLog: [],
      message: "No email? Call them. Invoices are approved by the office manager.",
      llm,
    });
    assert.equal(requests.length, 4);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.applied, true); // at least one pair applied
      assert.deepEqual(result.model.constants, merged1.constants);
      assert.equal(result.appliedPairs?.length, 1);
      assert.equal(result.appliedPairs?.[0]?.answer, "fall back to the phone");
      assert.match(result.reply, /couldn't apply|could not|rephrase|approves the invoice/i);
    }
  });

  test("decompose returns null (malformed) → falls back to the existing direct path unchanged", async () => {
    const model = twoQuestionModel();
    const { llm, requests } = queueLlm([
      // 1. decompose — malformed, no 'pairs' array
      { oops: true },
      // 2. direct-path merge (unchanged behavior)
      { reply: "ok", model, openQuestions: [] },
    ]);
    const result = await interviewTurn({ model, interviewLog: [], message: "some answer", llm });
    assert.equal(requests.length, 2);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.reply, "ok");
  });

  test("decompose returns fewer than 2 pairs → falls back to the existing direct path unchanged", async () => {
    const model = twoQuestionModel();
    const { llm, requests } = queueLlm([
      // 1. decompose — only 1 pair, below the >=2 threshold
      { pairs: [{ question: "What if the client has no email?", answer: "fall back to the phone" }] },
      // 2. direct-path merge
      { reply: "ok", model, openQuestions: [] },
    ]);
    const result = await interviewTurn({ model, interviewLog: [], message: "fall back to the phone", llm });
    assert.equal(requests.length, 2);
    assert.equal(result.ok, true);
  });
});

// ── decomposeAnswers ─────────────────────────────────────────────────────────

describe("decomposeAnswers", () => {
  test("happy path: one llm call, returns the parsed pairs", async () => {
    const { llm, requests } = queueLlm([
      { pairs: [{ question: "Q1?", answer: "A1" }, { question: "Q2?", answer: "A2" }] },
    ]);
    const result = await decomposeAnswers(
      { llm },
      { message: "A1. Also A2.", openQuestions: ["Q1?", "Q2?"] },
    );
    assert.equal(requests.length, 1);
    assert.deepEqual(result, { pairs: [{ question: "Q1?", answer: "A1" }, { question: "Q2?", answer: "A2" }] });
  });

  test("malformed response (no pairs array) → null, never throws", async () => {
    const { llm } = queueLlm([{ oops: true }]);
    const result = await decomposeAnswers({ llm }, { message: "hi", openQuestions: ["Q1?", "Q2?"] });
    assert.equal(result, null);
  });

  test("non-object response → null", async () => {
    const { llm } = queueLlm(["just a string"]);
    const result = await decomposeAnswers({ llm }, { message: "hi", openQuestions: ["Q1?", "Q2?"] });
    assert.equal(result, null);
  });

  test("llm throws → null, never propagates", async () => {
    const llm: TraceLlm = async () => {
      throw new Error("network down");
    };
    const result = await decomposeAnswers({ llm }, { message: "hi", openQuestions: ["Q1?", "Q2?"] });
    assert.equal(result, null);
  });
});

// ## As-built deltas
// - 2026-07-10: interviewTurn no longer returns ok:false when the model-merge
//   fails FlowModelSchema validation on both attempts but a reply was
//   produced — it now returns `ok: true, applied: false` with an honest
//   "couldn't apply that" reply and the INPUT model/openQuestions unchanged,
//   so a long/ambiguous answer fails soft instead of losing the turn to a
//   422. `ok: false` is now reserved for the no-usable-reply-at-all case.
