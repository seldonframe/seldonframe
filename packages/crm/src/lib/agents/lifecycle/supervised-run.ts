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
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

/** Default hard timeout for one supervised run. MUST stay comfortably below
 *  the platform's own function timeout — if the app-side timeout is longer
 *  than the platform's, the PLATFORM kills the invocation first, `finishRun`
 *  never runs, and the `supervised_runs` row is stranded at `running`
 *  forever (Wave 1 review, F1).
 *
 *  H2 hotfix (2026-07-11) — the OLD 55s rationale ("a standard 60s
 *  Fluid/Serverless ceiling") is obsolete now that `driveSupervisedRunTurn`
 *  runs out-of-request inside `after()` (see supervised-run-actions.ts):
 *  the request itself returns in under a second, and the deferred work runs
 *  against the route's `maxDuration` (300s — Vercel's hard function
 *  ceiling), not the old synchronous-response budget. 240s leaves a 60s
 *  margin inside that 300s ceiling for `finishRun`'s own write to land. */
const DEFAULT_TIMEOUT_MS = 240_000;

/** A `running` row older than this is presumed stranded — the platform
 *  killed the function before the app-side timeout (above) or `finishRun`
 *  ever ran. `resolveRunningRunGuard` (below) uses this so a stranded row
 *  can never permanently brick the "Run it once" button. */
export const STALE_RUNNING_MS = 10 * 60 * 1000; // 10 minutes

export type RunningRunGuardDecision =
  | { blocks: true }
  | { blocks: false; staleRunId: string | null };

/**
 * Pure decision core for the one-run-per-template guard's staleness check
 * (Wave 1 fix wave, F1). A running row younger than `STALE_RUNNING_MS`
 * still blocks a new start (today's behavior, unchanged). An OLDER running
 * row is presumed stranded — never actually finished because the platform
 * killed the function before `finishRun` wrote — so it does NOT block, and
 * its id is returned so the caller can lazily reconcile it to `failed`
 * (org-scoped) in the same code path. No row at all -> never blocks.
 */
export function resolveRunningRunGuard(
  row: { id: string; startedAt: Date } | null,
  now: Date,
): RunningRunGuardDecision {
  if (!row) return { blocks: false, staleRunId: null };
  const ageMs = now.getTime() - row.startedAt.getTime();
  if (ageMs < STALE_RUNNING_MS) return { blocks: true };
  return { blocks: false, staleRunId: row.id };
}

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
  | {
      ok: true;
      runId: string;
      status: "succeeded" | "failed";
      summary: string;
      /** F-E (2026-07-11 incident: prod row 48e7fcc0-0e34-4447-bc3f-
       *  9bbdc811a9dc) — the SAME actionLog durably written via finishRun,
       *  returned to the synchronous caller too. Before this fix the
       *  caller (startSupervisedRunAction -> run-stage.tsx) had no way to
       *  know what actually happened without a follow-up poll, and the
       *  common case — the turn finishes within the same request — never
       *  polls at all, so the evidence silently never reached the UI. */
      actionLog: SupervisedRunActionEvent[];
    }
  | { ok: false; error: "already_running" };

/**
 * True iff `err` is a Postgres unique-constraint violation (code 23505).
 * F2, Wave 1 review — the friendly app-level `hasRunningRun` check has a
 * TOCTOU window (two concurrent "Run it once" clicks can both pass the
 * check before either insert lands); `supervised_runs_one_running_per_
 * template` (migration 0069) closes it at the DB layer. This maps THAT
 * constraint's insert failure onto the same `already_running` result the
 * friendly check returns — a code check, never a message string-match
 * (mirrors message-trigger-storage-drizzle.ts's isUniqueViolation).
 */
export function isUniqueViolationError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  return code === "23505";
}

/**
 * The kickoff message that starts a supervised run — a plain-text turn that
 * stands in for whatever would actually fire this template live. For a
 * schedule trigger it's the SAME semantic shape `runDueScheduledAgents`
 * sends on a real cron tick ("your schedule just fired"), just as a chat
 * message rather than a SeldonEvent — no new trigger rail, per the spec's
 * "NO new infrastructure" constraint. Every other trigger kind gets a
 * neutral "go ahead and run now" kickoff.
 *
 * T3 framing (2026-07-11 incident follow-up): the recorded workflow's steps
 * describe the HUMAN'S browser path, not a literal script to narrate — the
 * agent has real, connected tools and its job is to accomplish each step's
 * OUTCOME with them right now. If a step genuinely can't be done with the
 * tools it has, it must say exactly which step and why instead of claiming
 * success. Pure; never throws.
 */
