// Agent lifecycle slice (T10) — Stage 04 "Run": the reducer-extracted state
// machine driving the "Run it once — watch every action" island's ~1.5s
// poll. Pure — no timers, no fetch — so the transition logic is fully
// unit-testable; the client component owns the actual `setInterval`/fetch
// and just dispatches into this reducer.

import type { SupervisedRunActionEvent, SupervisedRunStatus } from "@/db/schema/agent-lifecycle";

export type RunStageState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "start_failed"; error: string }
  | { status: "running"; runId: string; actionLog: SupervisedRunActionEvent[] }
  | { status: "succeeded"; runId: string; actionLog: SupervisedRunActionEvent[]; summary: string }
  | { status: "failed"; runId: string; actionLog: SupervisedRunActionEvent[]; summary: string };

export type RunStageAction =
  | { type: "start_clicked" }
  | { type: "start_failed"; error: string }
  | {
      type: "started";
      runId: string;
      status: SupervisedRunStatus;
      actionLog: SupervisedRunActionEvent[];
      /** F-E — the run's REAL summary when the server action already
       *  resolved terminally (the common case: the turn finishes inside
       *  startSupervisedRunAction's own request). Previously this action
       *  had no summary field at all, and the reducer hardcoded `null` in
       *  terminalOrRunning — silently discarding real evidence and always
       *  falling back to "Run finished with no summary." even when a real
       *  summary existed. `null` for the non-terminal (status:"running")
       *  case, where it's unused. */
      summary: string | null;
    }
  /** F6, Wave 2 review — dispatched once on mount when the page loads with
   *  an already-`running` supervised_runs row (the operator navigated away
   *  and back mid-run): transitions idle straight to `running` so the
   *  client component's mount effect knows to resume polling that run id,
   *  instead of falling to idle and re-clicking into `already_running`. */
  | { type: "init_running"; runId: string; actionLog: SupervisedRunActionEvent[] }
  | {
      type: "poll_tick";
      runId: string;
      status: SupervisedRunStatus;
      actionLog: SupervisedRunActionEvent[];
      summary: string | null;
    }
  | { type: "poll_failed" };

const TERMINAL_SUMMARY_FALLBACK = "Run finished with no summary.";

/**
 * Pure transition function. Never throws; an out-of-order or unknown action
 * for the current state is simply a no-op (returns `state` unchanged) —
 * e.g. a stray poll_tick after the button was already reset to idle.
 */
export function runStageReducer(state: RunStageState, action: RunStageAction): RunStageState {
  switch (action.type) {
    case "start_clicked":
      return { status: "starting" };

    case "start_failed":
      if (state.status !== "starting") return state;
      return { status: "start_failed", error: action.error };

    case "started":
      if (state.status !== "starting") return state;
      return terminalOrRunning(action.runId, action.status, action.actionLog, action.summary);

    case "init_running":
      // Only meaningful on a fresh mount (idle) — never clobbers an
      // already-active, client-driven run.
      if (state.status !== "idle") return state;
      return { status: "running", runId: action.runId, actionLog: action.actionLog };

    case "poll_tick":
      // Only meaningful while we're actively tracking THIS run.
      if (state.status !== "running" || state.runId !== action.runId) return state;
      return terminalOrRunning(action.runId, action.status, action.actionLog, action.summary);

    case "poll_failed":
      // A transient poll error never terminates the run — the UI just tries
      // again on the next tick (optimistic-path guard: never silently claim
      // success/failure the server hasn't reported).
      return state;

    default:
      return state;
  }
}

function terminalOrRunning(
  runId: string,
  status: SupervisedRunStatus,
  actionLog: SupervisedRunActionEvent[],
  summary: string | null,
): RunStageState {
  if (status === "running") return { status: "running", runId, actionLog };
  if (status === "succeeded") {
    return { status: "succeeded", runId, actionLog, summary: summary ?? TERMINAL_SUMMARY_FALLBACK };
  }
  return { status: "failed", runId, actionLog, summary: summary ?? TERMINAL_SUMMARY_FALLBACK };
}

export const RUN_STAGE_IDLE: RunStageState = { status: "idle" };
