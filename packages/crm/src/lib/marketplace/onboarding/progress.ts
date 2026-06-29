// Marketplace buyer onboarding — resumable PROGRESS (pure; no DB, no clock).
//
// `OnboardingProgress` is the small, jsonb-friendly record of which step KINDS
// the buyer has completed. It lets the wizard be closed and resumed at the exact
// next step (the spec: "every step saves; the buyer can close + return to the
// exact step"). It is persisted on the buyer's deployment (see the buyer→
// deployment seam) and read back to compute the resume point.
//
// Shape-tolerant: a value read off a jsonb column might be `{}` or carry a
// non-array `doneKinds`; every function here coerces defensively so the buyer's
// first-run never crashes on a malformed record.

import type { OnboardingStep, OnboardingStepKind } from "./steps";

/** The buyer's completed-step record. `doneKinds` is the set (as an ordered,
 *  de-duplicated array for jsonb friendliness) of step kinds finished so far. */
export type OnboardingProgress = {
  doneKinds: OnboardingStepKind[];
};

/** A fresh, empty progress record (no steps done yet). */
export function emptyProgress(): OnboardingProgress {
  return { doneKinds: [] };
}

/** Coerce a possibly-malformed jsonb value to a clean kind array. */
function safeDoneKinds(
  progress: OnboardingProgress | null | undefined,
): OnboardingStepKind[] {
  const raw = progress?.doneKinds;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Mark a step kind complete. Idempotent (marking the same kind twice dedups) and
 * non-mutating (returns a new record; the input is untouched). Pure.
 */
export function markStepDone(
  progress: OnboardingProgress | null | undefined,
  kind: OnboardingStepKind,
): OnboardingProgress {
  const done = safeDoneKinds(progress);
  if (done.includes(kind)) {
    // Already done — return a fresh record carrying the same kinds (never mutate).
    return { doneKinds: [...done] };
  }
  return { doneKinds: [...done, kind] };
}

/**
 * The first step whose kind is NOT yet in `doneKinds` — the wizard's resume
 * point. Returns null when every step is complete (or the list is empty). Pure.
 */
export function firstIncompleteStep(
  steps: OnboardingStep[],
  progress: OnboardingProgress | null | undefined,
): OnboardingStep | null {
  const done = new Set(safeDoneKinds(progress));
  for (const step of steps) {
    if (!done.has(step.kind)) return step;
  }
  return null;
}
