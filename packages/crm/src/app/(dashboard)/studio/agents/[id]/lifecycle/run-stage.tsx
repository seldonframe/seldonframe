"use client";

// Agent lifecycle slice (T10, F-E, F-F) — Stage 04 "Run" (the centerpiece).
//
// "Run it once — watch every action." Kicks off startSupervisedRunAction,
// then polls getSupervisedRunAction ~1.5s while running, feeding every
// response into the pure runStageReducer (run-stage-reducer.ts). The
// monospace action log renders running/ok/error glyphs per the handoff.
// Button disabled while running — one run at a time per template
// (enforced server-side too; the "already_running" branch surfaces here as
// an honest inline message, never a silent retry).
//
// F-E (2026-07-11 incident: prod row 48e7fcc0-0e34-4447-bc3f-9bbdc811a9dc) —
// the run() handler now dispatches the REAL actionLog + summary the server
// action returns, instead of hardcoding an empty log and dropping the
// summary. That was the root cause: a run that finishes synchronously
// within startSupervisedRunAction's own request (the common case) never
// triggers a follow-up poll, so whatever `started` was dispatched with is
// the only evidence the UI will ever see.
//
// F-F (evidence-first restructure) — three lanes, never conflated:
//   PLAN   — "This run will:" (derivePlannedActions), shown before running.
//   ACTION — the monospace per-tool-call log (unchanged rendering; lines
//            already carry a target/proof suffix when the tool result had
//            a cheap id field — see stateless-turn.ts's extractToolProof).
//   WORDS  — the agent's own reply, in a visually subordinate, explicitly
//            labeled block — NEVER the verdict. The verdict is COMPUTED
//            (deriveRunVerdict): "N actions completed" (+ "of M expected"
//            once a plan exists), matching runSupervised's own >=1-ok-action
//            definition of success exactly.
//
// F-D — a tool-free (pure-chat) template can never take a real action, so
// there's nothing for a supervised run to demonstrate: explanatory copy
// replaces the button entirely (supervisedRunExempt). That branch renders
// BEFORE any hook runs — it's a fixed, server-computed prop for this
// template (never flips mid-session), so the two branches never coexist for
// one mounted instance and the Rules of Hooks aren't at risk in practice,
// but to stay strictly compliant every hook below is still called
// unconditionally; only the final JSX branches on it.

import { useEffect, useReducer, useRef } from "react";
import { PlayCircle } from "lucide-react";
import {
  startSupervisedRunAction,
  getSupervisedRunAction,
} from "@/lib/agent-templates/supervised-run-actions";
import type { SupervisedRun } from "@/db/schema/agent-lifecycle";
import { runStageReducer, RUN_STAGE_IDLE } from "./run-stage-reducer";
import { deriveRunVerdict } from "./run-plan";

const POLL_MS = 1500;

const GLYPH: Record<string, string> = { running: "…", ok: "✓", error: "✗" };

