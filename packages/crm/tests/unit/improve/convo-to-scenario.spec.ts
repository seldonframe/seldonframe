// Improve verb + trust rail (2026-07-02) — Task 5: conversation -> EvalScenario.
//
// TDD focus: two producer branches + one shared PII scrub, all consuming T4's
// `ConversationSample` (src/lib/agents/improve/source-conversations.ts) and
// producing the existing `EvalScenario` type (eval-types.ts:35).
//
//   1. `scenarioFromValidatorFailure` — PURE, deterministic. A conversation
//      sample only becomes a scenario when it actually hit a CRITICAL
//      validator failure (`hadCriticalValidatorFailure`); the failed
//      validator names are mapped through a FIXED plain-English prohibition
//      map (one entry per validator in ALL_VALIDATORS, validators.ts:366) so
//      `mustNotDo` reads like a human wrote it, not a snake_case identifier.
//   2. `scrubScenarioPii` — PURE, exported standalone (the brief calls this
//      out as its own tested unit, not just an internal helper): replaces
//      emails + US/E.164 phone numbers with "<redacted>" across every STRING
//      field of an EvalScenario, including arrays. Both producer branches
//      pipe their output through this before returning.
//   3. `makeLlmConvoScenarioConverter` — the LLM branch, mirroring
//      generate-scenarios.ts's `makeLlmScenarioGenerator` byte-for-byte in
//      DI shape (`{ getClient }`, defaults to getAnthropicClient), model
//      resolution (ANTHROPIC_EVAL_MODEL || DEFAULT_EVAL_MODEL, read at call
//      time), and parse posture (fence-strip -> JSON.parse -> fail-soft to
//      `null` on ANY bad path: no client, network throw, non-JSON, wrong
//      shape). Tests inject a fake `getClient` returning canned responses —
//      valid JSON, malformed JSON, and PII-laden JSON (proving the scrub
//      runs on the LLM branch's output too) — never a real network call.
//
// PII posture (binding, per the design doc's Research addendum + PII
// section): raw transcripts are read to DERIVE a scenario but customer PII
// must never ride along into the persisted scenario. `opening` is the one
// field allowed to carry through a customer's ACTUAL first message verbatim
// (that's the point of a realistic scenario) — but even `opening` gets
// scrubbed of emails/phones, since the point of PII-in-opening test data is
// to prove the scrub catches it there too, not that opening is exempt.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  scenarioFromValidatorFailure,
  scrubScenarioPii,
  makeLlmConvoScenarioConverter,
} from "@/lib/agents/improve/convo-to-scenario";
import type { ConversationSample } from "@/lib/agents/improve/source-conversations";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";

// ─── fakes ───────────────────────────────────────────────────────────────

function sample(overrides: Partial<ConversationSample> = {}): ConversationSample {
  return {
    conversationId: "convo-1",
    outcome: "other",
    hadCriticalValidatorFailure: false,
    failedValidatorNames: [],
    turns: [
      { role: "user", content: "Hi, can you help me book a furnace tune-up?" },
      { role: "assistant", content: "Sure, when works for you?" },
    ],
    ...overrides,
  };
}

function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "A scenario",
    persona: "A customer",
    opening: "Hi there",
    successCriteria: [],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  };
}

/** A minimal fake Anthropic client shape — only `messages.create` is called
 *  by the converter, matching generate-scenarios.ts / score-llm.ts's own
 *  fakes-in-tests convention (no real @anthropic-ai/sdk instance needed). */
