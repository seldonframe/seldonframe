// Workflow runtime engine — executes AgentSpec JSON against durable
// Postgres state. Shipped in Scope 3 Step 2c PR 2 per audit §4 + §8.2.
//
// Public functions:
//   - startRun(context, orgId, archetypeId, spec, trigger) → creates
//     a workflow_runs row, seeds variable scope from spec.variables
//     against the trigger payload, positions at the first step, and
//     begins advancement. Returns the run id once the first pause
//     or completion is reached.
//   - advanceRun(context, runId) → loads the run, dispatches the
//     current step, applies the returned NextAction transactionally.
//     Iterates until the run pauses (await_event / timer) or
//     completes / fails. "Transactional" in PR 2 means "discrete
//     DB writes" — true multi-write transactions land when we
//     consolidate wait registration + run status update in PR 3's
//     cron hardening.
//   - registerWait(context, run, pauseAction) → inserts a
//     workflow_waits row with the resolved predicate (frozen per
//     G-4) and marks the run status = "waiting".
//   - resumeWait(context, waitId, reason, resumingEventId) →
//     compare-and-swap claims the wait, loads the associated run,
//     optionally captures the resuming event's payload under the
//     wait's capture name, and kicks off advancement to the
//     appropriate next step (on_resume.next or on_timeout.next).
//
// No new shared-type dependencies. Imports only:
//   - validator types (for AgentSpec + Step narrowing)
//   - local dispatcher files
//   - local types.ts + predicate-eval.ts

import type {
  AgentSpec,
  AwaitEventStep,
  BranchStep,
  ConversationStep,
  EmitEventStep,
  McpToolCallStep,
  ReadStateStep,
  RequestApprovalStep,
  Step,
  WaitStep,
  WriteStateStep,
} from "../agents/validator";
import { dispatchWait } from "./step-dispatchers/wait";
import { dispatchMcpToolCall } from "./step-dispatchers/mcp-tool-call";
import { dispatchConversation } from "./step-dispatchers/conversation";
import { dispatchAwaitEvent } from "./step-dispatchers/await-event";
import { dispatchReadState } from "./step-dispatchers/read-state";
import { dispatchWriteState } from "./step-dispatchers/write-state";
import { dispatchEmitEvent } from "./step-dispatchers/emit-event";
import { dispatchBranch } from "./step-dispatchers/branch";
import { dispatchRequestApproval } from "./step-dispatchers/request-approval";
import type { NextAction, RuntimeContext, StoredRun, StoredWait } from "./types";
import { findStep, RuntimeError, TIMER_EVENT_TYPE } from "./types";

// ---------------------------------------------------------------------
// Step-type guards — re-implement locally because the validator's
// guards check synthesis-time Zod shapes; runtime guards check
// storage-loaded steps whose types are the inferred Zod outputs.
// Behavior identical; kept local so runtime.ts has zero dependence
// on the validator's internal un-exported guards.
// ---------------------------------------------------------------------

function isWaitStep(step: Step): step is WaitStep {
  return step.type === "wait" && typeof (step as Partial<WaitStep>).seconds === "number";
}
function isMcpToolCallStep(step: Step): step is McpToolCallStep {
  return step.type === "mcp_tool_call" && typeof (step as Partial<McpToolCallStep>).tool === "string";
}
function isConversationStep(step: Step): step is ConversationStep {
  return step.type === "conversation" && typeof (step as Partial<ConversationStep>).initial_message === "string";
}
function isReadStateStep(step: Step): step is ReadStateStep {
  const s = step as Partial<ReadStateStep>;
  return (
    step.type === "read_state" &&
    typeof s.source === "string" &&
    typeof s.path === "string" &&
    typeof s.capture === "string"
  );
}
function isWriteStateStep(step: Step): step is WriteStateStep {
  const s = step as Partial<WriteStateStep>;
  return step.type === "write_state" && typeof s.path === "string";
}
function isEmitEventStep(step: Step): step is EmitEventStep {
  const s = step as Partial<EmitEventStep>;
  return step.type === "emit_event" && typeof s.event === "string";
}
function isBranchStep(step: Step): step is BranchStep {
  const s = step as Partial<BranchStep>;
  return (
    step.type === "branch" &&
    typeof s.condition === "object" && s.condition !== null &&
    "on_match_next" in step &&
    "on_no_match_next" in step
  );
}
function isAwaitEventStep(step: Step): step is AwaitEventStep {
  const s = step as Partial<AwaitEventStep>;
  return (
    step.type === "await_event" &&
    typeof s.event === "string" &&
    typeof s.on_resume === "object" && s.on_resume !== null &&
    typeof s.on_timeout === "object" && s.on_timeout !== null
  );
}
function isRequestApprovalStep(step: Step): step is RequestApprovalStep {
  const s = step as Partial<RequestApprovalStep>;
  return (
    step.type === "request_approval" &&
    typeof s.approver === "object" && s.approver !== null &&
    typeof s.context === "object" && s.context !== null &&
    "next_on_approve" in step &&
    "next_on_reject" in step
  );
}