export function RunStage({
  templateId,
  initialLastRun,
  supervisedRunExempt,
  plannedActions,
}: {
  templateId: string;
  /** The most recent supervised_runs row for this template, if any — shown
   *  on revisit even before the operator clicks "Run it once" again. */
  initialLastRun: SupervisedRun | null;
  /** F-D — true for a tool-free (pure-chat) template: it can never take a
   *  real tool action, so there's nothing for a supervised run to
   *  demonstrate. Renders explanatory copy instead of the run button. */
  supervisedRunExempt: boolean;
  /** F-F PLAN row — derivePlannedActions' output, computed server-side
   *  (page.tsx) from the template's bound connectors + derived eval
   *  scenarios' mustDo. Empty when there's nothing to plan. */
  plannedActions: string[];
}) {
  const initial =
    initialLastRun && initialLastRun.status === "running"
      ? runStageReducer(RUN_STAGE_IDLE, {
          type: "init_running",
          runId: initialLastRun.id,
          actionLog: initialLastRun.actionLog ?? [],
        })
      : initialLastRun && initialLastRun.status !== "running"
        ? ({
            status: initialLastRun.status as "succeeded" | "failed",
            runId: initialLastRun.id,
            actionLog: initialLastRun.actionLog ?? [],
            summary: initialLastRun.summary ?? "Run finished with no summary.",
          } as const)
        : RUN_STAGE_IDLE;

  const [state, dispatch] = useReducer(runStageReducer, initial);
  // Self-scheduling setTimeout chain (F7, Wave 2 review) rather than
  // setInterval: the next poll is only scheduled AFTER the current one
  // resolves, so a slow request can never overlap the next tick. Holds the
  // pending timer (idle) so stopPolling/unmount can cancel it.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const pollOnce = async (runId: string) => {
    const res = await getSupervisedRunAction(runId);
    if (!res.ok) {
      dispatch({ type: "poll_failed" });
      // A transient poll error never stops the retry cadence — schedule
      // the next attempt exactly as a healthy tick would.
      pollTimerRef.current = setTimeout(() => pollOnce(runId), POLL_MS);
      return;
    }
    dispatch({
      type: "poll_tick",
      runId,
      status: res.run.status as "running" | "succeeded" | "failed",
      actionLog: res.run.actionLog ?? [],
      summary: res.run.summary,
    });
    if (res.run.status === "running") {
      pollTimerRef.current = setTimeout(() => pollOnce(runId), POLL_MS);
    } else {
      stopPolling();
    }
  };

  const startPolling = (runId: string) => {
    stopPolling();
    pollTimerRef.current = setTimeout(() => pollOnce(runId), POLL_MS);
  };

  useEffect(() => {
    // F6, Wave 2 review — resume polling an in-flight run found on mount
    // (the operator navigated away mid-run and came back) instead of
    // falling to idle and re-clicking into "already_running".
    if (initialLastRun && initialLastRun.status === "running") {
      startPolling(initialLastRun.id);
    }
    return () => {
      stopPolling();
    };
    // Mount-only: resuming an in-flight run is a one-time decision based on
    // the server-rendered initial prop, not a value that should re-trigger
    // this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    dispatch({ type: "start_clicked" });
    const result = await startSupervisedRunAction(templateId);
    if (!result.ok) {
      dispatch({
        type: "start_failed",
        error:
          result.error === "already_running"
            ? "A run is already in progress."
            : result.error === "no_llm_key"
              ? (result.message ?? "Add your key to run this.")
              : "Couldn't start the run. Try again.",
      });
      return;
    }
    // F-E — dispatch the REAL actionLog + summary the server already
    // resolved, instead of hardcoding actionLog:[] and dropping summary.
    // For the common case (the turn finishes inside this same request),
    // this IS the only evidence the UI will ever see — there is no
    // follow-up poll below (the early return right after).
    dispatch({
      type: "started",
      runId: result.runId,
      status: result.status,
      actionLog: result.actionLog,
      summary: result.summary,
    });
    if (result.status === "succeeded" || result.status === "failed") return;
    startPolling(result.runId);
  };

  if (supervisedRunExempt) {
    return (
      <p className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/40 p-3 text-sm text-[var(--lc-muted)]">
        This agent has no connected apps to supervise — it replies in chat only.
      </p>
    );
  }

  const running = state.status === "starting" || state.status === "running";
  const actionLog = state.status === "running" || state.status === "succeeded" || state.status === "failed" ? state.actionLog : [];
  const terminal = state.status === "succeeded" || state.status === "failed";
  const verdict = terminal ? deriveRunVerdict({ actionLog, plannedCount: plannedActions.length }) : null;

  return (
    <div className="space-y-3">
      {/* PLAN — "This run will:" set expectations BEFORE the button is
          clicked (F-F). Empty for a template with no bound tools and no
          recording-derived mustDo (nothing to plan). */}
      {plannedActions.length > 0 ? (
        <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3">
          <p className="text-xs font-medium text-[var(--lc-ink)]">This run will:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-[var(--lc-muted)]">
            {plannedActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
        >
          <PlayCircle className="size-4" aria-hidden />
          {running ? "Running…" : "Run it once — watch every action"}
        </button>
        {/* The VERDICT — a COMPUTED count ("N actions completed" / "N of M
            actions completed"), matching runSupervised's own >=1-ok-action
            definition of success exactly. Never the agent's reply — that's
            the separate, subordinate WORDS block below. */}
        {state.status === "succeeded" ? (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Succeeded — {verdict}
          </span>
        ) : null}
        {state.status === "failed" ? (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
            Failed — {verdict}
          </span>
        ) : null}
        {state.status === "start_failed" ? (
          <span className="text-xs text-[var(--lc-muted)]">{state.error}</span>
        ) : null}
      </div>

      {/* WORDS — what the agent said, explicitly labeled and visually
          subordinate to the verdict above it. NEVER rendered as the
          verdict itself (F-F). */}
      {terminal && "summary" in state && state.summary ? (
        <p className="text-xs text-[var(--lc-muted)]">
          <span className="font-medium text-[var(--lc-ink)]">What the agent said: </span>
          {state.summary}
        </p>
      ) : null}

      {/* ACTION — the per-tool-call log. Lines already carry a target/proof
          suffix when the tool's result had a cheap id field (F-F item 2 —
          see stateless-turn.ts's extractToolProof + toActionEvent). */}
      {actionLog.length > 0 ? (
        <pre className="max-h-64 overflow-y-auto rounded-lg border border-[var(--lc-line)] bg-black/90 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
          {actionLog
            .map((e) => `${GLYPH[e.status] ?? "•"} ${e.tool} — ${e.line}`)
            .join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