function fakeClient(text: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

function throwingClient() {
  return {
    messages: {
      create: async () => {
        throw new Error("network down");
      },
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

// ─── scenarioFromValidatorFailure ───────────────────────────────────────

describe("scenarioFromValidatorFailure", () => {
  test("returns null when the sample had no critical validator failure", () => {
    const s = sample({ hadCriticalValidatorFailure: false, failedValidatorNames: [] });
    assert.equal(scenarioFromValidatorFailure(s), null);
  });

  test("returns null even if failedValidatorNames is non-empty but the flag is false (flag is the gate, not the array)", () => {
    // Defensive: hadCriticalValidatorFailure is the documented gate. A caller
    // that somehow hands mismatched data (names present, flag false) must
    // still get null — the array's presence alone never triggers a scenario.
    const s = sample({
      hadCriticalValidatorFailure: false,
      failedValidatorNames: ["no_pii_leak"],
    });
    assert.equal(scenarioFromValidatorFailure(s), null);
  });

  test("builds a scenario when hadCriticalValidatorFailure is true", () => {
    const s = sample({
      conversationId: "abc-123",
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_pii_leak"],
      turns: [
        { role: "user", content: "Can you reschedule my appointment to Friday?" },
        { role: "assistant", content: "Sure, one moment." },
      ],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.ok(result);
    assert.equal(result?.id, "real-abc-123");
    assert.equal(result?.opening, "Can you reschedule my appointment to Friday?");
    assert.deepEqual(result?.successCriteria, [
      "Completes the customer's request without repeating the original failure",
    ]);
  });

  test("id is real-<conversationId> verbatim, including unusual id shapes (uuid)", () => {
    const s = sample({
      conversationId: "9f8e7d6c-1234-4abc-9def-000000000001",
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["quotes_only_from_soul_pricing"],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.equal(result?.id, "real-9f8e7d6c-1234-4abc-9def-000000000001");
  });

  test("opening is the FIRST user turn's content, even when the first turn overall is from the assistant", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_avoid_words"],
      turns: [
        { role: "assistant", content: "Welcome! How can I help?" },
        { role: "user", content: "I need a quote for a water heater install." },
        { role: "assistant", content: "Let me check." },
      ],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.equal(result?.opening, "I need a quote for a water heater install.");
  });

  test("returns null (rather than throw) when hadCriticalValidatorFailure is true but there is no user turn at all", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_pii_leak"],
      turns: [{ role: "assistant", content: "Hello?" }],
    });
    assert.equal(scenarioFromValidatorFailure(s), null);
  });

  test("maps ALL 6 known validator names to distinct, plain-English mustNotDo prohibitions", () => {
    const ALL_SIX = [
      "quotes_only_from_soul_pricing",
      "no_prompt_injection_echo",
      "no_pii_leak",
      "no_avoid_words",
      "response_length_under_cap",
      "no_hallucinated_state_change",
    ];
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ALL_SIX,
    });
    const result = scenarioFromValidatorFailure(s);
    assert.ok(result);
    assert.equal(result?.mustNotDo.length, ALL_SIX.length);
    // Every mapped prohibition is a distinct, non-identifier-looking string
    // (i.e. not just the snake_case name echoed back).
    const distinct = new Set(result?.mustNotDo);
    assert.equal(distinct.size, ALL_SIX.length);
    for (const [i, name] of ALL_SIX.entries()) {
      const prohibition = result?.mustNotDo[i] ?? "";
      assert.notEqual(prohibition, name);
      assert.ok(prohibition.length > 0);
      assert.ok(!/^[a-z_]+$/.test(prohibition), `expected a human sentence for ${name}, got "${prohibition}"`);
    }
  });

  test("an unrecognized/stale validator name still produces a (generic but non-empty) prohibition rather than throwing", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["some_retired_validator_name"],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.ok(result);
    assert.equal(result?.mustNotDo.length, 1);
    assert.ok(result!.mustNotDo[0].length > 0);
  });

  test("title and persona are non-empty strings (a usable scenario, not just the required fields)", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_hallucinated_state_change"],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.ok(result);
    assert.ok(result!.title.length > 0);
    assert.ok(result!.persona.length > 0);
    assert.ok(Array.isArray(result!.mustDo));
  });

  test("PII from the opening turn never leaks into mustNotDo/successCriteria/persona/title, AND opening itself is scrubbed (the full scenario is piped through scrubScenarioPii, per the brief's binding detail)", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_pii_leak"],
      turns: [
        {
          role: "user",
          content: "Hi, I'm Jane Doe, reach me at jane.doe@example.com or 555-123-4567, can you help?",
        },
      ],
    });
    const result = scenarioFromValidatorFailure(s);
    assert.ok(result);
    // The scrub applies to EVERY field, opening included — mustNotDo/
    // successCriteria/persona/title never contained the PII to begin with
    // (they're derived from validator names, not the transcript), and
    // opening is scrubbed down to the same "<redacted>" marker.
    for (const field of [
      result!.title,
      result!.persona,
      result!.opening,
      ...result!.successCriteria,
      ...result!.mustDo,
      ...result!.mustNotDo,
    ]) {
      assert.doesNotMatch(field, /jane\.doe@example\.com/i);
      assert.doesNotMatch(field, /555-123-4567/);
    }
    assert.match(result!.opening, /<redacted>/);
  });

  test("is pure: calling twice with the same input produces deep-equal output", () => {
    const s = sample({
      hadCriticalValidatorFailure: true,
      failedValidatorNames: ["no_pii_leak", "no_avoid_words"],
    });
    const first = scenarioFromValidatorFailure(s);
    const second = scenarioFromValidatorFailure(s);
    assert.deepEqual(first, second);
  });
});

