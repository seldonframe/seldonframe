// Tests for message-pattern evaluator + channel-binding evaluator.
// SLICE 7 PR 1 C4 per audit §5.1 + §5.2 + gates G-7-1, G-7-3.
//
// Pure functions. Exhaustive coverage by mode × edge case.
//
// Per G-7-1:
//   - exact / contains / starts_with: default caseSensitive=false
//     (per-pattern override via caseSensitive: true)
//   - regex: respects user's flags as-given
//   - any: matches every input

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  matchesMessagePattern,
  channelBindingMatches,
} from "../../src/lib/agents/message-pattern-eval";

// ---------------------------------------------------------------------
// 1. matchesMessagePattern — exact mode
// ---------------------------------------------------------------------

describe("matchesMessagePattern — exact mode", () => {
  test("exact case-insensitive (default): CONFIRM matches confirm/Confirm/CONFIRM", () => {
    const p = { kind: "exact" as const, value: "CONFIRM", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "confirm"), true);
    assert.equal(matchesMessagePattern(p, "Confirm"), true);
    assert.equal(matchesMessagePattern(p, "CONFIRM"), true);
  });

  test("exact case-insensitive does not match substrings", () => {
    const p = { kind: "exact" as const, value: "OK", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "OK please"), false);
    assert.equal(matchesMessagePattern(p, "OKAY"), false);
    assert.equal(matchesMessagePattern(p, "  OK  "), false); // strict equality
  });

  test("exact case-sensitive: 'CONFIRM' does not match 'confirm'", () => {
    const p = { kind: "exact" as const, value: "CONFIRM", caseSensitive: true };
    assert.equal(matchesMessagePattern(p, "CONFIRM"), true);
    assert.equal(matchesMessagePattern(p, "confirm"), false);
    assert.equal(matchesMessagePattern(p, "Confirm"), false);
  });

  test("exact handles unicode + emoji", () => {
    const p = { kind: "exact" as const, value: "👍", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "👍"), true);
    assert.equal(matchesMessagePattern(p, "👎"), false);
  });

  test("exact handles empty input (when value non-empty, never matches)", () => {
    const p = { kind: "exact" as const, value: "X", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, ""), false);
  });
});

// ---------------------------------------------------------------------
// 2. matchesMessagePattern — contains mode
// ---------------------------------------------------------------------

describe("matchesMessagePattern — contains mode", () => {
  test("contains case-insensitive (default)", () => {
    const p = { kind: "contains" as const, value: "refund", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "I want a refund please"), true);
    assert.equal(matchesMessagePattern(p, "Need a REFUND"), true);
    assert.equal(matchesMessagePattern(p, "Refundable"), true); // substring match
  });

  test("contains does not match unrelated text", () => {
    const p = { kind: "contains" as const, value: "refund", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "thanks!"), false);
    assert.equal(matchesMessagePattern(p, ""), false);
  });

  test("contains case-sensitive", () => {
    const p = { kind: "contains" as const, value: "Refund", caseSensitive: true };
    assert.equal(matchesMessagePattern(p, "I want a Refund"), true);
    assert.equal(matchesMessagePattern(p, "I want a refund"), false);
  });

  test("contains handles unicode + emoji substring", () => {
    const p = { kind: "contains" as const, value: "💰", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "Pay me 💰 thanks"), true);
    assert.equal(matchesMessagePattern(p, "no money here"), false);
  });
});

// ---------------------------------------------------------------------
// 3. matchesMessagePattern — starts_with mode
// ---------------------------------------------------------------------

describe("matchesMessagePattern — starts_with mode", () => {
  test("starts_with case-insensitive (default)", () => {
    const p = { kind: "starts_with" as const, value: "STOP", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "STOP messaging me"), true);
    assert.equal(matchesMessagePattern(p, "stop now"), true);
    assert.equal(matchesMessagePattern(p, "Please STOP"), false); // not at start
  });

  test("starts_with case-sensitive", () => {
    const p = { kind: "starts_with" as const, value: "STOP", caseSensitive: true };
    assert.equal(matchesMessagePattern(p, "STOP now"), true);
    assert.equal(matchesMessagePattern(p, "stop now"), false);
  });

  test("starts_with empty input never matches non-empty pattern", () => {
    const p = { kind: "starts_with" as const, value: "X", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, ""), false);
  });

  test("starts_with handles unicode prefix", () => {
    const p = { kind: "starts_with" as const, value: "🎉", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, "🎉 yes!"), true);
    assert.equal(matchesMessagePattern(p, "yes! 🎉"), false);
  });
});

