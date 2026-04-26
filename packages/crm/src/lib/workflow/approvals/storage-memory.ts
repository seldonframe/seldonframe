// In-memory ApprovalStorage for unit tests + harness work.
// SLICE 10 PR 1 C3 per the workflow runtime's storage-memory pattern
// (parallel to packages/crm/tests/unit/workflow/storage-memory.ts).
//
// Production code uses DrizzleApprovalStorage; tests use this fake to
// avoid Postgres boot. The fake mirrors the storage interface exactly
// so a swap is invisible to the rest of the runtime.

import { randomUUID } from "node:crypto";

import type { WorkflowApproval } from "@/db/schema/workflow-approvals";

import type {
  ApprovalStorage,
  CreateApprovalInput,
  ResolveApprovalInput,
  ResolveApprovalResult,
} from "./types";

export function makeInMemoryApprovalStorage(): ApprovalStorage {
  const rows = new Map<string, WorkflowApproval>();
  // Monotonic counter so two same-millisecond inserts get distinct
  // createdAt timestamps. The Drizzle production impl gets per-row
  // timestamps from the database (gen via NOW() at insert), which is
  // sequentially-monotonic per session. The in-memory fake uses this
  // counter to match that behavior so test assertions on ordering
  // are deterministic.
  let lastCreatedAtMs = 0;

  return {
    async createApproval(input: CreateApprovalInput): Promise<string> {
      const id = randomUUID();
      const nowMs = Math.max(Date.now(), lastCreatedAtMs + 1);
      lastCreatedAtMs = nowMs;
      const row: WorkflowApproval = {
        id,
        runId: input.runId,
        stepId: input.stepId,
        orgId: input.orgId,
        approverType: input.approverType,
        approverUserId: input.approverUserId,
        status: "pending",
        contextTitle: input.contextTitle,
        contextSummary: input.contextSummary,
        contextPreview: input.contextPreview,
        contextMetadata: input.contextMetadata,
        timeoutAction: input.timeoutAction,
        timeoutAt: input.timeoutAt,
        resolvedAt: null,
        resolvedByUserId: null,
        resolutionComment: null,
        resolutionReason: null,
        overrideFlag: false,
        magicLinkTokenHash: input.magicLinkTokenHash,
        magicLinkExpiresAt: input.magicLinkExpiresAt,
        createdAt: new Date(nowMs),
      };
      rows.set(id, row);
      return id;
    },

    async getApprovalById(id: string): Promise<WorkflowApproval | null> {
      return rows.get(id) ?? null;
    },

    async listPendingApprovalsForOrg(orgId, opts) {
      const all = Array.from(rows.values()).filter((r) => r.orgId === orgId && r.status === "pending");
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? all.length;
      return all.slice(offset, offset + limit);
    },

    async resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
      const row = rows.get(input.approvalId);
      if (!row) return { claimed: false, approval: null };
      // CAS: only resolve if currently pending. Race losers + double-clicks land here.
      if (row.status !== "pending") {
        return { claimed: false, approval: row };
      }
      const updated: WorkflowApproval = {
        ...row,
        status: input.status,
        resolvedAt: input.now,
        resolvedByUserId: input.resolverUserId,
        resolutionComment: input.comment,
        resolutionReason: input.resolutionReason,
        overrideFlag: input.overrideFlag,
      };
      rows.set(input.approvalId, updated);
      return { claimed: true, approval: updated };
    },

    async findApprovalByMagicLinkHash(tokenHash, now) {
      for (const row of rows.values()) {
        if (row.magicLinkTokenHash !== tokenHash) continue;
        if (row.magicLinkExpiresAt === null) continue;
        if (row.magicLinkExpiresAt.getTime() <= now.getTime()) continue;
        return row;
      }
      return null;
    },

    async findTimedOutPendingApprovals(now) {
      return Array.from(rows.values()).filter(
        (r) => r.status === "pending" && r.timeoutAt !== null && r.timeoutAt.getTime() <= now.getTime(),
      );
    },
  };
}
