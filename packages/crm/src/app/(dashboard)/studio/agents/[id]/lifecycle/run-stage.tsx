"use client";

// Agent lifecycle slice (T10) — Stage 04 "Run" (the centerpiece).
//
// "Run it once — watch every action." Kicks off startSupervisedRunAction,
// then polls getSupervisedRunAction ~1.5s while running, feeding every
// response into the pure runStageReducer (run-stage-reducer.ts). The
// monospace action log renders running/ok/error glyphs per the handoff.
// Button disabled while running — one run at a time per template
// (enforced server-side too; the "already_running" branch surfaces here as
// an honest inline message, never a silent retry).

import { useEffect, useReducer, useRef } from "react";
import { PlayCircle } from "lucide-react";
import {
  startSupervisedRunAction,
  getSupervisedRunAction,
} from "@/lib/agent-templates/supervised-run-actions";
import type { SupervisedRun } from "@/db/schema/agent-lifecycle";
import { runStageReducer, RUN_STAGE_IDLE } from "./run-stage-reducer";

const POLL_MS = 1500;

const GLYPH: Record<string, string> = { running: "…", ok: "✓", error: "✗" };

export function RunStage({
  templateId,
  initialLastRun,
}: {
  templateId: string;
  /** The most recent supervised_runs row for this template, if any — shown
   *  on revisit even before the operator clicks "Run it once" again. */
  initialLastRun: SupervisedRun | null;
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
    dispatch({
      type: "started",
      runId: result.runId,
      status: result.status,
      actionLog: [],
    });
    if (result.status === "succeeded" || result.status === "failed") return;
    startPolling(result.runId);
  };

  const running = state.status === "starting" || state.status === "running";
  const actionLog = state.status === "running" || state.status === "succeeded" || state.status === "failed" ? state.actionLog : [];

  return (
    <div className="space-y-3">
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
        {state.status === "succeeded" ? (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Succeeded — {state.summary}
          </span>
        ) : null}
        {state.status === "failed" ? (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
            Failed — {state.summary}
          </span>
        ) : null}
        {state.status === "start_failed" ? (
          <span className="text-xs text-[var(--lc-muted)]">{state.error}</span>
        ) : null}
      </div>

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
