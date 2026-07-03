// Improve verb + trust rail (2026-07-02) — Task 4: real-conversation sourcing
// + stratified sampling.
//
// TDD focus: `planConversationSample` is a PURE function — no I/O, no clock,
// no randomness — that decides WHICH conversation ids make the sample, given
// only the lightweight candidate summaries. Per the spec's binding Research
// addendum (docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md,
// "Research addendum" section), sampling priority is:
//
//   1. conversations with `hadCriticalValidatorFailure`, NEWEST FIRST
//   2. conversations with `hasNegativeOperatorQuality` (that were NOT already
//      picked in step 1), NEWEST FIRST
//   3. round-robin across outcome buckets (booked / message / abandoned /
//      other) across the REMAINING candidates, to fill to `sampleSize`
//
// "Newest first" is expressed via candidate ARRAY ORDER (the caller is
// expected to pass candidates already ordered newest-first, exactly like the
// db loader's `ORDER BY lastTurnAt DESC` — this pure function does no date
// parsing/comparison itself, consistent with the eval-runs-store precedent of
// pure functions carrying values through verbatim rather than re-deriving
// them). Each spec below constructs candidates in explicit newest-to-oldest
// order and asserts the OUTPUT preserves that relative order within each
// priority tier.
//
// `deriveConversationOutcome` / `criticalFailedValidatorNames` are the pure
// helpers the (impure) db loader in `loadRealConversationsForAgent` uses to
// turn raw `agentTurns` rows into the candidate shape above — TDD'd here in
// isolation so the tricky bits (tool-call success detection, the
// turnCount<=2 abandoned rule, cross-referencing `validatorsPassed` names
// against `ALL_VALIDATORS`' severities) don't require a live Postgres
// instance to verify.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  planConversationSample,
  deriveConversationOutcome,
  criticalFailedValidatorNames,
  type ConversationSample,
} from "@/lib/agents/improve/source-conversations";
import type { AgentToolCall, AgentToolResult, AgentValidatorResult } from "@/db/schema/agents";

// ─── fakes ───────────────────────────────────────────────────────────────

type Candidate = Pick<
  ConversationSample,
  "conversationId" | "outcome" | "hadCriticalValidatorFailure"
> & { hasNegativeOperatorQuality: boolean };

function candidate(overrides: Partial<Candidate> & { conversationId: string }): Candidate {
  return {
    outcome: "other",
    hadCriticalValidatorFailure: false,
    hasNegativeOperatorQuality: false,
    ...overrides,
  };
}

function toolCall(name: string, id = `${name}-call`): AgentToolCall {
  return { id, name, input: {} };
}

function toolResult(toolCallId: string, ok: boolean): AgentToolResult {
  return { toolCallId, ok };
}

function validatorResult(name: string, passed: boolean): AgentValidatorResult {
  return { name, passed };
}

// ─── planConversationSample ─────────────────────────────────────────────

