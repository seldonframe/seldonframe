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

import {
  deriveOnboardingDisplay,
  deriveOnboardingState,
} from "../../../src/lib/onboarding/state";

describe("deriveOnboardingState — completed users", () => {
  test("non-NULL onboardingCompletedAt → completed true, currentStep null", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: new Date("2026-05-27T00:00:00.000Z"),
      hasByokAnthropicKey: false,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, { completed: true, currentStep: null, display: null });
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
  test("brand-new user → step 1, displayed on the keyless 2-step arc", () => {
    // currentStep stays 1 (the Connect-AI page identity), but a keyless
    // operator's forced arc skips that page — so the displayed strip is
    // step 1 of the 2-step Build → Make-it-yours arc.
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: false,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, {
      completed: false,
      currentStep: 1,
      display: { step: 1, total: 2 },
    });
  });

  test("user with key but no workspace → step 2 of the full 3-step arc", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: true,
      hasClientWorkspace: false,
    });
    assert.deepEqual(result, {
      completed: false,
      currentStep: 2,
      display: { step: 2, total: 3 },
    });
  });

  test("user with key + workspace (but not completed) → step 3 of 3", () => {
    // Step 3 is the make-it-yours / custom-domain ask. Reached after
    // the build animation finishes and the operator lands on Ready.
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: true,
      hasClientWorkspace: true,
    });
    assert.deepEqual(result, {
      completed: false,
      currentStep: 3,
      display: { step: 3, total: 3 },
    });
  });

  test("workspace without key is still step 1 (key is the gate, not the workspace)", () => {
    // Edge case: a user could in theory have a workspace from some
    // legacy path but never have saved an Anthropic key. The arc still
    // wants them to add a key first because every workspace operation
    // (chatbot replies, soul refresh, landing regeneration) needs one.
    // Step 1 covers that — and on the keyless 2-step display arc.
    const result = deriveOnboardingState({
      onboardingCompletedAt: null,
      hasByokAnthropicKey: false,
      hasClientWorkspace: true,
    });
    assert.deepEqual(result, {
      completed: false,
      currentStep: 1,
      display: { step: 1, total: 2 },
    });
  });
});

describe("deriveOnboardingDisplay — strip position + arc length", () => {
  test("keyless operators walk the 2-step arc (key step skipped)", () => {
    // currentStep is a page identity (1=Connect-AI, 2=Build, 3=Ready).
    // A keyless operator never gets forced through Connect-AI, so:
    //   - sitting ON Connect-AI (by choice) → step 1 of 2
    //   - Build page                        → step 1 of 2
    //   - Ready page                        → step 2 of 2
    assert.deepEqual(deriveOnboardingDisplay(1, false), { step: 1, total: 2 });
    assert.deepEqual(deriveOnboardingDisplay(2, false), { step: 1, total: 2 });
    assert.deepEqual(deriveOnboardingDisplay(3, false), { step: 2, total: 2 });
  });

  test("keyed operators walk the full 3-step arc (page id === position)", () => {
    assert.deepEqual(deriveOnboardingDisplay(1, true), { step: 1, total: 3 });
    assert.deepEqual(deriveOnboardingDisplay(2, true), { step: 2, total: 3 });
    assert.deepEqual(deriveOnboardingDisplay(3, true), { step: 3, total: 3 });
  });
});

describe("deriveOnboardingState — discriminated union shape", () => {
  test("completed=true always pairs with currentStep=null + display=null", () => {
    const result = deriveOnboardingState({
      onboardingCompletedAt: new Date(),
      hasByokAnthropicKey: true,
      hasClientWorkspace: true,
    });
    // TypeScript-level invariant: when completed is true, currentStep
    // and display must both be null. Runtime check confirms the union
    // discriminant.
    assert.equal(result.completed, true);
    assert.equal(result.currentStep, null);
    assert.equal(result.display, null);
  });

  test("completed=false always carries a 1|2|3 currentStep + a display", () => {
    const cases = [
      { onboardingCompletedAt: null, hasByokAnthropicKey: false, hasClientWorkspace: false, expected: 1 },
      { onboardingCompletedAt: null, hasByokAnthropicKey: true, hasClientWorkspace: false, expected: 2 },
      { onboardingCompletedAt: null, hasByokAnthropicKey: true, hasClientWorkspace: true, expected: 3 },
    ] as const;
    for (const c of cases) {
      const result = deriveOnboardingState(c);
      assert.equal(result.completed, false);
      assert.equal(result.currentStep, c.expected);
      assert.notEqual(result.display, null);
    }
  });
});
