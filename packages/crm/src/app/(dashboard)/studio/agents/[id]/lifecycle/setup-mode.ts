// Agent setup mode slice (T1) — the shell's mode resolution + advance
// reducer. Pure, no I/O, directly unit-testable.
//
// Two modes, chosen from the SAME `stages` the ladder already derives
// (stage-derivation.ts) — never a second source of truth: any stage
// incomplete → Setup mode at the first incomplete stage; every stage
// complete → home mode (the existing compact accordion). `?view=full` is an
// explicit escape hatch that forces home mode regardless of completion.
// `?stage=<id>` deep-links into a specific stage (refresh/back/deep-link
// all work because the shell keeps this in the URL — see setup-mode-shell).

import type { LifecycleStage, LifecycleStageId } from "./stage-derivation";

export type LifecycleViewMode = "setup" | "home";

/** Normalize a Next.js searchParams value (string | string[] | undefined)
 *  down to its first string, or undefined. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Setup mode when any stage is incomplete, UNLESS `?view=full` explicitly
 *  asks for the compact home layout. Once every stage is complete, home
 *  mode is the only mode — there's nothing left to walk through. */
export function resolveLifecycleMode(args: {
  stages: LifecycleStage[];
  view: string | string[] | undefined;
}): LifecycleViewMode {
  if (firstParam(args.view) === "full") return "home";
  const allComplete = args.stages.every((s) => s.complete);
  return allComplete ? "home" : "setup";
}

/** Validate a `?stage=` param against the known stage ids — an unknown or
 *  absent value resolves to null so the caller falls back to
 *  defaultOpenStageId (the first incomplete stage). Never throws. */
export function resolveStageParam(
  stageParam: string | string[] | undefined,
  stages: LifecycleStage[],
): LifecycleStageId | null {
  const raw = firstParam(stageParam);
  if (!raw) return null;
  const match = stages.find((s) => s.id === raw);
  return match ? match.id : null;
}

/** The stage to land on in Setup mode when the page first renders: the
 *  validated `?stage=` param if present, else the first incomplete stage
 *  (defaultOpenStageId's own rule, duplicated here rather than imported so
 *  this module has zero cross-file coupling beyond the LifecycleStage type —
 *  both compute the identical "first incomplete, else last" rule). */
export function resolveInitialStageId(
  stageParam: string | string[] | undefined,
  stages: LifecycleStage[],
): LifecycleStageId {
  const fromParam = resolveStageParam(stageParam, stages);
  if (fromParam) return fromParam;
  const firstIncomplete = stages.find((s) => !s.complete);
  return firstIncomplete ? firstIncomplete.id : stages[stages.length - 1].id;
}

/** The next stage to advance to after `afterId` — the next INCOMPLETE stage
 *  later in the fixed order, or (if every later stage is already complete)
 *  the first incomplete stage anywhere, or the last stage once everything
 *  is done. Never jumps backward past an already-complete stage the
 *  operator hasn't seen yet unless nothing later remains. */
export function nextIncompleteStageId(
  afterId: LifecycleStageId,
  stages: LifecycleStage[],
): LifecycleStageId {
  const idx = stages.findIndex((s) => s.id === afterId);
  for (let i = idx + 1; i < stages.length; i++) {
    if (!stages[i].complete) return stages[i].id;
  }
  const firstIncomplete = stages.find((s) => !s.complete);
  if (firstIncomplete) return firstIncomplete.id;
  return stages[stages.length - 1].id;
}

// ─── Advance reducer ────────────────────────────────────────────────────────
//
// The success-beat-then-advance state machine: when the CURRENT stage's
// derived completion flips true, the shell dispatches STAGE_COMPLETED
// (shows a brief "nice, done" beat, never a hard jump), then either the
// beat's own timer or an explicit "Continue" click dispatches CONTINUE to
// actually move to the next incomplete stage. GOTO is direct stepper-chip
// navigation — resets the beat immediately (whatever beat was mid-flight
// for the stage being left no longer applies).

export type SetupAdvanceState = {
  stageId: LifecycleStageId;
  beat: "idle" | "success";
};

export type SetupAdvanceAction =
  | { type: "STAGE_COMPLETED" }
  | { type: "CONTINUE"; stages: LifecycleStage[] }
  | { type: "GOTO"; stageId: LifecycleStageId };

export function setupAdvanceReducer(
  state: SetupAdvanceState,
  action: SetupAdvanceAction,
): SetupAdvanceState {
  switch (action.type) {
    case "STAGE_COMPLETED":
      if (state.beat === "success") return state;
      return { ...state, beat: "success" };
    case "CONTINUE": {
      const next = nextIncompleteStageId(state.stageId, action.stages);
      return { stageId: next, beat: "idle" };
    }
    case "GOTO":
      if (action.stageId === state.stageId && state.beat === "idle") return state;
      return { stageId: action.stageId, beat: "idle" };
    default:
      return state;
  }
}