// ---------------------------------------------------------------------
// 4. matchesMessagePattern — regex mode
// ---------------------------------------------------------------------

describe("matchesMessagePattern — regex mode", () => {
  test("regex with explicit case-insensitive flag", () => {
    const p = { kind: "regex" as const, value: "^(yes|confirm|ok)$", flags: "i" };
    assert.equal(matchesMessagePattern(p, "YES"), true);
    assert.equal(matchesMessagePattern(p, "confirm"), true);
    assert.equal(matchesMessagePattern(p, "Ok"), true);
    assert.equal(matchesMessagePattern(p, "no"), false);
  });

  test("regex without flags is case-sensitive", () => {
    const p = { kind: "regex" as const, value: "^YES$" };
    assert.equal(matchesMessagePattern(p, "YES"), true);
    assert.equal(matchesMessagePattern(p, "yes"), false);
  });

  test("regex multiline flag", () => {
    const p = { kind: "regex" as const, value: "^OK$", flags: "m" };
    assert.equal(matchesMessagePattern(p, "OK\nthanks"), true);
    assert.equal(matchesMessagePattern(p, "Hello\nOK"), true);
    assert.equal(matchesMessagePattern(p, "OK is fine"), false);
  });

  test("regex pattern that doesn't match returns false (not throws)", () => {
    const p = { kind: "regex" as const, value: "^XYZ$" };
    assert.equal(matchesMessagePattern(p, "different"), false);
  });

  test("regex with unicode flag handles emoji", () => {
    const p = { kind: "regex" as const, value: "👍", flags: "u" };
    assert.equal(matchesMessagePattern(p, "👍"), true);
  });
});

// ---------------------------------------------------------------------
// 5. matchesMessagePattern — any mode
// ---------------------------------------------------------------------

describe("matchesMessagePattern — any mode", () => {
  test("any matches any non-empty text", () => {
    const p = { kind: "any" as const };
    assert.equal(matchesMessagePattern(p, "hello"), true);
    assert.equal(matchesMessagePattern(p, "🎉"), true);
    assert.equal(matchesMessagePattern(p, "X"), true);
  });

  test("any matches empty text (any literally means any)", () => {
    const p = { kind: "any" as const };
    assert.equal(matchesMessagePattern(p, ""), true);
  });
});

// ---------------------------------------------------------------------
// 6. matchesMessagePattern — long input + edge cases
// ---------------------------------------------------------------------

describe("matchesMessagePattern — edge cases", () => {
  test("very long input (10k chars) handled efficiently", () => {
    const p = { kind: "contains" as const, value: "needle", caseSensitive: false };
    const haystack = "x".repeat(9994) + "needle";
    assert.equal(matchesMessagePattern(p, haystack), true);
  });

  test("whitespace at boundaries — exact does not trim", () => {
    const p = { kind: "exact" as const, value: "OK", caseSensitive: false };
    assert.equal(matchesMessagePattern(p, " OK"), false);
    assert.equal(matchesMessagePattern(p, "OK "), false);
  });
});

// ---------------------------------------------------------------------
// 7. channelBindingMatches — any binding
// ---------------------------------------------------------------------

describe("channelBindingMatches — any binding", () => {
  test("any binding matches any inbound", () => {
    assert.equal(
      channelBindingMatches(
        { kind: "any" },
        { channel: "sms", to: "+15551234567" },
      ),
      true,
    );
    assert.equal(
      channelBindingMatches(
        { kind: "any" },
        { channel: "sms", to: "+447700900123" },
      ),
      true,
    );
  });
});

// ---------------------------------------------------------------------
// 8. channelBindingMatches — phone binding
// ---------------------------------------------------------------------

describe("channelBindingMatches — phone binding", () => {
  test("phone binding matches when E.164 numbers equal", () => {
    assert.equal(
      channelBindingMatches(
        { kind: "phone", number: "+15551234567" },
        { channel: "sms", to: "+15551234567" },
      ),
      true,
    );
  });

  test("phone binding does not match different numbers", () => {
    assert.equal(
      channelBindingMatches(
        { kind: "phone", number: "+15551234567" },
        { channel: "sms", to: "+15559999999" },
      ),
      false,
    );
  });

  test("phone binding normalizes whitespace + non-E.164 inputs to E.164", () => {
    // The webhook receiver normalizes inbound `to` to E.164 before
    // dispatching, but tests verify the comparator is robust to a few
    // whitespace variations to defend against upstream bugs.
    assert.equal(
      channelBindingMatches(
        { kind: "phone", number: "+15551234567" },
        { channel: "sms", to: " +15551234567 " },
      ),
      true,
    );
  });
});
