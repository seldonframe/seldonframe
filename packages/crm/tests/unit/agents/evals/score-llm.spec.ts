// Agent Eval Harness — E3: the REAL Haiku-backed eval grader (parse + fail-soft).
//
// makeLlmEvalGrader mirrors judge-llm: an injectable getClient, model read at call
// time (ANTHROPIC_EVAL_MODEL || a Haiku default), text blocks joined + fence-
// stripped + JSON-parsed DEFENSIVELY, FAIL-SOFT to {met:[],missed:[]} on every bad
// path. These tests pin the parse + the fail-soft off a FAKE client — NO network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { makeLlmEvalGrader, parseGraderResponse } from "../../../../src/lib/agents/evals/score-llm";
import type { EvalScenario, EvalTranscript } from "../../../../src/lib/agents/evals/eval-types";

/** A narrow fake Anthropic client returning a fixed text block, cast to the
 *  grader's getClient return type (the grader only reads the text blocks).
 *  Mirrors judge-prose-safety.spec's capturingClient. */
function fakeClientReturning(text: string): ReturnType<
  NonNullable<NonNullable<Parameters<typeof makeLlmEvalGrader>[0]>["getClient"]>
> {
  return {
    messages: {
      create: async () => ({ content: [{ type: "text", text }] }),
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmEvalGrader>[0]>["getClient"]>
  >;
}

/** A fake client that records the `system` + `messages` it was called with (and
 *  returns a fixed verdict), so a test can assert what prompt the grader sent. */
function capturingClient(): {
  client: ReturnType<NonNullable<NonNullable<Parameters<typeof makeLlmEvalGrader>[0]>["getClient"]>>;
  calls: { system?: string; userContent?: string }[];
} {
  const calls: { system?: string; userContent?: string }[] = [];
  const client = {
    messages: {
      create: async (req: { system?: string; messages?: { content?: string }[] }) => {
        calls.push({ system: req?.system, userContent: req?.messages?.[0]?.content });
        return { content: [{ type: "text", text: '{"met":[],"missed":[]}' }] };
      },
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeLlmEvalGrader>[0]>["getClient"]>
  >;
  return { client, calls };
}

const SCENARIO: EvalScenario = {
  id: "s1",
  title: "No-heat emergency at 11pm",
  persona: "A homeowner whose furnace died.",
  opening: "My furnace just died.",
  successCriteria: ["books an emergency visit", "asks for the address"],
  mustDo: [],
  mustNotDo: [],
};

const TRANSCRIPT: EvalTranscript = {
  scenarioId: "s1",
  turns: [
    { role: "customer", text: "My furnace just died." },
    { role: "agent", text: "What's the service address? I'll dispatch a tech." },
  ],
};

describe("makeLlmEvalGrader — malformed JSON fails soft", () => {
  test("a fake client returning malformed JSON → { met:[], missed:[] }", async () => {
    const grader = makeLlmEvalGrader({ getClient: () => fakeClientReturning("this is not json {oops") });
    const out = await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });
    assert.deepEqual(out, { met: [], missed: [] });
  });

  test("a null client (no API key) → { met:[], missed:[] } without a network call", async () => {
    const grader = makeLlmEvalGrader({ getClient: () => null });
    const out = await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });
    assert.deepEqual(out, { met: [], missed: [] });
  });
});

describe("makeLlmEvalGrader — well-formed verdicts parse", () => {
  test("clean JSON → met/missed/notes carried through", async () => {
    const body = JSON.stringify({
      met: ["books an emergency visit"],
      missed: ["asks for the address"],
      notes: "never asked for the address",
    });
    const grader = makeLlmEvalGrader({ getClient: () => fakeClientReturning(body) });
    const out = await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });
    assert.deepEqual(out.met, ["books an emergency visit"]);
    assert.deepEqual(out.missed, ["asks for the address"]);
    assert.equal(out.notes, "never asked for the address");
  });

  test("a ```json fenced verdict is unwrapped and parsed", async () => {
    const body = "```json\n" + JSON.stringify({ met: ["x"], missed: [] }) + "\n```";
    const grader = makeLlmEvalGrader({ getClient: () => fakeClientReturning(body) });
    const out = await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });
    assert.deepEqual(out.met, ["x"]);
    assert.deepEqual(out.missed, []);
  });

  test("no success criteria → short-circuits to soft verdict (no client call needed)", async () => {
    let called = false;
    const grader = makeLlmEvalGrader({
      getClient: () => {
        called = true;
        return fakeClientReturning('{"met":["x"],"missed":[]}');
      },
    });
    const out = await grader({
      transcript: TRANSCRIPT,
      scenario: { ...SCENARIO, successCriteria: [] },
    });
    assert.deepEqual(out, { met: [], missed: [] });
    assert.equal(called, false, "grader should not touch the client when there are no criteria");
  });
});

describe("makeLlmEvalGrader — sandbox-aware grading prompt", () => {
  test("the grader system prompt tells the judge this ran in SANDBOX and to grade BEHAVIOR, not real side-effects", async () => {
    const { client, calls } = capturingClient();
    const grader = makeLlmEvalGrader({ getClient: () => client });
    await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });

    assert.equal(calls.length, 1, "grader should make exactly one LLM call");
    const system = calls[0].system ?? "";
    // The calibration: name the sandbox + grade behavior, not real-world effects.
    assert.match(system, /SANDBOX/);
    assert.match(system, /SYNTHETIC/);
    assert.match(system, /BEHAVIOR/);
    // It must explicitly forbid failing a criterion just because no real
    // booking/SMS happened (the bug that sank a great agent to 20%).
    assert.match(system, /Do NOT fail a criterion merely because a real booking\/SMS didn't occur/);
    // And it must still credit the RIGHT actions (calling the tool IS correct).
    assert.match(system, /RIGHT ACTIONS/);
  });

  test("the user content also flags the run as [SANDBOX] so the note is unmistakable", async () => {
    const { client, calls } = capturingClient();
    const grader = makeLlmEvalGrader({ getClient: () => client });
    await grader({ transcript: TRANSCRIPT, scenario: SCENARIO });

    const userContent = calls[0].userContent ?? "";
    assert.match(userContent, /\[SANDBOX\]/);
    assert.match(userContent, /SYNTHETIC/);
  });
});

describe("parseGraderResponse — defensive", () => {
  test("non-string / empty / non-object → soft empties", () => {
    assert.deepEqual(parseGraderResponse(undefined as unknown as string), { met: [], missed: [] });
    assert.deepEqual(parseGraderResponse(""), { met: [], missed: [] });
    assert.deepEqual(parseGraderResponse("[1,2,3]"), { met: [], missed: [] });
  });

  test("garbage member types are dropped, not thrown on", () => {
    const out = parseGraderResponse(JSON.stringify({ met: ["ok", 5, null], missed: "nope" }));
    assert.deepEqual(out.met, ["ok"]); // 5 and null dropped
    assert.deepEqual(out.missed, []); // a non-array `missed` → []
  });
});
