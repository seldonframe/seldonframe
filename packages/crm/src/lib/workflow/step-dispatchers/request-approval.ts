// request_approval step dispatcher + resume path.
// SLICE 10 PR 1 C4 per audit §5 + Max's gate-resolution prompt.
//
// The 9th step type (8 prior dispatchers in this directory). Pauses
// the workflow and creates a workflow_approvals row; the runtime
// applies the pause by setting the run status to "waiting" + leaving
// the approval row pending until resolution.
//
// Mirrors await_event's pause-and-resume shape (audit §1.3) but with
// human-action semantics instead of event-arrival:
//
//   await_event:    resume cause = matching event arrives
//   request_approval: resume cause = approver clicks button OR cron
//                     fires timeout (which maps to abort/auto_approve
//                     per the timeout discriminator)
//
// For client_owner approvers, the dispatcher generates an HMAC-signed
// magic-link token (G-10-8) and persists its hash in the approval row
// so the customer-facing route can re-verify on click. The raw token
// is returned on the action so the runtime / notifier can include it
// in the email body.
//
// L-17 hypothesis B (4th datapoint): orthogonal to existing
// dispatchers (no shared mutable state with branch / await_event /
// mcp_tool_call / etc.). Predicted 1.5-2.0x test/prod ratio.
//
// G-10-7 override flag: this dispatcher does NOT set overrideFlag —
// only the resolution path does (api/v1/approvals/[id]/override sets
// it true; the regular resolve API leaves it false). This file's
// concern is the create-pause; the override-related behavior lives
// in the API layer and the resumeApproval call.

import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  MAGIC_LINK_DEFAULT_TTL_SECONDS,
} from "../approvals/magic-link";
import type { ApprovalApproverType } from "@/db/schema/workflow-approvals";
import type {
  ApprovalApprover,
  RequestApprovalStep,
} from "../../agents/validator";
import type { ApprovalStorage, ResolveApprovalInput } from "../approvals/types";
import type { StoredRun } from "../types";

// ---------------------------------------------------------------------
// Interpolation helper (parallel to await-event.ts pattern)
// ---------------------------------------------------------------------

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveString(value: string, run: StoredRun): string {
  return value.replace(INTERPOLATION_RE, (raw, bodyRaw) => {
    const body = String(bodyRaw).trim();
    const [varName, ...pathSegs] = body.split(".");
    if (Object.prototype.hasOwnProperty.call(run.variableScope, varName)) {
      let current: unknown = run.variableScope[varName];
      for (const seg of pathSegs) {
        if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[seg];
        } else {
          return raw;
        }
      }
      return String(current);
    }
    if (Object.prototype.hasOwnProperty.call(run.captureScope, varName)) {
      let current: unknown = run.captureScope[varName];
      for (const seg of pathSegs) {
        if (current && typeof current === "object" && seg in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[seg];
        } else {
          return raw;
        }
      }
      return String(current);
    }
    return raw;
  });
}

// ---------------------------------------------------------------------
// Public NextAction shape — `pause_approval` variant
// ---------------------------------------------------------------------

export type PauseApprovalAction = {
  kind: "pause_approval";
  approverType: ApprovalApproverType;
  approverUserId: string | null;
  contextTitle: string;
  contextSummary: string;
  contextPreview: string | null;
  contextMetadata: Record<string, unknown> | null;
  timeoutAction: "abort" | "auto_approve" | "wait_indefinitely";
  /** Null iff timeoutAction === "wait_indefinitely". */
  timeoutAt: Date | null;
  onApproveNext: string | null;
  onRejectNext: string | null;
  /** Raw token for the email body (client_owner only); null otherwise. */
  magicLinkToken: string | null;
  /** Hash for DB lookup (client_owner only). */
  magicLinkTokenHash: string | null;
  magicLinkExpiresAt: Date | null;
};

export type DispatchApprovalResult =
  | PauseApprovalAction
  | { kind: "fail"; reason: string };

// ---------------------------------------------------------------------
// Dispatch context
// ---------------------------------------------------------------------

export type ResolveApproverFn = (
  orgId: string,
  approver: ApprovalApprover,
) => Promise<{ userId: string | null } | null>;

export type ApprovalDispatchContext = {
  storage: ApprovalStorage;
  /** Resolves the approver discriminator into a userId (or null userId for unbound types). Returns null if resolution fails. */
  resolveApprover: ResolveApproverFn;
  /** Returns the workspace's HMAC-signing secret for magic-link tokens. */
  getWorkspaceMagicLinkSecret: (orgId: string) => Promise<string>;
  now: () => Date;
};

// ---------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------

