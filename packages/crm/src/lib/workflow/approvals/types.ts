// Type surface for the approvals storage layer.
// SLICE 10 PR 1 C3 per audit §4 + Max's gate-resolution prompt.

import type {
  ApprovalApproverType,
  ApprovalResolutionReason,
  ApprovalStatus,
  WorkflowApproval,
} from "@/db/schema/workflow-approvals";

export type CreateApprovalInput = {
  runId: string;
  stepId: string;
  orgId: string;
  approverType: ApprovalApproverType;
  /** Resolved user id for the approver, or null if not yet resolved (operator/client_owner without user lookup). */
  approverUserId: string | null;
  contextTitle: string;
  contextSummary: string;
  contextPreview: string | null;
  contextMetadata: Record<string, unknown> | null;
  timeoutAction: "abort" | "auto_approve" | "wait_indefinitely";
  /** Null iff timeoutAction === "wait_indefinitely". */
  timeoutAt: Date | null;
  /** SHA-256 hash of magic-link token; null when no magic-link is required (operator/user_id approvers). */
  magicLinkTokenHash: string | null;
  /** Expiration of the magic-link; null when no magic-link is required. */
  magicLinkExpiresAt: Date | null;
};

export type ResolveApprovalInput = {
  approvalId: string;
  /** Maps to status: approved/rejected/timed_out/cancelled (see resolutionReason). */
  status: Exclude<ApprovalStatus, "pending">;
  resolutionReason: ApprovalResolutionReason;
  resolverUserId: string | null;
  comment: string | null;
  /** Set true only when an org-owner is resolving on someone else's behalf (G-10-7). */
  overrideFlag: boolean;
  now: Date;
};

export type ResolveApprovalResult = {
  /** True if THIS call won the CAS race. False = someone else resolved first; loser. */
  claimed: boolean;
  /** The resolved (or pre-existing if claimed=false) row, or null if approval id was unknown. */
  approval: WorkflowApproval | null;
};

export type ApprovalStorage = {
  createApproval(input: CreateApprovalInput): Promise<string>;
  getApprovalById(id: string): Promise<WorkflowApproval | null>;
  /**
   * Workspace-scoped pending approvals list, sorted createdAt DESC.
   * Optional limit + offset for future pagination.
   */
  listPendingApprovalsForOrg(
    orgId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<WorkflowApproval[]>;
  /**
   * Atomic CAS: only succeeds when the row's current status is 'pending'.
   * Returns claimed=false when the CAS lost (another resolution already
   * landed). Caller distinguishes claimed vs lost to emit 200 vs 409.
   */
  resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalResult>;
  /**
   * Magic-link path lookup. Returns the approval whose stored hash
   * matches AND whose magic_link_expires_at is in the future. Returns
   * null on no-match — caller distinguishes "wrong/expired token"
   * uniformly to defeat user enumeration.
   */
  findApprovalByMagicLinkHash(tokenHash: string, now: Date): Promise<WorkflowApproval | null>;
  /**
   * Cron timeout sweep helper (PR 2 cron lands later; storage method
   * ships now to keep the interface complete). Returns pending
   * approvals with timeoutAt <= now.
   */
  findTimedOutPendingApprovals(now: Date): Promise<WorkflowApproval[]>;
};
