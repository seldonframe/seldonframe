// Marketplace buyer onboarding — TDD for the PURE resumable-progress helpers.
//
// `OnboardingProgress` records which step KINDS the buyer has completed so the
// wizard can be closed and resumed at the exact next step (the spec's "every
// step saves; the buyer can close + return"). All pure — no DB, no clock.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  emptyProgress,
  markStepDone,
  firstIncompleteStep,
  type OnboardingProgress,
} from "../../../../src/lib/marketplace/onboarding/progress";
import { buildOnboardingSteps } from "../../../../src/lib/marketplace/onboarding/steps";

// ─── markStepDone ────────────────────────────────────────────────────────────

test("emptyProgress has no done kinds", () => {
  assert.deepEqual(emptyProgress().doneKinds, []);
});

test("markStepDone records a kind", () => {
  const next = markStepDone(emptyProgress(), "business_info");
  assert.deepEqual(next.doneKinds, ["business_info"]);
});

test("markStepDone is idempotent — marking the same kind twice dedups", () => {
  let p = emptyProgress();
  p = markStepDone(p, "business_info");
  p = markStepDone(p, "business_info");
  assert.deepEqual(p.doneKinds, ["business_info"]);
});

test("markStepDone does not mutate the input progress", () => {
  const p = emptyProgress();
  const next = markStepDone(p, "phone");
  assert.deepEqual(p.doneKinds, []); // original untouched
  assert.deepEqual(next.doneKinds, ["phone"]);
});

test("markStepDone accumulates distinct kinds in order", () => {
  let p = emptyProgress();
  p = markStepDone(p, "business_info");
  p = markStepDone(p, "phone");
  assert.deepEqual(p.doneKinds, ["business_info", "phone"]);
});

test("markStepDone tolerates a malformed progress (jsonb edge)", () => {
  const p = markStepDone(
    { doneKinds: null } as unknown as OnboardingProgress,
    "go_live",
  );
  assert.deepEqual(p.doneKinds, ["go_live"]);
});

// ─── firstIncompleteStep ─────────────────────────────────────────────────────

test("firstIncompleteStep returns the first step whose kind is not done", () => {
  const steps = buildOnboardingSteps({ surface: ["voice"], connectors: [] });
  // steps: business_info, phone, connect_openai_voice, test, go_live
  const progress = markStepDone(emptyProgress(), "business_info");
  const next = firstIncompleteStep(steps, progress);
  assert.equal(next?.kind, "phone");
});

test("firstIncompleteStep skips ALL done kinds (not just the first)", () => {
  const steps = buildOnboardingSteps({ surface: ["voice"], connectors: [] });
  let progress = emptyProgress();
  progress = markStepDone(progress, "business_info");
  progress = markStepDone(progress, "phone");
  progress = markStepDone(progress, "connect_openai_voice");
  const next = firstIncompleteStep(steps, progress);
  assert.equal(next?.kind, "test");
});

test("firstIncompleteStep returns the first step for empty progress", () => {
  const steps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  const next = firstIncompleteStep(steps, emptyProgress());
  assert.equal(next?.kind, "business_info");
});

test("firstIncompleteStep returns null when every step is done", () => {
  const steps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  let progress = emptyProgress();
  for (const s of steps) progress = markStepDone(progress, s.kind);
  assert.equal(firstIncompleteStep(steps, progress), null);
});

test("firstIncompleteStep over an empty step list is null", () => {
  assert.equal(firstIncompleteStep([], emptyProgress()), null);
});

test("firstIncompleteStep tolerates a malformed progress (jsonb edge)", () => {
  const steps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  const next = firstIncompleteStep(
    steps,
    { doneKinds: undefined } as unknown as OnboardingProgress,
  );
  assert.equal(next?.kind, "business_info");
});
