// Cost recorder for LLM calls inside workflow_runs.
// SLICE 9 PR 2 C4 per Max's PR 2 spec.
//
// Wraps the workflow_runs aggregate-counter increment behind a single
// helper so call sites just say `recordLlmUsage(runId, model, response.usage)`.
//
// Robustness contract (per Max's "edge case: token count missing from
// response"): the helper must NEVER throw. Missing usage data → 0
// tokens recorded, no exception. Workflows must keep advancing even
// if cost capture has a hiccup.
//
// The helper is idempotent at the call-site granularity but NOT
// transactionally safe under concurrent multi-step LLM use; SQL
// `+= ` semantics mean concurrent recordings against the same runId
// can interleave. That's acceptable for v1 (a workflow_run executes
// sequentially within a single dispatcher call). If parallel-step
// dispatchers ship later, a row-level lock or dedicated cost ledger
// will be needed.

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { workflowRuns } from "@/db/schema/workflow-runs";

import { computeCallCost } from "./pricing";

export type RecordLlmUsageInput = {
  runId: string;
  model: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
};

export async function recordLlmUsage(input: RecordLlmUsageInput): Promise<void> {
  try {
    const inTok = Number.isFinite(input.inputTokens) ? Math.max(0, input.inputTokens as number) : 0;
    const outTok = Number.isFinite(input.outputTokens) ? Math.max(0, input.outputTokens as number) : 0;
    if (inTok === 0 && outTok === 0) return; // nothing to record

    const cost = computeCallCost(input.model, inTok, outTok);
    await db
      .update(workflowRuns)
      .set({
        totalTokensInput: sql`${workflowRuns.totalTokensInput} + ${inTok}`,
        totalTokensOutput: sql`${workflowRuns.totalTokensOutput} + ${outTok}`,
        totalCostUsdEstimate: sql`${workflowRuns.totalCostUsdEstimate} + ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, input.runId));
  } catch (err) {
    // Per L-22-style discipline: cost capture failures are observability
    // concerns, NEVER block the workflow. Log + swallow.
    // eslint-disable-next-line no-console
    console.warn("[workflow-cost-recorder] recordLlmUsage failed", {
      runId: input.runId,
      model: input.model,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