describe("planConversationSample", () => {
  test("is pure: calling it twice with the same input produces deep-equal output", () => {
    const candidates = [
      candidate({ conversationId: "c1", outcome: "booked" }),
      candidate({ conversationId: "c2", outcome: "message" }),
    ];
    const first = planConversationSample({ candidates, sampleSize: 10 });
    const second = planConversationSample({ candidates, sampleSize: 10 });
    assert.deepEqual(first, second);
  });

  test("short supply: fewer candidates than sampleSize returns ALL of them", () => {
    const candidates = [
      candidate({ conversationId: "c1", outcome: "booked" }),
      candidate({ conversationId: "c2", outcome: "message" }),
      candidate({ conversationId: "c3", outcome: "abandoned" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 50 });
    assert.equal(result.length, 3);
    assert.deepEqual(new Set(result), new Set(["c1", "c2", "c3"]));
  });

  test("empty candidates -> empty result, no throw", () => {
    const result = planConversationSample({ candidates: [], sampleSize: 50 });
    assert.deepEqual(result, []);
  });

  test("sampleSize 0 -> empty result even with candidates available", () => {
    const candidates = [candidate({ conversationId: "c1", outcome: "booked" })];
    const result = planConversationSample({ candidates, sampleSize: 0 });
    assert.deepEqual(result, []);
  });

  test("priority 1: ALL validator-failed candidates are included first, newest-first (array order), even over sampleSize's other tiers", () => {
    // Newest-first input order: v3 newest .. v1 oldest.
    const candidates = [
      candidate({ conversationId: "v3", hadCriticalValidatorFailure: true, outcome: "abandoned" }),
      candidate({ conversationId: "v2", hadCriticalValidatorFailure: true, outcome: "booked" }),
      candidate({ conversationId: "v1", hadCriticalValidatorFailure: true, outcome: "message" }),
      candidate({ conversationId: "o1", outcome: "booked" }),
      candidate({ conversationId: "o2", outcome: "message" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 3 });
    // Exactly the 3 validator-failed ids, in their newest-first input order.
    assert.deepEqual(result, ["v3", "v2", "v1"]);
  });

  test("priority 2: negative-operatorQuality candidates fill in after validator-failed ones, newest-first, skipping any already picked in tier 1", () => {
    const candidates = [
      // Tier 1 (validator-failed), newest-first:
      candidate({ conversationId: "v2", hadCriticalValidatorFailure: true, outcome: "booked" }),
      candidate({ conversationId: "v1", hadCriticalValidatorFailure: true, outcome: "message" }),
      // Tier 2 (negative operatorQuality, NOT validator-failed), newest-first:
      candidate({ conversationId: "n2", hasNegativeOperatorQuality: true, outcome: "abandoned" }),
      candidate({ conversationId: "n1", hasNegativeOperatorQuality: true, outcome: "other" }),
      // Tier 3 candidates that would never be reached given sampleSize below.
      candidate({ conversationId: "o1", outcome: "booked" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 4 });
    assert.deepEqual(result, ["v2", "v1", "n2", "n1"]);
  });

  test("a candidate that is BOTH validator-failed AND negative-quality counts once, in tier 1 only (no duplicate id in output)", () => {
    const candidates = [
      candidate({
        conversationId: "both",
        hadCriticalValidatorFailure: true,
        hasNegativeOperatorQuality: true,
        outcome: "booked",
      }),
      candidate({ conversationId: "n1", hasNegativeOperatorQuality: true, outcome: "message" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 10 });
    assert.deepEqual(result, ["both", "n1"]);
    // No duplicates anywhere in the output.
    assert.equal(new Set(result).size, result.length);
  });

  test("priority 3: round-robins across outcome buckets (booked/message/abandoned/other) for the remaining candidates once tiers 1-2 are exhausted", () => {
    // No validator failures, no negative quality — pure tier-3 round robin.
    // Two per bucket, newest-first within each bucket's own array position.
    const candidates = [
      candidate({ conversationId: "booked-new", outcome: "booked" }),
      candidate({ conversationId: "message-new", outcome: "message" }),
      candidate({ conversationId: "abandoned-new", outcome: "abandoned" }),
      candidate({ conversationId: "other-new", outcome: "other" }),
      candidate({ conversationId: "booked-old", outcome: "booked" }),
      candidate({ conversationId: "message-old", outcome: "message" }),
      candidate({ conversationId: "abandoned-old", outcome: "abandoned" }),
      candidate({ conversationId: "other-old", outcome: "other" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 8 });
    // All 8 present.
    assert.equal(result.length, 8);
    assert.deepEqual(new Set(result), new Set(candidates.map((c) => c.conversationId)));
    // Round-robin shape: the first "round" (one from each bucket, in bucket
    // priority order booked/message/abandoned/other) picks the NEWEST of
    // each bucket before any bucket contributes a second item.
    assert.deepEqual(result.slice(0, 4), [
      "booked-new",
      "message-new",
      "abandoned-new",
      "other-new",
    ]);
    assert.deepEqual(result.slice(4, 8), [
      "booked-old",
      "message-old",
      "abandoned-old",
      "other-old",
    ]);
  });

  test("priority 3 round-robin respects sampleSize cutoff mid-round (fills to sampleSize, not a whole extra round)", () => {
    const candidates = [
      candidate({ conversationId: "booked-1", outcome: "booked" }),
      candidate({ conversationId: "message-1", outcome: "message" }),
      candidate({ conversationId: "abandoned-1", outcome: "abandoned" }),
      candidate({ conversationId: "other-1", outcome: "other" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 2 });
    assert.equal(result.length, 2);
    // First two buckets in priority order.
    assert.deepEqual(result, ["booked-1", "message-1"]);
  });

  test("priority 3 round-robin skips an exhausted bucket and keeps pulling from the rest (uneven bucket sizes)", () => {
    const candidates = [
      candidate({ conversationId: "booked-1", outcome: "booked" }),
      candidate({ conversationId: "message-1", outcome: "message" }),
      candidate({ conversationId: "message-2", outcome: "message" }),
      candidate({ conversationId: "message-3", outcome: "message" }),
    ];
    // Round 1: booked-1, message-1 (only two non-empty buckets).
    // Round 2: booked bucket now empty -> skip -> message-2.
    // Round 3: message-3.
    const result = planConversationSample({ candidates, sampleSize: 4 });
    assert.deepEqual(result, ["booked-1", "message-1", "message-2", "message-3"]);
  });

  test("combined: tier 1 + tier 2 + tier 3 round-robin fill to sampleSize in order, with tier 3 candidates from tier-1/2 outcomes excluded from their bucket (already counted)", () => {
    const candidates = [
      candidate({ conversationId: "v1", hadCriticalValidatorFailure: true, outcome: "booked" }),
      candidate({ conversationId: "n1", hasNegativeOperatorQuality: true, outcome: "message" }),
      candidate({ conversationId: "booked-a", outcome: "booked" }),
      candidate({ conversationId: "message-a", outcome: "message" }),
      candidate({ conversationId: "abandoned-a", outcome: "abandoned" }),
      candidate({ conversationId: "other-a", outcome: "other" }),
    ];
    const result = planConversationSample({ candidates, sampleSize: 5 });
    assert.equal(result.length, 5);
    assert.deepEqual(result.slice(0, 2), ["v1", "n1"]);
    // Remaining 3 slots come from the round-robin over the 4 tier-3
    // candidates (booked-a/message-a/abandoned-a/other-a), priority order.
    assert.deepEqual(new Set(result.slice(2)), new Set(["booked-a", "message-a", "abandoned-a"]));
    // No id repeats between tiers.
    assert.equal(new Set(result).size, result.length);
  });

  test("never returns more ids than sampleSize even with abundant candidates across every tier", () => {
    const candidates = [
      candidate({ conversationId: "v1", hadCriticalValidatorFailure: true, outcome: "booked" }),
      candidate({ conversationId: "v2", hadCriticalValidatorFailure: true, outcome: "message" }),
      candidate({ conversationId: "n1", hasNegativeOperatorQuality: true, outcome: "abandoned" }),
      ...Array.from({ length: 20 }, (_, i) =>
        candidate({ conversationId: `o${i}`, outcome: "other" }),
      ),
    ];
    const result = planConversationSample({ candidates, sampleSize: 5 });
    assert.equal(result.length, 5);
  });
});

// ─── deriveConversationOutcome ──────────────────────────────────────────

describe("deriveConversationOutcome", () => {
  test("a successful book_appointment tool call anywhere in the conversation -> 'booked'", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 6,
      toolCalls: [toolCall("book_appointment", "call-1")],
      toolResults: [toolResult("call-1", true)],
    });
    assert.equal(outcome, "booked");
  });

  test("a FAILED book_appointment tool call (ok:false) does NOT count as booked", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 6,
      toolCalls: [toolCall("book_appointment", "call-1")],
      toolResults: [toolResult("call-1", false)],
    });
    assert.notEqual(outcome, "booked");
  });

  test("a successful take_message tool call (no booking) -> 'message'", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 6,
      toolCalls: [toolCall("take_message", "call-1")],
      toolResults: [toolResult("call-1", true)],
    });
    assert.equal(outcome, "message");
  });

  test("booking wins over message when BOTH tools succeeded (booking is the stronger positive outcome)", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 8,
      toolCalls: [toolCall("take_message", "call-1"), toolCall("book_appointment", "call-2")],
      toolResults: [toolResult("call-1", true), toolResult("call-2", true)],
    });
    assert.equal(outcome, "booked");
  });

  test("no successful booking/message tool + turnCount <= 2 -> 'abandoned'", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 2,
      toolCalls: [],
      toolResults: [],
    });
    assert.equal(outcome, "abandoned");
  });

  test("turnCount of exactly 1 with no tool activity -> 'abandoned'", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 1,
      toolCalls: [],
      toolResults: [],
    });
    assert.equal(outcome, "abandoned");
  });

  test("no successful booking/message tool + turnCount > 2 -> 'other'", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 5,
      toolCalls: [toolCall("look_up_availability", "call-1")],
      toolResults: [toolResult("call-1", true)],
    });
    assert.equal(outcome, "other");
  });

  test("a book_appointment call with NO matching tool result (missing/undefined) is treated as unsuccessful", () => {
    const outcome = deriveConversationOutcome({
      turnCount: 5,
      toolCalls: [toolCall("book_appointment", "call-1")],
      toolResults: [],
    });
    assert.equal(outcome, "other");
  });
});

