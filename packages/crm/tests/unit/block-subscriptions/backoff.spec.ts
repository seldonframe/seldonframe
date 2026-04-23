// Tests for computeNextAttemptAt — the pure function that computes
// when a failed delivery should be retried. Shipped in PR 2 C3 per
// audit §4.7.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeNextAttemptAt } from "../../../src/lib/subscriptions/retry";

const NOW = new Date("2026-04-23T12:00:00Z");

describe("computeNextAttemptAt — exponential", () => {
  const policy = { max: 5, backoff: "exponential" as const, initial_delay_ms: 1000 };

  test("attempt 1 (just failed) → delay = 1000ms (2^0)", () => {
    const next = computeNextAttemptAt(policy, 1, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 1000);
  });

  test("attempt 2 → delay = 2000ms (2^1)", () => {
    const next = computeNextAttemptAt(policy, 2, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 2000);
  });

  test("attempt 3 → delay = 4000ms", () => {
    const next = computeNextAttemptAt(policy, 3, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 4000);
  });

  test("attempt 5 → delay = 16000ms", () => {
    const next = computeNextAttemptAt(policy, 5, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 16000);
  });
});

describe("computeNextAttemptAt — linear", () => {
  const policy = { max: 5, backoff: "linear" as const, initial_delay_ms: 500 };

  test("attempt 1 → 500ms", () => {
    const next = computeNextAttemptAt(policy, 1, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 500);
  });

  test("attempt 3 → 1500ms", () => {
    const next = computeNextAttemptAt(policy, 3, NOW);
    assert.equal(next.getTime() - NOW.getTime(), 1500);
  });
});

describe("computeNextAttemptAt — fixed", () => {
  const policy = { max: 5, backoff: "fixed" as const, initial_delay_ms: 2500 };

  test("every attempt returns the same delay", () => {
    for (const attempt of [1, 3, 5]) {
      const next = computeNextAttemptAt(policy, attempt, NOW);
      assert.equal(next.getTime() - NOW.getTime(), 2500);
    }
  });
});
