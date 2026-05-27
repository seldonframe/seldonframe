// packages/crm/tests/unit/onboarding/state.spec.ts
//
// 2026-05-27 — Unified onboarding shell — state-derivation unit tests.
//
// Covers the pure `deriveOnboardingState` decision tree without touching
// the DB. The DB-aware `getOnboardingState` is one thin wrapper over the
// same function plus a users-table SELECT — covered separately by
// integration tests at a higher layer (see the wrapping page tests).
//
// Why pure: the decision logic is the load-bearing piece (a wrong step
// number on the shell strip is what an operator actually sees). The DB
// query shape is mechanical Drizzle; isolating the decision lets future
// edits to the tree (e.g. adding a step 4) get verified without spinning
// up a Postgres connection.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveOnboardingState } from "../../../src/lib/onboarding/state";

describe("deriveOnboardingState — completed users", () => {
  test("non-NULL onboardingCompletedAt → completed true, currentStep null", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: new Date("2026-05-27T00:00:00.000Z"),
      hasByokAnthropicKey: false,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, { completed: true, currentStep: null });
  });

  test("completion timestamp wins over missing key + missing workspace", () => {
    // A user who completed onboarding then later had their key removed
    // (e.g. via /settings/integrations/llm) should NOT be re-onboarded.
    // The shell engages once per account lifetime.
    const result = deriveOnboardingState({
      onboardingCompletedAt: new Date(),
      hasByokAnthropicKey: false,
      hasClientWorkspace: false,
    });
    assert.equal(result.completed, true);
    assert.equal(result.currentStep, null);
  });

  test("string timestamp counts as completed too", () => {
    // Drizzle returns Date objects for timestamptz columns at runtime,
    // but a stringified ISO value (e.g. from JSON.parse on a cached
    // response) should still trigger the completed branch.
    const result = deriveOnboardingState({
      onboardingCompletedAt: "2026-05-27T00:00:00.000Z",
      hasByokAnthropicKey: true,
      hasClientWorkspace: true,
    });
    assert.equal(result.completed, true);
  });
});

describe("deriveOnboardingState — mid-onboarding", () => {
  test("brand-new user → step 1 (no key, no workspace)", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: false,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, { completed: false, currentStep: 1 });
  });

  test("user with key but no workspace → step 2", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: true,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, { completed: false, currentStep: 2 });
  });

  test("user with key + workspace (but not completed) → step 3", () => {
    // Step 3 is the make-it-yours / custom-domain ask. Reached after
    // the build animation finishes and the operator lands on Ready.
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: true,
      hasClientWorkspace: true,
    });
    assert.deepEqual(result, { completed: false, currentStep: 3 });
  });

  test("workspace without key is still step 1 (key is the gate, not the workspace)", () => {
    // Edge case: a user could in theory have a workspace from some
    // legacy path but never have saved an Anthropic key. The arc still
    // wants them to add a key first because every workspace operation
    // (chatbot replies, soul refresh, landing regeneration) needs one.
    // Step 1 covers that.
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: false,
      hasClientWorkspace: true,
    });
    assert.deepEqual(result, { completed: false, currentStep: 1 });
  });
});

describe("deriveOnboardingState — discriminated union shape", () => {
  test("completed=true always pairs with currentStep=null", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: new Date(),
      hasByokAnthropicKey: true,
      hasClientWorkspace: true,
    });
    // TypeScript-level invariant: when completed is true, currentStep
    // must be null. Runtime check confirms the union discriminant.
    assert.equal(result.completed, true);
    assert.equal(result.currentStep, null);
  });

  test("completed=false always carries a 1|2|3 currentStep", () => {
    const cases = [
      { onboardingCompletedAt: null, hasByokAnthropicKey: false, hasClientWorkspace: false, expected: 1 },
      { onboardingCompletedAt: null, hasByokAnthropicKey: true, hasClientWorkspace: false, expected: 2 },
      { onboardingCompletedAt: null, hasByokAnthropicKey: true, hasClientWorkspace: true, expected: 3 },
    ] as const;
    for (const c of cases) {
      const result = deriveOnboardingState(c);
      assert.equal(result.completed, false);
      assert.equal(result.currentStep, c.expected);
    }
  });
});