// ─── criticalFailedValidatorNames ───────────────────────────────────────

describe("criticalFailedValidatorNames", () => {
  test("returns the names of FAILED validators that are severity:'critical' per ALL_VALIDATORS, across all turns", () => {
    const names = criticalFailedValidatorNames([
      [validatorResult("quotes_only_from_soul_pricing", false)],
      [validatorResult("no_avoid_words", false)], // warning-severity, must be excluded
    ]);
    assert.deepEqual(names, ["quotes_only_from_soul_pricing"]);
  });

  test("a passed critical validator does not appear", () => {
    const names = criticalFailedValidatorNames([
      [validatorResult("no_pii_leak", true), validatorResult("no_hallucinated_state_change", false)],
    ]);
    assert.deepEqual(names, ["no_hallucinated_state_change"]);
  });

  test("no turns / no validator results -> empty array, no throw", () => {
    assert.deepEqual(criticalFailedValidatorNames([]), []);
    assert.deepEqual(criticalFailedValidatorNames([[]]), []);
  });

  test("dedupes repeated failures of the same critical validator across multiple turns", () => {
    const names = criticalFailedValidatorNames([
      [validatorResult("no_prompt_injection_echo", false)],
      [validatorResult("no_prompt_injection_echo", false)],
    ]);
    assert.deepEqual(names, ["no_prompt_injection_echo"]);
  });

  test("an unknown validator name (not in ALL_VALIDATORS) is ignored rather than throwing", () => {
    const names = criticalFailedValidatorNames([
      [validatorResult("some_future_validator_not_yet_registered", false)],
    ]);
    assert.deepEqual(names, []);
  });
});

// ─── ConversationSample shape (PII posture) ─────────────────────────────

describe("ConversationSample turns shape", () => {
  test("the type only allows role 'user'|'assistant' + content (documented via a compile-time construction, not an assertion)", () => {
    // This is a type-level guarantee exercised at compile time by tsc — if
    // ConversationSample.turns ever grows a `toolCalls`/`toolResults` field,
    // this literal would need updating and a reviewer would notice. The
    // runtime assertion below just double-checks the two role values are
    // accepted (a third role would fail `tsc`, not this assertion).
    const sample: ConversationSample = {
      conversationId: "c1",
      outcome: "other",
      hadCriticalValidatorFailure: false,
      failedValidatorNames: [],
      turns: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello!" },
      ],
    };
    assert.equal(sample.turns.length, 2);
    assert.deepEqual(Object.keys(sample.turns[0]).sort(), ["content", "role"]);
  });
});