// ---------------------------------------------------------------------
// Variable scope seeding — resolves spec.variables references against
// the trigger payload. Syntax follows the archetype convention:
// `trigger.contact.firstName` walks trigger payload keys. If the
// trigger payload doesn't have the reference, the variable resolves
// to an empty string (runtime is permissive; synthesis-time
// validation is where shape guarantees live).
// ---------------------------------------------------------------------

function seedVariableScope(
  specVariables: Record<string, string> | undefined,
  triggerPayload: Record<string, unknown>,
): Record<string, unknown> {
  if (!specVariables) return {};
  const out: Record<string, unknown> = {};
  for (const [varName, ref] of Object.entries(specVariables)) {
    const segments = ref.split(".");
    // Only paths starting with "trigger" are resolved; other shapes
    // (rare) are stored verbatim as strings.
    if (segments[0] !== "trigger") {
      out[varName] = ref;
      continue;
    }
    let current: unknown = triggerPayload;
    for (const seg of segments.slice(1)) {
      if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[seg];
      } else {
        current = "";
        break;
      }
    }
    out[varName] = current;
  }
  return out;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export type StartRunInput = {
  orgId: string;
  archetypeId: string;
  spec: AgentSpec;
  triggerEventId: string | null;
  triggerPayload: Record<string, unknown>;
};

export async function startRun(
  context: RuntimeContext,
  input: StartRunInput,
): Promise<string> {
  const firstStep = input.spec.steps[0];
  if (!firstStep) {
    throw new RuntimeError("Cannot start run with empty spec.steps");
  }
  const variableScope = seedVariableScope(input.spec.variables, input.triggerPayload);
  const runId = await context.storage.createRun({
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    specSnapshot: input.spec,
    triggerEventId: input.triggerEventId,
    triggerPayload: input.triggerPayload,
    currentStepId: firstStep.id,
    variableScope,
  });
  await advanceRun(context, runId);
  return runId;
}

/**
 * Drive the run forward from its current step. Loops until:
 *   - the dispatched step pauses (pause_event / pause_timer),
 *   - the run completes (advance next=null), or
 *   - a failure surfaces.
 *
 * Per audit §4.5, deploy survival is automatic — every state change
 * commits to Postgres before the loop continues. Process death mid-
 * loop loses the in-memory step counter but not the run state.
 */
export async function advanceRun(context: RuntimeContext, runId: string): Promise<void> {
  let guard = 0;
  const maxIterations = 1024; // safety ceiling — production runs rarely chain > ~50 steps

  while (guard++ < maxIterations) {
    const run = await context.storage.getRun(runId);
    if (!run) {
      throw new RuntimeError(`Run ${runId} not found`, runId);
    }
    if (run.status !== "running") {
      // Terminal or paused — nothing to advance.
      return;
    }
    if (!run.currentStepId) {
      // Completed implicitly — sync status.
      await context.storage.updateRun(runId, { status: "completed" });
      return;
    }

    const step = findStep(run.specSnapshot, run.currentStepId);
    if (!step) {
      await markRunFailed(
        context,
        runId,
        `current step "${run.currentStepId}" not found in spec`,
      );
      return;
    }

    const dispatchStart = Date.now();
    const action = await dispatchStep(run, step, context);
    const durationMs = Date.now() - dispatchStart;
    // PR 3 M1: write step-result row for the admin drawer's trace
    // view. Outcome maps from the NextAction kind; errors surface
    // via applyAction's fail branch (markRunFailed appends another
    // row).
    await context.storage.appendStepResult({
      runId: run.id,
      stepId: step.id,
      stepType: step.type,
      outcome: stepResultOutcome(action),
      captureValue:
        action.kind === "advance" && action.capture
          ? { [action.capture.name]: action.capture.value }
          : null,
      errorMessage: action.kind === "fail" ? action.reason : null,
      durationMs,
    });
    const done = await applyAction(context, run, action);
    if (done) return;
  }

  await markRunFailed(
    context,
    runId,
    `advancement exceeded ${maxIterations} iterations — suspected infinite loop`,
  );
}

