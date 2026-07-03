// Improve verb + trust rail (2026-07-02) — Task 2: the eval_runs persistence
// store.
//
// Two responsibilities, deliberately split:
//
//   1. `summarizeRunForPersistence` — a PURE function that takes the REAL
//      `RunAgentEvalsResult` (run-agent-evals.ts: `{ results: { scenario,
//      transcript, score }[], summary }`) and produces a `NewEvalRun` row.
//      NO I/O, no clock, no randomness — safe to unit-test with plain fakes
//      and safe to call from anywhere (an action, a route, the improve
//      orchestrator). This is also the ONLY place raw transcripts could leak
//      into a persisted row, so it is the load-bearing privacy boundary: it
//      copies scenario id/title + pass/fail + failed CHECK NAMES only, never
//      `transcript`/`turns` (see the Global Constraints in
//      docs/superpowers/plans/2026-07-02-improve-verb-trust-rail.md — no raw
//      customer transcripts in eval artifacts).
//
//   2. `recordEvalRun` / `getLatestEvalRun` / `listEvalRunsForSubject` — thin,
//      org-scoped Drizzle wrappers around the `eval_runs` table (schema:
//      src/db/schema/eval-runs.ts). Every WHERE includes `orgId` — a run
//      belongs to exactly one org and must never be readable cross-tenant.
//
// NOT "use server": a plain lib module (mirrors scheduled-send-store.ts),
// imported by server actions/routes that ARE "use server" themselves.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  evalRuns,
  type EvalRun,
  type EvalRunKind,
  type EvalRunScenarioResult,
  type EvalRunSubjectKind,
  type NewEvalRun,
} from "@/db/schema/eval-runs";
import type {
  AgentEvalResult,
  RunAgentEvalsResult,
} from "@/lib/agents/evals/run-agent-evals";

/** Clamp a fraction (nominally 0..1, but tolerate out-of-range inputs) to an
 *  integer percentage in [0, 100], rounding half-up. */
function passRateToPercent(passRate: number): number {
  const pct = Math.round((Number.isFinite(passRate) ? passRate : 0) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** The check NAMES (not the full EvalCheck objects) that failed for one
 *  scenario's score — derived text only, per the no-transcript constraint. */
function failedCheckNames(score: AgentEvalResult["score"]): string[] {
  const checks = Array.isArray(score?.checks) ? score.checks : [];
  return checks.filter((c) => c && c.passed === false).map((c) => c.name);
}

/** Map one `AgentEvalResult` → the derived-only `EvalRunScenarioResult` the
 *  row's `resultsSummary` stores. Reads ONLY `scenario.id`, `scenario.title`,
 *  `score.passed`, and `score.checks[].name` — never `transcript`, and never
 *  any `transcript`/`turns` key that might ride along on an over-permissive
 *  input object (the "leaky scenario" spec case). */
function toScenarioResult(result: AgentEvalResult): EvalRunScenarioResult {
  return {
    id: result.scenario.id,
    title: result.scenario.title,
    passed: result.score.passed === true,
    failedChecks: failedCheckNames(result.score),
  };
}

/**
 * PURE. Build a `NewEvalRun` row from a completed `RunAgentEvalsResult` plus
 * the run's identity (org/subject/kind) and provenance (grader model,
 * blueprint version). No I/O — safe to call from a pure orchestrator.
 *
 * - `passRate`: `summary.passRate` (0..1) → `Math.round(passRate * 100)`,
 *   clamped to [0, 100] (tolerates a caller-supplied summary outside the
 *   normal range).
 * - `scenarioCount` / `passedCount`: `summary.total` / `summary.passed`
 *   verbatim (NOT re-derived from `results.length`, so a caller's summary
 *   stays authoritative even if it disagrees with `results`).
 * - `resultsSummary`: `results.map(toScenarioResult)` — id/title/passed/
 *   failedChecks (names only) per scenario. NEVER carries `transcript` or
 *   `turns`, even if the input's scenario/score objects have extra keys.
 */
export function summarizeRunForPersistence(input: {
  orgId: string;
  subjectKind: EvalRunSubjectKind;
  subjectId: string;
  kind: EvalRunKind;
  result: RunAgentEvalsResult;
  graderModel: string | null;
  blueprintVersion: number | null;
}): NewEvalRun {
  const { orgId, subjectKind, subjectId, kind, result, graderModel, blueprintVersion } = input;
  const summary = result?.summary ?? { passed: 0, total: 0, passRate: 0 };
  const results = Array.isArray(result?.results) ? result.results : [];

  return {
    orgId,
    subjectKind,
    subjectId,
    kind,
    passRate: passRateToPercent(summary.passRate),
    scenarioCount: summary.total ?? 0,
    passedCount: summary.passed ?? 0,
    graderModel,
    blueprintVersion,
    resultsSummary: results.map(toScenarioResult),
  };
}

/** Insert one eval_runs row. Returns the new row's id. */
export async function recordEvalRun(row: NewEvalRun): Promise<{ id: string }> {
  const [inserted] = await db.insert(evalRuns).values(row).returning({ id: evalRuns.id });
  return { id: inserted.id };
}

/**
 * The most recent eval_runs row for a subject (agent or template), org-scoped.
 * `null` when the subject has never been run. Used for read surfaces (e.g.
 * workspace-state's `last_eval_run`, the marketplace trust badge).
 */
export async function getLatestEvalRun(args: {
  orgId: string;
  subjectKind: string;
  subjectId: string;
}): Promise<EvalRun | null> {
  const [row] = await db
    .select()
    .from(evalRuns)
    .where(
      and(
        eq(evalRuns.orgId, args.orgId),
        eq(evalRuns.subjectKind, args.subjectKind),
        eq(evalRuns.subjectId, args.subjectId),
      ),
    )
    .orderBy(desc(evalRuns.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Recent eval_runs rows for a subject, newest-first, org-scoped. Defaults to
 * 20 when `limit` is omitted.
 */
export async function listEvalRunsForSubject(args: {
  orgId: string;
  subjectKind: string;
  subjectId: string;
  limit?: number;
}): Promise<EvalRun[]> {
  return db
    .select()
    .from(evalRuns)
    .where(
      and(
        eq(evalRuns.orgId, args.orgId),
        eq(evalRuns.subjectKind, args.subjectKind),
        eq(evalRuns.subjectId, args.subjectId),
      ),
    )
    .orderBy(desc(evalRuns.createdAt))
    .limit(args.limit ?? 20);
}
