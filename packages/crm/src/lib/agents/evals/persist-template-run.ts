// Improve verb + trust rail (2026-07-02) — Task 3: wire T2's eval_runs store
// into the existing template eval action.
//
// `runAgentEvalsAction` (agent-templates/eval-actions.ts) is "use server" —
// only async functions may be exported from it
// (scripts/check-use-server.sh), so the persistable core lives here as a
// plain, DI-friendly orchestrator the action calls into. This is also what
// makes it unit-testable with fakes (no Postgres): the spec
// (tests/unit/evals/eval-persist-wiring.spec.ts) injects fake
// `recordEvalRun`/`updateTemplateEvalScore` deps and asserts exactly one
// call to each, with the evalScore update carrying the SAME value as the
// persisted row's `passRate` — one source of truth, not two independently
// derived numbers.
//
// Two-step persist, in order:
//   1. `summarizeRunForPersistence` (T2, eval-runs-store.ts) turns the run
//      result into a `NewEvalRun` row (subjectKind 'template', kind
//      'manual', blueprintVersion null — templates aren't versioned like
//      deployed agents) → `deps.recordEvalRun(row)`.
//   2. `deps.updateTemplateEvalScore({ orgId, templateId, evalScore:
//      row.passRate })` — revives `agent_templates.eval_score`, which has
//      existed on the schema but was never written until now.
//
// FAIL-SOFT, end to end: an eval run must never fail because persistence
// hiccuped (the operator already has their pass-rate summary on screen from
// the real run — losing the durable record is a shame, not a customer-
// facing failure). Both steps run inside one try/catch; any throw from
// either dependency is caught, logged via a structured console.warn (the
// repo's `[module] event_name` convention — see workflow-cost-recorder.ts,
// deployments/actions.ts), and swallowed. Step 2 only runs if step 1
// actually persisted a row (nothing to score off a run that didn't land).

import type { NewEvalRun } from "@/db/schema/eval-runs";
import { summarizeRunForPersistence } from "@/lib/agents/evals/eval-runs-store";
import type { RunAgentEvalsResult } from "@/lib/agents/evals/run-agent-evals";

export type PersistTemplateEvalRunArgs = {
  orgId: string;
  templateId: string;
  result: RunAgentEvalsResult;
  /** The grader model actually resolved for this run (e.g.
   *  `process.env.ANTHROPIC_EVAL_MODEL || DEFAULT_EVAL_MODEL` from
   *  score-llm.ts) — null when unknown. */
  graderModel: string | null;
};

export type PersistTemplateEvalRunDeps = {
  recordEvalRun: (row: NewEvalRun) => Promise<{ id: string }>;
  updateTemplateEvalScore: (args: {
    orgId: string;
    templateId: string;
    evalScore: number;
  }) => Promise<void>;
};

/**
 * Persist one completed template eval run: record the durable `eval_runs`
 * row, then revive `agent_templates.eval_score` from that SAME row's
 * `passRate`. NEVER throws — every failure is caught, logged, and swallowed,
 * so a persistence hiccup can never fail the eval run the operator already
 * saw succeed on screen. Templates carry no `blueprintVersion` (that field
 * is for deployed agents whose blueprint is versioned; a template's
 * blueprint is edited in place) — always `null` here.
 */
export async function persistTemplateEvalRun(
  args: PersistTemplateEvalRunArgs,
  deps: PersistTemplateEvalRunDeps,
): Promise<void> {
  const { orgId, templateId, result, graderModel } = args;

  let row: NewEvalRun | null = null;
  try {
    row = summarizeRunForPersistence({
      orgId,
      subjectKind: "template",
      subjectId: templateId,
      kind: "manual",
      result,
      graderModel,
      blueprintVersion: null,
    });
    await deps.recordEvalRun(row);
  } catch (err) {
    console.warn("[eval-actions] persist_template_eval_run_failed", {
      stage: "record_eval_run",
      orgId,
      templateId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    await deps.updateTemplateEvalScore({
      orgId,
      templateId,
      evalScore: row.passRate,
    });
  } catch (err) {
    console.warn("[eval-actions] persist_template_eval_run_failed", {
      stage: "update_eval_score",
      orgId,
      templateId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
