// Agent lifecycle slice — Stage 04 "Run": "Run it once — watch every
// action." Pure, dependency-injected orchestration (no DB, no network in
// tests) — mirrors run-agent-evals.ts's split: the thin "use server" action
// (lib/agent-templates/supervised-run-actions.ts) assembles the real deps
// (org-guard, the template's real Anthropic client + tool bindings via
// runStatelessAgentTurn) and calls `runSupervised` here.
//
// Money-safe / optimistic-path guard: success is the OBSERVABLE end state —
// a durable `supervised_runs` row with status 'succeeded' or 'failed', never
// "the code ran". A run that produces zero tool calls still terminates; a
// hard timeout terminates it as 'failed' rather than hanging forever; a
// throwing `runTurn` is caught and recorded as 'failed', never propagated.

import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";

/** Default hard timeout for one supervised run — long enough for a
 *  multi-tool-call turn, short enough that a wedged run doesn't strand the
 *  "Run it once" button in `running` forever. */
const DEFAULT_TIMEOUT_MS = 120_000;

export type SupervisedRunTurnResult = { ok: true; reply: string } | { ok: false; reason: string };

export type SupervisedRunDeps = {
  /** True iff a `supervised_runs` row for this org+template is currently
   *  `status:'running'` — enforces one run at a time per template. */
  hasRunningRun: (args: { orgId: string; templateId: string }) => Promise<boolean>;
  /** Insert the `running` row. Returns its id. */
  createRun: (args: { orgId: string; templateId: string }) => Promise<{ id: string }>;
  /** Drives the real agent turn (the "use server" action wires this to
   *  runStatelessAgentTurn with the template's real blueprint + resolved
   *  Anthropic client). `onToolEvent` is invoked synchronously per tool
   *  call's start/result — collect them for the final actionLog AND
   *  optionally stream them live via `appendActionEvent`. */
  runTurn: (args: {
    message: string;
    onToolEvent: (event: SupervisedRunActionEvent) => void;
  }) => Promise<SupervisedRunTurnResult>;
  /** Best-effort LIVE stream of one action-log entry (the UI's ~1.5s poll
   *  reads the row mid-run). Fire-and-forget from the caller's perspective —
   *  a failure here never affects the run's outcome; `finishRun` below
   *  writes the full, authoritative actionLog regardless. */
  appendActionEvent: (runId: string, event: SupervisedRunActionEvent) => Promise<void>;
  /** Writes the DURABLE terminal state — status + summary + the full,
   *  authoritative actionLog (reconciles any appendActionEvent that raced
   *  or failed) + finishedAt. This is the "supervised run passed" record
   *  the lifecycle gate reads. */
  finishRun: (
    runId: string,
    result: { status: "succeeded" | "failed"; summary: string; actionLog: SupervisedRunActionEvent[] },
  ) => Promise<void>;
  /** DI seam for the hard timeout — default races `runTurn` against a real
   *  timer. Tests inject a fake that resolves "timeout" deterministically,
   *  with no real wait. */
  runWithTimeout?: <T>(fn: () => Promise<T>, timeoutMs: number) => Promise<T | "timeout">;
  timeoutMs?: number;
};

export type SupervisedRunResult =
  | { ok: true; runId: string; status: "succeeded" | "failed"; summary: string }
  | { ok: false; error: "already_running" };

async function defaultRunWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    // Clear the losing timer either way — an un-cleared timer keeps a
    // handle alive for the full timeoutMs even after a fast turn resolves
    // (a real resource leak, and what made the test suite itself hang for
    // 120s before this fix).
    clearTimeout(timer!);
  }
}

/**
 * Run ONE supervised, real-tool template turn: enforces one-running-run-per-
 * template, creates the durable row, drives `runTurn` (racing a hard
 * timeout), streams tool events best-effort, and ALWAYS finishes the row —
 * succeeded, failed (turn error), or failed (timeout). Never throws.
 */
export async function runSupervised(
  deps: SupervisedRunDeps,
  input: { orgId: string; templateId: string; kickoffMessage: string },
): Promise<SupervisedRunResult> {
  const alreadyRunning = await deps.hasRunningRun({ orgId: input.orgId, templateId: input.templateId });
  if (alreadyRunning) return { ok: false, error: "already_running" };

  const { id: runId } = await deps.createRun({ orgId: input.orgId, templateId: input.templateId });

  const actionLog: SupervisedRunActionEvent[] = [];
  const onToolEvent = (event: SupervisedRunActionEvent) => {
    actionLog.push(event);
    // Best-effort live stream — never awaited by the turn loop, never
    // allowed to affect the run's outcome.
    deps.appendActionEvent(runId, event).catch(() => {});
  };

  const runWithTimeout = deps.runWithTimeout ?? defaultRunWithTimeout;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let outcome: SupervisedRunTurnResult | "timeout";
  try {
    outcome = await runWithTimeout(
      () => deps.runTurn({ message: input.kickoffMessage, onToolEvent }),
      timeoutMs,
    );
  } catch (err) {
    // The turn itself threw (e.g. a network error outside runTurn's own
    // ok:false contract) — never propagate; the run still finishes honestly.
    outcome = { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  let status: "succeeded" | "failed";
  let summary: string;
  if (outcome === "timeout") {
    status = "failed";
    summary = `Run timed out after ${Math.round(timeoutMs / 1000)}s.`;
  } else if (outcome.ok) {
    status = "succeeded";
    summary = outcome.reply || "Run completed.";
  } else {
    status = "failed";
    summary = `Run failed: ${outcome.reason}`;
  }

  await deps.finishRun(runId, { status, summary, actionLog });

  return { ok: true, runId, status, summary };
}