export async function dispatchRequestApproval(
  run: StoredRun,
  step: RequestApprovalStep,
  ctx: ApprovalDispatchContext,
): Promise<DispatchApprovalResult> {
  // Resolve approver to a user record (operator → org.ownerId,
  // client_owner → org.client_contact_user_id, user_id → direct lookup).
  const approver = await ctx.resolveApprover(run.orgId, step.approver);
  if (!approver) {
    return {
      kind: "fail",
      reason: `request_approval: approver "${step.approver.type}" could not be resolved for org ${run.orgId}`,
    };
  }

  // Compute timeoutAt per the discriminated union.
  const timeoutAt =
    step.timeout.action === "wait_indefinitely"
      ? null
      : new Date(ctx.now().getTime() + step.timeout.seconds * 1000);

  // Resolve interpolations in context strings.
  const contextTitle = resolveString(step.context.title, run);
  const contextSummary = resolveString(step.context.summary, run);
  const contextPreview =
    step.context.preview !== undefined ? resolveString(step.context.preview, run) : null;
  const contextMetadata = step.context.metadata ?? null;

  // For client_owner approvers, generate the magic-link token + hash.
  // Other approver types resolve via the admin surface (no token
  // needed; auth via session).
  let magicLinkToken: string | null = null;
  let magicLinkTokenHash: string | null = null;
  let magicLinkExpiresAt: Date | null = null;
  if (step.approver.type === "client_owner") {
    const secret = await ctx.getWorkspaceMagicLinkSecret(run.orgId);
    // Generate a placeholder approval id for the token payload; the
    // real id comes from createApproval. Since the runtime applies
    // the pause action right after this returns (via applyAction in
    // runtime.ts), we use a UUID v4 placeholder here and rotate it
    // server-side via createApproval-then-update if needed. For
    // simplicity in PR 1, the token includes a runId-bound nonce
    // and the storage lookup uses the hash, not the token's
    // approval id — see hashMagicLinkToken in storage-drizzle.
    magicLinkToken = generateMagicLinkToken({
      approvalId: run.id, // bind to runId; the API resolves to the actual approval row via hash lookup
      secret,
      now: ctx.now(),
    });
    magicLinkTokenHash = hashMagicLinkToken({ token: magicLinkToken, secret });
    magicLinkExpiresAt = new Date(ctx.now().getTime() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000);
  }

  return {
    kind: "pause_approval",
    approverType: step.approver.type,
    approverUserId: approver.userId,
    contextTitle,
    contextSummary,
    contextPreview,
    contextMetadata,
    timeoutAction: step.timeout.action,
    timeoutAt,
    onApproveNext: step.next_on_approve,
    onRejectNext: step.next_on_reject,
    magicLinkToken,
    magicLinkTokenHash,
    magicLinkExpiresAt,
  };
}

// ---------------------------------------------------------------------
// Resume path
// ---------------------------------------------------------------------

export type ApprovalResolution =
  | "approved"
  | "rejected"
  | "timed_out_abort"
  | "timed_out_auto_approve"
  | "cancelled_with_run";

export type ResumeApprovalInput = {
  approvalId: string;
  resolution: ApprovalResolution;
  resolverUserId: string | null;
  comment: string | null;
  overrideFlag: boolean;
};

export type ApprovalResumeContext = {
  storage: ApprovalStorage;
  /** Run loader; resume path uses it to read run state + spec snapshot. */
  loadRun: (runId: string) => Promise<StoredRun | null>;
  /** Advances the run to the next step. Provided by the runtime so the
   * resume path doesn't import runtime.ts (avoids circular dep). */
  advanceTo: (runId: string, nextStepId: string | null) => Promise<void>;
  now: () => Date;
};

export async function resumeApproval(
  ctx: ApprovalResumeContext,
  input: ResumeApprovalInput,
): Promise<{ resumed: boolean; runId: string | null }> {
  // Map resolution → status + resolutionReason for the storage layer.
  const { status, resolutionReason } = mapResolution(input.resolution);

  const claim: ResolveApprovalInput = {
    approvalId: input.approvalId,
    status,
    resolutionReason,
    resolverUserId: input.resolverUserId,
    comment: input.comment,
    overrideFlag: input.overrideFlag,
    now: ctx.now(),
  };
  const result = await ctx.storage.resolveApproval(claim);
  if (!result.claimed) {
    // CAS lost — another resolution beat us. No-op.
    return { resumed: false, runId: result.approval?.runId ?? null };
  }
  const approval = result.approval!;

  // Defense in depth: if the run is already terminal (cancelled,
  // failed, completed), don't try to advance — the approval row's
  // resolution still recorded for audit. This handles the case where
  // a run is cancelled while an approval is pending; the approval
  // gets a "cancelled_with_run" resolution (via cron / API) but we
  // never re-advance the terminal run.
  const run = await ctx.loadRun(approval.runId);
  if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return { resumed: true, runId: approval.runId };
  }

  // Locate the request_approval step in the run's spec snapshot.
  const step = findStepInSpec(run, approval.stepId);
  if (!step) {
    // Spec drift — should be impossible since spec_snapshot is
    // immutable per run, but defensive: don't crash.
    return { resumed: true, runId: approval.runId };
  }

  // Route to next_on_approve or next_on_reject per resolution.
  const nextStepId =
    input.resolution === "approved" || input.resolution === "timed_out_auto_approve"
      ? step.next_on_approve
      : step.next_on_reject;

  await ctx.advanceTo(approval.runId, nextStepId);
  return { resumed: true, runId: approval.runId };
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

function mapResolution(resolution: ApprovalResolution): Pick<
  ResolveApprovalInput,
  "status" | "resolutionReason"
> {
  switch (resolution) {
    case "approved":
      return { status: "approved", resolutionReason: "approved" };
    case "rejected":
      return { status: "rejected", resolutionReason: "rejected" };
    case "timed_out_abort":
      return { status: "timed_out", resolutionReason: "timed_out_abort" };
    case "timed_out_auto_approve":
      return { status: "timed_out", resolutionReason: "timed_out_auto_approve" };
    case "cancelled_with_run":
      return { status: "cancelled", resolutionReason: "cancelled_with_run" };
  }
}

function findStepInSpec(
  run: StoredRun,
  stepId: string,
): RequestApprovalStep | null {
  const step = run.specSnapshot.steps.find((s) => s.id === stepId);
  if (!step || step.type !== "request_approval") return null;
  return step as RequestApprovalStep;
}