export function buildKickoffMessage(trigger: AgentTrigger | null | undefined): string {
  const opening =
    trigger?.kind === "schedule"
      ? "Your schedule just fired — run your workflow now, exactly as if it were live."
      : "Go ahead and run your workflow now, exactly as if it were live.";
  return (
    `${opening} You have real, connected tools — use them. The workflow's ` +
    "steps describe the human path that was recorded; your job is to " +
    "accomplish each step's outcome with your tools right now, not narrate " +
    "the recording. If any step can't be done with your available tools, " +
    "say exactly which step and why instead of claiming it succeeded."
  );
}

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

export type BeginSupervisedRunResult = { ok: true; runId: string } | { ok: false; error: "already_running" };

/**
 * H2 hotfix (2026-07-11) — the FAST half of what used to be one
 * `runSupervised` call: enforce one-running-run-per-template and insert the
 * durable `running` row. Sub-second (one SELECT + one INSERT), so the
 * caller can return `{runId, status:"running"}` to the client immediately
 * and defer the actual (potentially multi-minute) turn to
 * `driveSupervisedRunTurn` inside `after()` — unjamming Next's per-tab
 * server-action queue, which is what let a long-running "Run evals"/"Run it
 * once" POST freeze every other click on the same tab behind it.
 */
export async function beginSupervisedRun(
  deps: Pick<SupervisedRunDeps, "hasRunningRun" | "createRun">,
  input: { orgId: string; templateId: string },
): Promise<BeginSupervisedRunResult> {
  const alreadyRunning = await deps.hasRunningRun({ orgId: input.orgId, templateId: input.templateId });
  if (alreadyRunning) return { ok: false, error: "already_running" };

  // F2, Wave 1 review — the check above is the friendly, low-latency path;
  // it has a TOCTOU window (two concurrent clicks can both pass it before
  // either insert lands). `supervised_runs_one_running_per_template`
  // (migration 0069) is the correctness backstop: a second concurrent
  // insert violates that partial unique index, and we map ITS error
  // (by code, never by message) onto the same already_running result.
  try {
    const created = await deps.createRun({ orgId: input.orgId, templateId: input.templateId });
    return { ok: true, runId: created.id };
  } catch (err) {
    if (isUniqueViolationError(err)) return { ok: false, error: "already_running" };
    throw err;
  }
}

/**
 * H2 hotfix — the SLOW half: drives `runTurn` (racing a hard timeout) for an
 * ALREADY-CREATED run row, streams tool events best-effort, and ALWAYS
 * finishes the row — succeeded, failed (turn error), or failed (timeout).
 * Never throws. Designed to run inside `after()` (out-of-request), so its
 * caller has already returned a response by the time this executes.
 */
export async function driveSupervisedRunTurn(
  deps: Omit<SupervisedRunDeps, "hasRunningRun" | "createRun">,
  runId: string,
  kickoffMessage: string,
): Promise<SupervisedRunResult> {
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
      () => deps.runTurn({ message: kickoffMessage, onToolEvent }),
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
    // outcome.ok is NOT sufficient on its own (the 2026-07-11 incident: a
    // turn can return ok:true — the model replied without erroring — while
    // taking zero real tool actions, e.g. because its only bound tool
    // resolved to an empty allowlist). The verdict is deterministic on the
    // actionLog instead: at least one 'ok' tool event is what "succeeded"
    // actually means for a supervised run.
    const tookRealAction = actionLog.some((event) => event.status === "ok");
    if (tookRealAction) {
      status = "succeeded";
      summary = outcome.reply || "Run completed.";
    } else {
      status = "failed";
      const reply = outcome.reply?.trim();
      summary = reply
        ? `The run completed without taking any real actions in your connected apps. ${reply}`
        : "The run completed without taking any real actions in your connected apps.";
    }
  } else {
    status = "failed";
    summary = `Run failed: ${outcome.reason}`;
  }

  await deps.finishRun(runId, { status, summary, actionLog });

  return { ok: true, runId, status, summary, actionLog };
}

/**
 * Legacy synchronous entry point — begins AND drives the run in one call,
 * to completion, exactly as this module always has. Kept for tests and any
 * caller that genuinely wants to await the whole thing (e.g. a script);
 * `startSupervisedRunAction` no longer uses this — it calls
 * `beginSupervisedRun` synchronously and `driveSupervisedRunTurn` inside
 * `after()` instead (H2 hotfix). Behavior is IDENTICAL to before the split.
 */
export async function runSupervised(
  deps: SupervisedRunDeps,
  input: { orgId: string; templateId: string; kickoffMessage: string },
): Promise<SupervisedRunResult> {
  const begin = await beginSupervisedRun(deps, input);
  if (!begin.ok) return begin;
  return driveSupervisedRunTurn(deps, begin.runId, input.kickoffMessage);
}
