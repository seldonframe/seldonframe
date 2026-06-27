// Agent Eval Harness — E5: the REAL Haiku-backed simulated CUSTOMER (parse + fail-soft).
//
// makeLlmCustomerSim mirrors score-llm/generate-scenarios: an injectable getClient,
// model read at call time (ANTHROPIC_EVAL_MODEL || a Haiku default), text blocks
// joined + fence-stripped + JSON-parsed DEFENSIVELY, FAIL-SOFT to { text:"", done:true }
// on every bad path (so the eval loop ENDS cleanly). These tests pin the parse + the
// fail-soft + that the prompt carries the persona — all off a FAKE client (NO network).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeLlmCustomerSim,
  parseSimResponse,
} from "../../../../src/lib/agents/evals/sim-llm";
import type { EvalScenario, EvalTurn } from "../../../../src/lib/agents/evals/eval-types";

type GetClient = NonNullable<
  NonNullable<Parameters<typeof makeLlmCustomerSim>[0]>["getClient"]
>;
type FakeClient = ReturnType<GetClient>;

/** A narrow fake Anthropic client returning a fixed text block (the sim only reads
 *  the text blocks). Mirrors score-llm.spec's fakeClientReturning. */
function fakeClientReturning(text: string): FakeClient {
  return {
    messages: {
      create: async () => ({ content: [{ type: "text", text }] }),
    },
  } as unknown as FakeClient;
}

/** A fake client that CAPTURES the create() args so a test can assert the prompt
 *  carried the persona. Returns a benign JSON reply. */
function capturingClient(): {
  client: FakeClient;
  calls: Array<{ system?: string; messages?: Array<{ content?: unknown }> }>;
} {
  const calls: Array<{ system?: string; messages?: Array<{ content?: unknown }> }> = [];
  const client = {
    messages: {
      create: async (args: { system?: string; messages?: Array<{ content?: unknown }> }) => {
        calls.push(args);
        return { content: [{ type: "text", text: '{"text":"ok","done":false}' }] };
      },
    },
  } as unknown as FakeClient;
  return { client, calls };
}

const SCENARIO: EvalScenario = {
  id: "s1",
  title: "No-heat emergency at 11pm",
  persona: "A frazzled homeowner whose furnace just died on the coldest night of the year.",
  opening: "My furnace just died and it's freezing.",
  successCriteria: ["books an emergency visit"],
  mustDo: [],
  mustNotDo: ["quote a firm price"],
};

const TURNS: EvalTurn[] = [
  { role: "customer", text: "My furnace just died and it's freezing." },
  { role: "agent", text: "I'm sorry to hear that. What's the service address?" },
];

describe("makeLlmCustomerSim — a fake client → a sim reply", () => {
  test("well-formed JSON → { text, done }", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () =>
        fakeClientReturning('{"text":"It\'s 42 Elm Street.","done":false}'),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.equal(out.text, "It's 42 Elm Street.");
    assert.equal(out.done, false);
  });

  test("a ```json fenced reply is stripped + parsed", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () =>
        fakeClientReturning('```json\n{"text":"All set, thanks!","done":true}\n```'),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.equal(out.text, "All set, thanks!");
    assert.equal(out.done, true);
  });

  test("done defaults to false when the model omits it (text present)", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () => fakeClientReturning('{"text":"and how much will it cost?"}'),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.equal(out.text, "and how much will it cost?");
    assert.equal(out.done, false);
  });
});

describe("makeLlmCustomerSim — malformed → { text:'', done:true } fail-soft (loop ends)", () => {
  test("malformed JSON → { text:'', done:true }", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () => fakeClientReturning("this is not json {oops"),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.deepEqual(out, { text: "", done: true });
  });

  test("a non-object JSON (array) → { text:'', done:true }", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () => fakeClientReturning('["nope"]'),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.deepEqual(out, { text: "", done: true });
  });

  test("a well-formed object with empty text → done:true (nothing to add ends the loop)", async () => {
    const sim = makeLlmCustomerSim({
      getClient: () => fakeClientReturning('{"text":"   ","done":false}'),
    });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.equal(out.text.trim(), "");
    assert.equal(out.done, true);
  });

  test("a null client (no API key) → { text:'', done:true } without a network call", async () => {
    const sim = makeLlmCustomerSim({ getClient: () => null });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.deepEqual(out, { text: "", done: true });
  });

  test("a client whose create() throws → { text:'', done:true } (never throws)", async () => {
    const throwingClient = {
      messages: {
        create: async () => {
          throw new Error("network exploded");
        },
      },
    } as unknown as FakeClient;
    const sim = makeLlmCustomerSim({ getClient: () => throwingClient });
    const out = await sim({ scenario: SCENARIO, turns: TURNS });
    assert.deepEqual(out, { text: "", done: true });
  });
});

describe("makeLlmCustomerSim — the prompt carries the persona", () => {
  test("the persona text is present in the call payload (system or user)", async () => {
    const { client, calls } = capturingClient();
    const sim = makeLlmCustomerSim({ getClient: () => client });
    await sim({ scenario: SCENARIO, turns: TURNS });

    assert.equal(calls.length, 1, "exactly one Anthropic call");
    const call = calls[0];
    // The user content carries a JSON view of the scenario, including the persona.
    const userContent = call.messages?.[0]?.content;
    const userStr = typeof userContent === "string" ? userContent : JSON.stringify(userContent);
    assert.ok(
      userStr.includes("frazzled homeowner whose furnace just died"),
      "the customer persona must be in the prompt so the sim stays in character",
    );
    // And the system prompt frames the model AS the customer.
    assert.ok(
      typeof call.system === "string" && /customer/i.test(call.system),
      "the system prompt should instruct the model to play the customer",
    );
  });
});

// parseSimResponse pinned directly — the pure fail-soft/parse core.
describe("parseSimResponse — pure parse + fail-soft", () => {
  test("non-string input → { text:'', done:true }", () => {
    assert.deepEqual(parseSimResponse(undefined as unknown as string), {
      text: "",
      done: true,
    });
  });

  test("empty string → { text:'', done:true }", () => {
    assert.deepEqual(parseSimResponse("   "), { text: "", done: true });
  });

  test("well-formed → preserves text + done", () => {
    assert.deepEqual(parseSimResponse('{"text":"hello","done":true}'), {
      text: "hello",
      done: true,
    });
  });
});
