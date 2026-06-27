// ICP-3 — TDD for the pure per-turn model selector.
//
// `selectTurnModel` is the money-aware heart of adaptive runtime model
// selection: premium model on HARD turns, the cheap default otherwise. It must
// be PURE, DETERMINISTIC, and NEVER THROW — any oddity degrades to defaultModel.
// These tests pin every hard signal (intent / priorToolError / write-tool /
// long message), the easy-turn baseline, junk/empty inputs (no throw → default),
// and the premium-model override. The env kill-switch is tested at the wrapper
// layer (turn-model.spec.ts), since selectTurnModel itself reads no env.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  selectTurnModel,
  DEFAULT_PREMIUM_MODEL,
} from "../../../../src/lib/agents/runtime/select-turn-model";

const DEFAULT = "claude-sonnet-4-5-20250929"; // the current cheaper runtime model
const PREMIUM = "claude-sonnet-4-6";

// ─── hard intent in the user message → premium ───────────────────────────────

describe("selectTurnModel — hard-intent user messages → premium", () => {
  const hardMessages = [
    "I want to book an appointment for Friday",
    "Can I reschedule my appointment to next week?",
    "cancel my appointment please",
    "How much does a drain cleaning cost?",
    "what's the price for a tune-up",
    "Can I get a quote for a new water heater?",
    "I need to talk to a human",
    "let me speak to a manager",
    "this is urgent, my basement is flooding",
  ];

  for (const msg of hardMessages) {
    test(`"${msg.slice(0, 40)}" → premium`, () => {
      assert.equal(
        selectTurnModel({ userMessage: msg, defaultModel: DEFAULT }),
        PREMIUM,
      );
    });
  }

  test("intent match is case-insensitive", () => {
    assert.equal(
      selectTurnModel({ userMessage: "CANCEL MY BOOKING", defaultModel: DEFAULT }),
      PREMIUM,
    );
  });
});

// ─── prior tool error → premium ──────────────────────────────────────────────

describe("selectTurnModel — priorToolError → premium", () => {
  test("an easy message but priorToolError true → premium (recovery turn)", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "ok thanks", // not a hard intent on its own
        priorToolError: true,
        defaultModel: DEFAULT,
      }),
      PREMIUM,
    );
  });

  test("priorToolError false (and no other signal) → default", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "ok thanks",
        priorToolError: false,
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });
});

// ─── write/booking/escalate tool available → premium ─────────────────────────

describe("selectTurnModel — a write/booking/escalate tool available → premium", () => {
  test("book_appointment in the allowlist → premium", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "hello", // easy message
        toolNamesAvailable: ["look_up_availability", "book_appointment"],
        defaultModel: DEFAULT,
      }),
      PREMIUM,
    );
  });

  test("escalate_to_human in the allowlist → premium", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "hi",
        toolNamesAvailable: ["escalate_to_human"],
        defaultModel: DEFAULT,
      }),
      PREMIUM,
    );
  });

  test("a namespaced connector write tool (postiz__schedulePost) → premium", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "hi",
        toolNamesAvailable: ["postiz__schedulePost"],
        defaultModel: DEFAULT,
      }),
      PREMIUM,
    );
  });

  test("only read-only tools available + easy message → default", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "what are your hours?",
        toolNamesAvailable: ["look_up_availability"],
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });
});

// ─── long / complex message → premium ────────────────────────────────────────

describe("selectTurnModel — long/complex message → premium", () => {
  test("a very long multi-part message → premium", () => {
    const longMsg =
      "Hi there, I have a somewhat involved situation I'm hoping you can help me think through carefully. " +
      "We have a property with two separate units and I'm trying to understand what would be involved overall, " +
      "and roughly what the overall scope and effort might look like across both of them over the next several months ahead.";
    assert.ok(longMsg.length >= 320, "fixture should exceed the long threshold");
    assert.equal(
      selectTurnModel({ userMessage: longMsg, defaultModel: DEFAULT }),
      PREMIUM,
    );
  });

  test("a short easy message → default", () => {
    assert.equal(
      selectTurnModel({ userMessage: "where are you located?", defaultModel: DEFAULT }),
      DEFAULT,
    );
  });
});

// ─── easy-turn baseline → default ────────────────────────────────────────────

describe("selectTurnModel — easy turns stay on the cheap default", () => {
  const easyMessages = [
    "what are your hours?",
    "where are you located?",
    "do you have parking?",
    "are you open on weekends?",
    "thanks!",
  ];
  for (const msg of easyMessages) {
    test(`"${msg}" → default`, () => {
      assert.equal(
        selectTurnModel({ userMessage: msg, defaultModel: DEFAULT }),
        DEFAULT,
      );
    });
  }
});

// ─── junk / empty inputs → default, never throws ─────────────────────────────

describe("selectTurnModel — junk/empty input never throws → default", () => {
  test("empty message → default", () => {
    assert.equal(selectTurnModel({ userMessage: "", defaultModel: DEFAULT }), DEFAULT);
  });

  test("undefined message → default", () => {
    assert.equal(selectTurnModel({ defaultModel: DEFAULT }), DEFAULT);
  });

  test("non-string message (number) → default, no throw", () => {
    assert.equal(
      selectTurnModel({
        // @ts-expect-error — deliberately wrong type to prove fail-soft
        userMessage: 12345,
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });

  test("non-array toolNamesAvailable → default, no throw", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "hi",
        // @ts-expect-error — deliberately wrong type
        toolNamesAvailable: "book_appointment",
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });

  test("toolNamesAvailable with non-string entries → no throw, default", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "hi",
        // @ts-expect-error — deliberately wrong element types
        toolNamesAvailable: [null, 5, undefined],
        defaultModel: DEFAULT,
      }),
      DEFAULT,
    );
  });
});

// ─── premium override ────────────────────────────────────────────────────────

describe("selectTurnModel — premiumModel override", () => {
  test("uses the explicit premiumModel on a hard turn", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "book me an appointment",
        defaultModel: DEFAULT,
        premiumModel: "claude-opus-4-8",
      }),
      "claude-opus-4-8",
    );
  });

  test("falls back to DEFAULT_PREMIUM_MODEL when premiumModel is blank", () => {
    assert.equal(
      selectTurnModel({
        userMessage: "book me an appointment",
        defaultModel: DEFAULT,
        premiumModel: "   ",
      }),
      DEFAULT_PREMIUM_MODEL,
    );
  });

  test("DEFAULT_PREMIUM_MODEL is claude-sonnet-4-6", () => {
    assert.equal(DEFAULT_PREMIUM_MODEL, "claude-sonnet-4-6");
  });
});

// ─── defaultModel integrity (money-safe: never upgrade a broken caller) ──────

describe("selectTurnModel — defaultModel integrity", () => {
  test("a hard turn with a missing defaultModel does NOT escalate to premium", () => {
    // Money-safe contract: if the caller didn't supply a usable default, NEVER
    // substitute a premium model (that would be the opposite of money-safe).
    const result = selectTurnModel(
      // @ts-expect-error — defaultModel intentionally omitted
      { userMessage: "book an appointment" },
    );
    assert.notEqual(result, PREMIUM, "must not escalate a broken caller to premium");
    assert.notEqual(result, DEFAULT_PREMIUM_MODEL);
    // Returns a falsy non-premium value (the unusable default handed back).
    assert.ok(!result, "returns the unusable default, not a model substitution");
  });

  test("returns the EXACT default string on an easy turn (no mutation)", () => {
    const weird = "some-custom-model-id";
    assert.equal(
      selectTurnModel({ userMessage: "hi there", defaultModel: weird }),
      weird,
    );
  });
});
