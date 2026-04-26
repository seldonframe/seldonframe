// Cron timeout sweep for the request_approval primitive.
// SLICE 10 PR 2 C2 per audit §5 + Max's gate-resolution prompt.
//
// Iterates pending approvals whose timeout_at has fired and routes
// each to the resume path with the appropriate timeout resolution:
//
//   timeout_action="abort"        → timed_out_abort        → on_reject
//   timeout_action="auto_approve" → timed_out_auto_approve → on_approve
//   timeout_action="wait_indefinitely" → never appears here (timeout_at is null)
//
// CAS at the storage layer prevents double-processing: if an approver
// resolves between the sweep's findTimedOutPendingApprovals and the
// resumeApproval call, the resume sees status != 'pending' and
// returns resumed=false. The sweep counts those as "raced" — not
// failures.
//
// Error isolation: one approval failing (DB error, runtime exception)
// is logged + counted but doesn't block the rest of the batch.
//
// Wired into the existing /api/cron/workflow-tick route alongside
// the wait sweep, subscription tick, and scheduled-trigger tick.

import type { ApprovalStorage } from "./types";
import type {
  ApprovalResolution,
  ResumeApprovalInput,
} from "../step-dispatchers/request-approval";

export type ApprovalSweepInput = {
  storage: ApprovalStorage;
  now: Date;
  batchLimit: number;
  /** Mirrors the runtimeResumeApproval signature; injected so the
   * sweep is unit-testable without spinning up the runtime. */
  resumeApproval: (input: ResumeApprovalInput) => Promise<{ resumed: boolean; runId: string | null }>;
};

export type ApprovalSweepResult = {
  scanned: number;
  resolved: number;
  /** CAS-lost (a parallel resolver landed first). Not a failure. */
  raced: number;
  /** Resume threw or returned an unexpected error. */
  failed: number;
};

export async function runApprovalTimeoutSweep(
  input: ApprovalSweepInput,
): Promise<ApprovalSweepResult> {
  const due = await input.storage.findTimedOutPendingApprovals(input.now);
  const batch = due.slice(0, input.batchLimit);

  const result: ApprovalSweepResult = {
    scanned: batch.length,
    resolved: 0,
    raced: 0,
    failed: 0,
  };

  for (const approval of batch) {
    const resolution: ApprovalResolution =
      approval.timeoutAction === "auto_approve"
        ? "timed_out_auto_approve"
        : "timed_out_abort";
    try {
      const r = await input.resumeApproval({
        approvalId: approval.id,
        resolution,
        resolverUserId: null,
        comment: null,
        overrideFlag: false,
      });
      if (r.resumed) {
        result.resolved += 1;
      } else {
        result.raced += 1;
      }
    } catch (err) {
      result.failed += 1;
      // eslint-disable-next-line no-console
      console.warn("[approval-cron-sweep] resume failed", {
        approvalId: approval.id,
        runId: approval.runId,
        timeoutAction: approval.timeoutAction,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
