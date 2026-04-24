// Branch observability — wires dispatchBranch's onEvaluated hook to
// the workflow_event_log.
//
// SLICE 6 PR 2 C4 per audit §4.5 + G-6-6 A.
//
// Two event types ship:
//   workflow.external_state.evaluated  — external_state branches
//   workflow.branch.evaluated          — predicate branches
//
// Both land in workflow_event_log (existing table, NOT in the
// SeldonEvent union). /agents/runs renders them inline with the
// existing event-log panel.
//
// Secret safety (Max's specific-watch #2): payloads carry ONLY the
// allowlist fields (runId / stepId / conditionType / url / method /
// responseStatus / matched / elapsedMs / error?). Request auth headers
// + body strings never reach the hook — dispatchBranch only passes
// the allowlist. A test pins the contract.

import type { EventLogInput, RuntimeContext, RuntimeStorage } from "./types";

export type BranchObservabilityEvent = {
  runId: string;
  stepId: string;
  conditionType: "predicate" | "external_state";
  url?: string;
  method?: string;
  responseStatus?: number;
  matched: boolean;
  elapsedMs: number;
  error?: string;
};

export function makeBranchObservabilityHook(args: {
  storage: RuntimeStorage;
  orgId: string;
  now: RuntimeContext["now"];
}): (entry: BranchObservabilityEvent) => void {
  return (entry) => {
    // Fire-and-forget: observability must NEVER fail the branch. Any
    // storage error is logged + swallowed.
    const eventType =
      entry.conditionType === "external_state"
        ? "workflow.external_state.evaluated"
        : "workflow.branch.evaluated";

    const payload: Record<string, unknown> = {
      runId: entry.runId,
      stepId: entry.stepId,
      conditionType: entry.conditionType,
      matched: entry.matched,
      elapsedMs: entry.elapsedMs,
    };
    if (entry.url !== undefined) payload.url = entry.url;
    if (entry.method !== undefined) payload.method = entry.method;
    if (entry.responseStatus !== undefined) payload.responseStatus = entry.responseStatus;
    if (entry.error !== undefined) payload.error = entry.error;

    const input: EventLogInput = {
      orgId: args.orgId,
      eventType,
      payload,
    };

    // Defer via microtask so the dispatcher doesn't await the append.
    // Branch dispatch latency stays tight; event-log write races the
    // next step advancement (acceptable for observability).
    queueMicrotask(() => {
      args.storage.appendEventLog(input).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[branch-observability] appendEventLog failed", {
          orgId: args.orgId,
          eventType,
          runId: entry.runId,
          stepId: entry.stepId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  };
}