/**
 * Register a workflow_waits row for an await_event or wait pause and
 * flip the run to status="waiting". Exported for the sync resume path
 * in bus.ts (PR 2 M3) — that path wants the write-wait primitive
 * without driving a full dispatch.
 */
export async function registerWait(
  context: RuntimeContext,
  runId: string,
  stepId: string,
  waitInput: {
    eventType: string;
    matchPredicate: Record<string, unknown> | null;
    timeoutAt: Date;
  },
): Promise<string> {
  const waitId = await context.storage.createWait({
    runId,
    stepId,
    eventType: waitInput.eventType,
    matchPredicate: waitInput.matchPredicate,
    timeoutAt: waitInput.timeoutAt,
  });
  await context.storage.updateRun(runId, { status: "waiting" });
  return waitId;
}

/**
 * Claim a wait (CAS) and resume the associated run. Used by:
 *   - bus.ts sync resume (reason: "event_match", resumingEventId: <event log id>)
 *   - cron tick timeout sweep (reason: "timeout", resumingEventId: null)
 *   - admin manual resume (reason: "manual", resumingEventId: null)
 *
 * If the CAS fails (someone else claimed the wait), return null. Do
 * not throw — the caller treats "lost the claim" as a no-op.
 */
export type ResumeReason = "event_match" | "timeout" | "manual" | "cancelled";

export async function resumeWait(
  context: RuntimeContext,
  wait: StoredWait,
  reason: ResumeReason,
  resumingEventId: string | null,
  resumingEventPayload: Record<string, unknown> | null,
): Promise<{ resumed: boolean; runId: string }> {
  const claimed = await context.storage.claimWait(wait.id, reason, resumingEventId);
  if (!claimed) return { resumed: false, runId: wait.runId };

  const run = await context.storage.getRun(wait.runId);
  if (!run) {
    throw new RuntimeError(`Run ${wait.runId} not found during wait resume`, wait.runId);
  }
  const step = findStep(run.specSnapshot, wait.stepId);
  if (!step || !isAwaitEventStep(step)) {
    // Pure-timer `wait` steps also flow through here (reason="timeout")
    // — see TIMER_EVENT_TYPE sentinel. For those, the step is a
    // WaitStep, not an AwaitEventStep; advance unconditionally.
    if (step && isWaitStep(step)) {
      await advanceTo(context, run.id, step.next);
      await advanceRun(context, run.id);
      return { resumed: true, runId: run.id };
    }
    throw new RuntimeError(
      `Wait ${wait.id} references step ${wait.stepId} which is not await_event or wait`,
      run.id,
    );
  }

  // Capture event payload if the await_event step declared capture.
  if (reason === "event_match" && step.on_resume.capture && resumingEventPayload) {
    const newCaptureScope = {
      ...run.captureScope,
      [step.on_resume.capture]: resumingEventPayload,
    };
    await context.storage.updateRun(run.id, { captureScope: newCaptureScope });
  }

  const nextStepId = reason === "timeout" ? step.on_timeout.next : step.on_resume.next;
  await advanceTo(context, run.id, nextStepId);
  await advanceRun(context, run.id);
  return { resumed: true, runId: run.id };
}

// ---------------------------------------------------------------------
// SLICE 10 PR 1 C5 — request_approval resume wrapper for the API layer.
//
// Parallel to resumeWait: claims the approval row via CAS, advances
// the run to next_on_approve / next_on_reject, then drives the
// dispatch loop. The pure `resumeApproval` helper in
// step-dispatchers/request-approval.ts handles the CAS + the next-step
// decision (no dispatch loop dependency, so it stays unit-testable
// in isolation). This wrapper layers `advanceRun` on top so the API
// endpoint can call ONE thing and have the run progress to its next
// pause / completion.
// ---------------------------------------------------------------------

import { resumeApproval as resumeApprovalPure } from "./step-dispatchers/request-approval";
import type { ResumeApprovalInput } from "./step-dispatchers/request-approval";