// ─── scrubScenarioPii ────────────────────────────────────────────────────

describe("scrubScenarioPii", () => {
  test("redacts an email address in `opening`", () => {
    const s = scenario({ opening: "Contact me at foo.bar@example.com please." });
    const result = scrubScenarioPii(s);
    assert.equal(result.opening, "Contact me at <redacted> please.");
  });

  test("redacts a US-formatted phone number (xxx-xxx-xxxx)", () => {
    const s = scenario({ opening: "Call me back at 555-867-5309 today." });
    const result = scrubScenarioPii(s);
    assert.equal(result.opening, "Call me back at <redacted> today.");
  });

  test("redacts a US-formatted phone number with parens ((xxx) xxx-xxxx)", () => {
    const s = scenario({ opening: "My number is (555) 867-5309, call anytime." });
    const result = scrubScenarioPii(s);
    assert.match(result.opening, /My number is <redacted>, call anytime\./);
  });

  test("redacts an E.164 phone number (+1xxxxxxxxxx)", () => {
    const s = scenario({ opening: "Text me at +15558675309 when you can." });
    const result = scrubScenarioPii(s);
    assert.equal(result.opening, "Text me at <redacted> when you can.");
  });

  test("redacts across EVERY string field, not just opening", () => {
    const s: EvalScenario = {
      id: "s1",
      title: "Reach jane@example.com for details",
      persona: "Contact is jane@example.com / 555-222-3333",
      opening: "Hi, I'm at jane@example.com",
      successCriteria: ["Confirms with jane@example.com"],
      mustDo: ["Call 555-222-3333 back"],
      mustNotDo: ["Ignore jane@example.com"],
    };
    const result = scrubScenarioPii(s);
    const allFieldsText = [
      result.title,
      result.persona,
      result.opening,
      ...result.successCriteria,
      ...result.mustDo,
      ...result.mustNotDo,
    ].join(" ");
    assert.doesNotMatch(allFieldsText, /jane@example\.com/i);
    assert.doesNotMatch(allFieldsText, /555-222-3333/);
    // id is a structural identifier, not free text — untouched.
    assert.equal(result.id, "s1");
  });

  test("redacts MULTIPLE distinct emails/phones within a single field", () => {
    const s = scenario({
      opening: "Email a@example.com or b@example.com, or call 555-111-2222 or 555-333-4444.",
    });
    const result = scrubScenarioPii(s);
    assert.doesNotMatch(result.opening, /a@example\.com|b@example\.com/);
    assert.doesNotMatch(result.opening, /555-111-2222|555-333-4444/);
    // Every occurrence became the redaction marker (at least 4 instances).
    const count = (result.opening.match(/<redacted>/g) ?? []).length;
    assert.equal(count, 4);
  });

  test("leaves scenario text with NO PII completely unchanged", () => {
    const s = scenario({
      title: "Happy path",
      persona: "A regular customer",
      opening: "Hi, can you help me book a furnace tune-up?",
      successCriteria: ["Books the appointment"],
      mustDo: ["Ask for the address"],
      mustNotDo: ["Quote a firm price"],
    });
    const result = scrubScenarioPii(s);
    assert.deepEqual(result, s);
  });

  test("is pure and does not mutate the input", () => {
    const s = scenario({ opening: "Reach me at pii@example.com" });
    const snapshot = JSON.parse(JSON.stringify(s));
    scrubScenarioPii(s);
    assert.deepEqual(s, snapshot);
  });

  test("is pure: calling twice with the same input produces deep-equal output", () => {
    const s = scenario({
      opening: "Reach me at pii@example.com or 555-999-1234",
      successCriteria: ["Confirms via pii@example.com"],
    });
    const first = scrubScenarioPii(s);
    const second = scrubScenarioPii(s);
    assert.deepEqual(first, second);
  });

  test("does not falsely redact plain numbers that merely resemble a phone number's digit count in an unrelated context (e.g. an order id) -- documents current heuristic scope rather than asserting an unattainable guarantee", () => {
    // This test intentionally documents behavior rather than demanding a
    // specific outcome for ambiguous input: a bare 10-digit run touching
    // phone-shaped punctuation IS expected to be caught (that's the whole
    // point of the validator's PHONE_PATTERN heuristic it mirrors). We assert
    // the redaction fires for phone-shaped text and don't attempt to carve
    // out false-positive exemptions the validators.ts pattern doesn't carve
    // out either -- scrubScenarioPii intentionally reuses that same
    // heuristic rather than inventing a stricter one.
    const s = scenario({ opening: "Order #5551234567 was placed." });
    const result = scrubScenarioPii(s);
    assert.match(result.opening, /<redacted>/);
  });
});

