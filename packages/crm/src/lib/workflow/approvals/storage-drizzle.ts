// Drizzle-backed ApprovalStorage. SLICE 10 PR 1 C3.
// Mirrors lib/workflow/storage-drizzle.ts for the workflow_runs +
// workflow_waits tables; same CAS discipline (audit §4.2).
//
// `resolveApproval` is the sole transition out of 'pending'. The
// UPDATE's `WHERE id=$Y AND status='pending'` clause is the atomic
// gate; row count = 0 means another resolution path won. Caller
// distinguishes claimed vs lost to emit 200 vs 409.

import { and, asc, desc, eq, isNotNull, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { workflowApprovals } from "@/db/schema/workflow-approvals";
import type { WorkflowApproval } from "@/db/schema/workflow-approvals";

import type {
  ApprovalStorage,
  CreateApprovalInput,
  ResolveApprovalInput,
  ResolveApprovalResult,
} from "./types";

export class DrizzleApprovalStorage implements ApprovalStorage {
  constructor(private readonly db: DbClient) {}

  async createApproval(input: CreateApprovalInput): Promise<string> {
    const [row] = await this.db
      .insert(workflowApprovals)
      .values({
        runId: input.runId,
        stepId: input.stepId,
        orgId: input.orgId,
        approverType: input.approverType,
        approverUserId: input.approverUserId,
        contextTitle: input.contextTitle,
        contextSummary: input.contextSummary,
        contextPreview: input.contextPreview,
        contextMetadata: input.contextMetadata,
        timeoutAction: input.timeoutAction,
        timeoutAt: input.timeoutAt,
        magicLinkTokenHash: input.magicLinkTokenHash,
        magicLinkExpiresAt: input.magicLinkExpiresAt,
      })
      .returning({ id: workflowApprovals.id });
    return row.id;
  }

  async getApprovalById(id: string): Promise<WorkflowApproval | null> {
    const rows = await this.db
      .select()
      .from(workflowApprovals)
      .where(eq(workflowApprovals.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async listPendingApprovalsForOrg(
    orgId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<WorkflowApproval[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const rows = await this.db
      .select()
      .from(workflowApprovals)
      .where(and(eq(workflowApprovals.orgId, orgId), eq(workflowApprovals.status, "pending")))
      .orderBy(desc(workflowApprovals.createdAt))
      .limit(limit)
      .offset(offset);
    return rows;
  }

  async resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
    // CAS: only succeed when current status is 'pending'.
    const claimed = await this.db
      .update(workflowApprovals)
      .set({
        status: input.status,
        resolvedAt: input.now,
        resolvedByUserId: input.resolverUserId,
        resolutionComment: input.comment,
        resolutionReason: input.resolutionReason,
        overrideFlag: input.overrideFlag,
      })
      .where(and(eq(workflowApprovals.id, input.approvalId), eq(workflowApprovals.status, "pending")))
      .returning();

    if (claimed.length > 0) {
      return { claimed: true, approval: claimed[0] };
    }
    // CAS lost: load the row to return its current resolution state.
    const existing = await this.getApprovalById(input.approvalId);
    return { claimed: false, approval: existing };
  }

  async findApprovalByMagicLinkHash(tokenHash: string, now: Date): Promise<WorkflowApproval | null> {
    // Hash equality + not-yet-expired. Status check is NOT done here
    // (the resolveApproval CAS is the gate); a magic link to an
    // already-resolved approval still gets a row back so the API can
    // emit a clear "this approval was already resolved" message
    // instead of a generic "invalid token" (which would be confusing
    // for a legitimate token used after resolution).
    const rows = await this.db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.magicLinkTokenHash, tokenHash),
          isNotNull(workflowApprovals.magicLinkExpiresAt),
          // expires_at > now (i.e., not yet expired)
          sql`${workflowApprovals.magicLinkExpiresAt} > ${now}`,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findTimedOutPendingApprovals(now: Date): Promise<WorkflowApproval[]> {
    const rows = await this.db
      .select()
      .from(workflowApprovals)
      .where(
        and(
          eq(workflowApprovals.status, "pending"),
          isNotNull(workflowApprovals.timeoutAt),
          lte(workflowApprovals.timeoutAt, now),
        ),
      )
      .orderBy(asc(workflowApprovals.timeoutAt));
    return rows;
  }
}
