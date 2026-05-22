// Tests for the useCyclingLabel hook and its pure helpers.
//
// Polish #4 of the four-part UX queue: the landing editor's "Applying..."
// label now cycles through LLM-style words ("thinking…" → "searching…" →
// "editing…" → "applying…") while a customize_landing call is in flight,
// so long-running customizes feel alive instead of frozen.
//
// We test the cycling math as a pure function (cyclingLabelAt) — no React,
// no DOM, no fake timers needed. The hook itself is a tiny wrapper around
// setInterval that defers to this pure helper for label selection. Once
// the math is rock-solid, the hook reduces to "increment an index every
// intervalMs while active, render labelAt(index)".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  LANDING_LOADING_WORDS,
  cyclingLabelAt,
} from "../../../src/lib/hooks/use-cycling-label";

describe("LANDING_LOADING_WORDS", () => {
  test("is exactly [thinking…, searching…, editing…, applying…] in that order", () => {
    // The order matters for the perceived flow: think first (decide what
    // to do), search (gather context), edit (write the change), apply
    // (commit it). Changing this order changes the UX feel — gate any
    // future reorder on a design review.
    assert.deepEqual(LANDING_LOADING_WORDS, [
      "thinking…",
      "searching…",
      "editing…",
      "applying…",
    ]);
  });
});

describe("cyclingLabelAt", () => {
  test("returns the first word for index 0 (initial label)", () => {
    // Subtle correctness from the spec: first label when status flips to
    // submitting MUST be "thinking…", not the last word in the list.
    assert.equal(
      cyclingLabelAt(LANDING_LOADING_WORDS, 0),
      "thinking…",
    );
  });

  test("returns each word in sequence for indices 0..N-1", () => {
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 0), "thinking…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 1), "searching…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 2), "editing…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 3), "applying…");
  });

  test("wraps back to the first word after reaching the end (modular)", () => {
    // Index 4 should wrap to "thinking…" — the cycle loops so a long
    // customize call doesn't get stuck on the last label forever.
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 4), "thinking…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 5), "searching…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 6), "editing…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 7), "applying…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 8), "thinking…");
  });

  test("handles very large indices without precision loss", () => {
    // 800ms × 1000 ticks ≈ 13 minutes. Even at that point the cycle
    // should still land cleanly on a known word.
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 1000), "thinking…");
    assert.equal(cyclingLabelAt(LANDING_LOADING_WORDS, 1001), "searching…");
  });

  test("works with arbitrary word arrays (not coupled to LANDING_LOADING_WORDS)", () => {
    // The helper is generic — useful if we ever cycle other label sets
    // (e.g., a "Reverting…" multi-step animation, a deploy animation).
    const words = ["a", "b", "c"];
    assert.equal(cyclingLabelAt(words, 0), "a");
    assert.equal(cyclingLabelAt(words, 1), "b");
    assert.equal(cyclingLabelAt(words, 2), "c");
    assert.equal(cyclingLabelAt(words, 3), "a"); // wraps
  });

  test("returns empty string for an empty word array (degenerate but safe)", () => {
    // Should never happen in practice, but the helper must not crash —
    // a caller that mistakenly passes [] should see an empty string,
    // not an Index-out-of-range exception.
    assert.equal(cyclingLabelAt([], 0), "");
    assert.equal(cyclingLabelAt([], 5), "");
  });
});