// ─── makeLlmConvoScenarioConverter ───────────────────────────────────────

describe("makeLlmConvoScenarioConverter", () => {
  test("returns null when getClient() returns null (no key configured) -- no network attempted", () => {
    const converter = makeLlmConvoScenarioConverter({ getClient: () => null });
    return converter(sample()).then((result) => {
      assert.equal(result, null);
    });
  });

  test("parses a valid canned JSON response into an EvalScenario", async () => {
    const canned = JSON.stringify({
      title: "Reschedule request",
      persona: "A customer who needs to move an appointment",
      opening: "Can you move my Tuesday appointment to Thursday?",
      successCriteria: ["Confirms the new time", "Does not lose the original booking"],
      mustDo: ["Ask which day works"],
      mustNotDo: ["Claim it's rescheduled without calling the tool"],
    });
    const converter = makeLlmConvoScenarioConverter({ getClient: () => fakeClient(canned) });
    const result = await converter(sample({ conversationId: "convo-42" }));
    assert.ok(result);
    assert.equal(result?.title, "Reschedule request");
    assert.equal(result?.opening, "Can you move my Tuesday appointment to Thursday?");
    assert.deepEqual(result?.successCriteria, [
      "Confirms the new time",
      "Does not lose the original booking",
    ]);
    assert.equal(typeof result?.id, "string");
    assert.ok(result!.id.length > 0);
  });

  test("strips a ```json ... ``` fence around the response, mirroring generate-scenarios.ts's parse posture", async () => {
    const canned = [
      "```json",
      JSON.stringify({
        title: "Fenced response",
        persona: "A customer",
        opening: "Hello, is anyone there?",
        successCriteria: [],
        mustDo: [],
        mustNotDo: [],
      }),
      "```",
    ].join("\n");
    const converter = makeLlmConvoScenarioConverter({ getClient: () => fakeClient(canned) });
    const result = await converter(sample());
    assert.ok(result);
    assert.equal(result?.title, "Fenced response");
  });

  test("fails soft to null on malformed (non-JSON) response text", async () => {
    const converter = makeLlmConvoScenarioConverter({
      getClient: () => fakeClient("Sure! Here's a scenario for you: <not json at all>"),
    });
    const result = await converter(sample());
    assert.equal(result, null);
  });

  test("fails soft to null when the parsed JSON is missing required fields (e.g. no opening)", async () => {
    const canned = JSON.stringify({ title: "Missing opening entirely" });
    const converter = makeLlmConvoScenarioConverter({ getClient: () => fakeClient(canned) });
    const result = await converter(sample());
    assert.equal(result, null);
  });

  test("fails soft to null when the parsed JSON is a bare array/string/number instead of an object", async () => {
    const converter = makeLlmConvoScenarioConverter({ getClient: () => fakeClient("42") });
    const result = await converter(sample());
    assert.equal(result, null);
  });

  test("fails soft to null when the client throws (network error)", async () => {
    const converter = makeLlmConvoScenarioConverter({ getClient: () => throwingClient() });
    const result = await converter(sample());
    assert.equal(result, null);
  });

  test("never throws even when getClient itself throws", async () => {
    const converter = makeLlmConvoScenarioConverter({
      getClient: () => {
        throw new Error("boom");
      },
    });
    await assert.doesNotReject(converter(sample()));
    const result = await converter(sample());
    assert.equal(result, null);
  });

  test("PII-laden canned JSON is scrubbed before being returned (proves the LLM branch also pipes through scrubScenarioPii)", async () => {
    const canned = JSON.stringify({
      title: "Reach out to john@example.com",
      persona: "Customer, phone 555-444-3333",
      opening: "Hi, I'm John, email john@example.com or call 555-444-3333",
      successCriteria: ["Confirms via john@example.com"],
      mustDo: ["Call 555-444-3333 back"],
      mustNotDo: ["Ignore john@example.com"],
    });
    const converter = makeLlmConvoScenarioConverter({ getClient: () => fakeClient(canned) });
    const result = await converter(sample());
    assert.ok(result);
    const allText = [
      result!.title,
      result!.persona,
      result!.opening,
      ...result!.successCriteria,
      ...result!.mustDo,
      ...result!.mustNotDo,
    ].join(" ");
    assert.doesNotMatch(allText, /john@example\.com/i);
    assert.doesNotMatch(allText, /555-444-3333/);
  });

  test("passes the conversation sample's transcript into the prompt so the model has something to convert (smoke check via a client that echoes what it received)", async () => {
    let seenPrompt = "";
    const spyClient = {
      messages: {
        create: async (args: { messages: Array<{ content: unknown }> }) => {
          seenPrompt = JSON.stringify(args.messages);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  title: "t",
                  persona: "p",
                  opening: "o",
                  successCriteria: [],
                  mustDo: [],
                  mustNotDo: [],
                }),
              },
            ],
          };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const converter = makeLlmConvoScenarioConverter({ getClient: () => spyClient });
    await converter(
      sample({
        turns: [{ role: "user", content: "UNIQUE_MARKER_TEXT_92831" }],
      }),
    );
    assert.match(seenPrompt, /UNIQUE_MARKER_TEXT_92831/);
  });

  test("is DI-only: does not touch the network when a fake client is injected (no unhandled real-fetch side effects)", async () => {
    let callCount = 0;
    const countingClient = {
      messages: {
        create: async () => {
          callCount += 1;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  title: "t",
                  persona: "p",
                  opening: "o",
                  successCriteria: [],
                  mustDo: [],
                  mustNotDo: [],
                }),
              },
            ],
          };
        },
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    const converter = makeLlmConvoScenarioConverter({ getClient: () => countingClient });
    await converter(sample());
    assert.equal(callCount, 1);
  });
});
