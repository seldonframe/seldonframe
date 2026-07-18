// Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
// writeWorkflowTrace: the ONE writer for `agent_workflow_traces` (schema:
// db/schema/agent-workflow-traces.ts). Mirrors lib/agent-receipts/write.ts's
// fail-soft contract exactly.
//
// FAIL-SOFT BY CONTRACT: this function NEVER throws and NEVER rejects — a
// trace-write failure must NEVER fail or delay the agent turn it observed
// (composio-event-dispatch.ts's dispatch loop). Every error path is caught +
// console.warn'd. Observation is best-effort; the turn's outcome is sacred.
//
// DI'd for unit tests: `deps.insert` defaults to a lazy `@/db` insert; tests
// pass a fake to assert the written row + exercise the fail-soft contract
// with a throwing insert.

import type {
  AgentWorkflowTraceKind,
  AgentWorkflowTraceRecords,
  AgentWorkflowTraceTriggerKind,
  NewAgentWorkflowTraceRow,
} from "@/db/schema/agent-workflow-traces";

export type WriteWorkflowTraceInput = {
  orgId: string;
  /** Nullable — mirrors agent_run_receipts.deployment_id (ON DELETE SET NULL,
   *  never cascade-deleted with the deployment). */
  deploymentId?: string | null;
  triggerKind: AgentWorkflowTraceTriggerKind;
  /** Gmail messageId / dedup key. Nullable — not every trigger has one. */
  triggerKey?: string | null;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  callCount: number;
  /** A TraceRecord[] (kind:'trace', default) or a reelier RunRecord
   *  (kind:'replay-run') — see AgentWorkflowTraceKind. */
  records: AgentWorkflowTraceRecords;
  /** Slice 2 — 'trace' (default, slice 1 behavior unchanged) or
   *  'replay-run' (an L0 replay attempt's RunRecord; see
   *  replay-before-llm.ts). */
  kind?: AgentWorkflowTraceKind;
  /** Slice 1 rule: populate from whatever the turn already exposes; store 0
   *  when unavailable rather than inventing a new metering path. */
  inputTokens?: number;
  outputTokens?: number;
};

/** Injectable insert fn — defaults to a lazy `@/db` insert (kept out of the
 *  top-level import graph so this module stays test-friendly + tree-
 *  shakeable in non-DB callers). */
export type WriteWorkflowTraceDb = (row: NewAgentWorkflowTraceRow) => Promise<void>;

async function defaultInsert(row: NewAgentWorkflowTraceRow): Promise<void> {
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  await db.insert(agentWorkflowTraces).values(row);
}

/**
 * Write one workflow-trace row. FAIL-SOFT BY CONTRACT: any throw (missing
 * required fields, a DB error, a deps.insert failure) is caught +
 * console.warn'd — this function always resolves, never rejects, and the
 * caller's run path must NEVER be blocked or retried because of it.
 */
export async function writeWorkflowTrace(
  input: WriteWorkflowTraceInput,
  deps?: { insert?: WriteWorkflowTraceDb },
): Promise<void> {
  try {
    if (!input.orgId || !input.orgId.trim()) {
      console.warn("[deployments/replay/persist] missing orgId — trace not written");
      return;
    }
    const insert = deps?.insert ?? defaultInsert;
    await insert({
      orgId: input.orgId,
      deploymentId: input.deploymentId ?? null,
      triggerKind: input.triggerKind,
      kind: input.kind ?? "trace",
      triggerKey: input.triggerKey ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      ok: input.ok,
      callCount: input.callCount,
      records: input.records,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
    });
  } catch (err) {
    console.warn(
      "[deployments/replay/persist] writeWorkflowTrace failed (fail-soft, run continues):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