export async function runtimeResumeApproval(
  context: RuntimeContext,
  input: ResumeApprovalInput,
): Promise<{ resumed: boolean; runId: string | null }> {
  if (!context.approvalStorage) {
    throw new RuntimeError("runtimeResumeApproval requires context.approvalStorage", "");
  }
  const result = await resumeApprovalPure(
    {
      storage: context.approvalStorage,
      loadRun: (runId) => context.storage.getRun(runId),
      advanceTo: (runId, nextStepId) => advanceTo(context, runId, nextStepId),
      now: context.now,
    },
    input,
  );
  // If the resume claimed the row AND the run was advanced (not
  // terminal), drive the dispatch loop. The pure resumeApproval
  // returned resumed=true for both "advanced" and "terminal-no-op"
  // cases; we re-load the run to distinguish.
  if (result.resumed && result.runId) {
    const run = await context.storage.getRun(result.runId);
    if (run && (run.status === "running" || run.status === "waiting")) {
      await advanceRun(context, result.runId);
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

function stepResultOutcome(action: NextAction): "advanced" | "paused" | "failed" {
  switch (action.kind) {
    case "advance":
      return "advanced";
    case "pause_event":
    case "pause_timer":
    case "pause_approval":
      return "paused";
    case "fail":
      return "failed";
  }
}

async function dispatchStep(
  run: StoredRun,
  step: Step,
  context: RuntimeContext,
): Promise<NextAction> {
  if (isWaitStep(step)) return dispatchWait(run, step, context);
  if (isMcpToolCallStep(step)) return dispatchMcpToolCall(run, step, context);
  if (isConversationStep(step)) return dispatchConversation(run, step, context);
  if (isAwaitEventStep(step)) return dispatchAwaitEvent(run, step, context);
  if (isReadStateStep(step)) return dispatchReadState(run, step, context);
  if (isWriteStateStep(step)) return dispatchWriteState(run, step, context);
  if (isEmitEventStep(step)) return dispatchEmitEvent(run, step, context);
  if (isBranchStep(step)) {
    // SLICE 6 PR 2 C3 — wire dispatchBranch into the runtime dispatch
    // switch. Construct BranchDispatchContext from RuntimeContext's
    // optional resolveSecret + onBranchEvaluated fields. When
    // resolveSecret is unset (pre-SLICE-6 callers), any external_state
    // branch with auth fails-closed via evaluateExternalState's secret
    // resolution failure path.
    return dispatchBranch(run, step, {
      resolveSecret:
        context.resolveSecret ??
        (async () => {
          throw new Error(
            "resolveSecret not configured on RuntimeContext; external_state branches with auth cannot resolve",
          );
        }),
      onEvaluated: context.onBranchEvaluated,
    });
  }
  if (isRequestApprovalStep(step)) {
    // SLICE 10 PR 1 C4 — request_approval dispatcher. Requires the
    // RuntimeContext to carry approvalStorage + resolveApprover +
    // getWorkspaceMagicLinkSecret. When unset (pre-SLICE-10 callers),
    // fail-closed with a clear error so the gap is visible at runtime
    // instead of silently dropping the approval request.
    if (!context.approvalStorage) {
      return { kind: "fail", reason: "request_approval: RuntimeContext.approvalStorage not configured" };
    }
    if (!context.resolveApprover) {
      return { kind: "fail", reason: "request_approval: RuntimeContext.resolveApprover not configured" };
    }
    if (!context.getWorkspaceMagicLinkSecret) {
      return { kind: "fail", reason: "request_approval: RuntimeContext.getWorkspaceMagicLinkSecret not configured" };
    }
    return dispatchRequestApproval(run, step, {
      storage: context.approvalStorage,
      resolveApprover: context.resolveApprover,
      getWorkspaceMagicLinkSecret: context.getWorkspaceMagicLinkSecret,
      now: context.now,
    });
  }
  return { kind: "fail", reason: `Unsupported step type "${step.type}" at runtime` };
}

/** Apply a dispatcher's NextAction. Returns true when the advancement loop should stop. */
async function applyAction(
  context: RuntimeContext,
  run: StoredRun,
  action: NextAction,
): Promise<boolean> {
  switch (action.kind) {
    case "advance": {
      const patch: Partial<Pick<StoredRun, "status" | "currentStepId" | "captureScope">> = {
        currentStepId: action.next,
        status: action.next === null ? "completed" : "running",
      };
      if (action.capture) {
        patch.captureScope = { ...run.captureScope, [action.capture.name]: action.capture.value };
      }
      await context.storage.updateRun(run.id, patch);
      // If completed (next=null), stop the loop. Otherwise continue
      // advancing the next step in the same tick.
      return action.next === null;
    }
    case "pause_event": {
      await context.storage.createWait({
        runId: run.id,
        stepId: run.currentStepId ?? "unknown",
        eventType: action.eventType,
        matchPredicate: action.matchPredicate as Record<string, unknown> | null,
        timeoutAt: action.timeoutAt,
      });
      await context.storage.updateRun(run.id, { status: "waiting" });
      return true;
    }
    case "pause_timer": {
      await context.storage.createWait({
        runId: run.id,
        stepId: run.currentStepId ?? "unknown",
        eventType: TIMER_EVENT_TYPE,
        matchPredicate: null,
        timeoutAt: action.timeoutAt,
      });
      await context.storage.updateRun(run.id, { status: "waiting" });
      return true;
    }
    case "pause_approval": {
      // SLICE 10 PR 1 C4 — persist the approval row + flip run to
      // "waiting". approvalStorage is guaranteed present by the
      // dispatcher's pre-flight check (otherwise dispatchStep would
      // have returned a fail action).
      if (!context.approvalStorage) {
        await markRunFailed(context, run.id, "pause_approval: approvalStorage missing at applyAction (should be unreachable)");
        return true;
      }
      const approvalId = await context.approvalStorage.createApproval({
        runId: run.id,
        stepId: run.currentStepId ?? "unknown",
        orgId: run.orgId,
        approverType: action.approverType,
        approverUserId: action.approverUserId,
        contextTitle: action.contextTitle,
        contextSummary: action.contextSummary,
        contextPreview: action.contextPreview,
        contextMetadata: action.contextMetadata,
        timeoutAction: action.timeoutAction,
        timeoutAt: action.timeoutAt,
        magicLinkTokenHash: action.magicLinkTokenHash,
        magicLinkExpiresAt: action.magicLinkExpiresAt,
      });
      await context.storage.updateRun(run.id, { status: "waiting" });

      // SLICE 10 PR 2 C1 — best-effort notification. Failure logs +
      // swallows (L-22). The approval row exists; admin can find it
      // via dashboard polling regardless.
      if (context.notifyApprover && context.loadApproverContact) {
        const baseUrl = context.appBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        try {
          const contact = await context.loadApproverContact(run.orgId, action.approverUserId);
          if (contact) {
            await context.notifyApprover({
              approval: {
                id: approvalId,
                orgId: run.orgId,
                contextTitle: action.contextTitle,
                contextSummary: action.contextSummary,
                contextPreview: action.contextPreview,
                timeoutAt: action.timeoutAt,
              },
              approver: contact,
              appBaseUrl: baseUrl,
              magicLinkToken: action.magicLinkToken,
            });
          } else {
            // eslint-disable-next-line no-console
            console.warn("[pause_approval] approver contact not resolvable; notification skipped", {
              runId: run.id,
              approvalId,
              approverUserId: action.approverUserId,
            });
          }
        } catch (err) {
          // notifyApprover is supposed to swallow internally; this catches
          // anything escaping (e.g., loadApproverContact throws).
          // eslint-disable-next-line no-console
          console.warn("[pause_approval] notification path threw; swallowing", {
            runId: run.id,
            approvalId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return true;
    }
    case "fail": {
      await markRunFailed(context, run.id, action.reason);
      return true;
    }
  }
}

async function advanceTo(
  context: RuntimeContext,
  runId: string,
  nextStepId: string | null,
): Promise<void> {
  await context.storage.updateRun(runId, {
    currentStepId: nextStepId,
    status: nextStepId === null ? "completed" : "running",
  });
}

async function markRunFailed(
  context: RuntimeContext,
  runId: string,
  reason: string,
): Promise<void> {
  const run = await context.storage.getRun(runId);
  const failureCount = run ? { ...run.failureCount, _fatal: (run.failureCount._fatal ?? 0) + 1 } : { _fatal: 1 };
  await context.storage.updateRun(runId, {
    status: "failed",
    currentStepId: null,
    failureCount,
  });
  // Emit to the event log for observability. Log-only per G-6 —
  // NOT added to SeldonEvent. Agencies read these via the admin
  // surface (PR 3).
  await context.storage.appendEventLog({
    orgId: run?.orgId ?? "unknown",
    eventType: "workflow.run_failed",
    payload: { runId, reason },
  });
}
