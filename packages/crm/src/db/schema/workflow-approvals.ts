// workflow_approvals — one row per active or resolved request_approval
// pause. SLICE 10 PR 1 C2 per audit §4 + Max's gate-resolution prompt.
//
// Distinct from workflow_waits (per G-10-9, Path B): the two concerns
// differ enough that forcing them into one table requires nullable
// columns on both sides and a discriminator the runtime constantly
// switches on. Two clean tables with focused indexes are easier to
// reason about + easier to extend (e.g., approval pools post-launch
// won't touch workflow_waits).
//
// Status state machine (audit §4.1):
//
//                  pending
//                  /  |  \
//             approve reject timeout
//                /    |     |
//          approved rejected  ┌───────────────────────┐
//                             ▼                       ▼
//                      timed_out (reason:           timed_out (reason:
//                       "timed_out_abort")         "timed_out_auto_approve")
//
// Plus `cancelled` for the case where a run is cancelled while an
// approval is pending. Per Max's preference (audit §5.4) the row is
// kept (not cascade-deleted) for forensic/audit value.
//
// Idempotency (audit §4.2): concurrent approve/reject is contained
// via optimistic lock at the storage layer:
//   UPDATE workflow_approvals
//      SET status='approved', resolved_by_user_id=$X, resolved_at=NOW()
//    WHERE id=$Y AND status='pending' RETURNING *;
// Row count = 0 → loser; API returns 409.
//
// override_flag (G-10-7): true when the resolver is the org-owner
// using emergency unblock instead of the bound approver. Defense in
// depth: API enforces auth; flag captures the audit trail.

import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { workflowRuns } from "./workflow-runs";

// ---------------------------------------------------------------------
// Enum unions (TS-level; SQL stores as text — same convention as
// workflow_runs.status, workflow_waits.resumedReason, etc.).
// ---------------------------------------------------------------------

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "timed_out"
  | "cancelled";

export type ApprovalApproverType =
  | "operator"
  | "client_owner"
  | "user_id"; // schema-level only; v1 surfaces approver_unsupported_in_v1

export type ApprovalResolutionReason =
  | "approved"
  | "rejected"
  | "timed_out_abort"
  | "timed_out_auto_approve"
  | "cancelled_with_run";

// ---------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------

export const workflowApprovals = pgTable(
  "workflow_approvals",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    // Run + step the approval belongs to.
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    // Workspace scope — denormalized from runs.org_id for index
    // efficiency on the org-wide pending-approvals query (avoids a
    // join through workflow_runs).
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),

    // Approver binding. approverUserId is null when approverType is
    // operator or client_owner without a specific user yet resolved
    // (the dispatcher snapshots the resolved user when notifying;
    // this column tracks "who specifically should approve" for the
    // notification path + the per-user pending-approvals query).
    approverType: text("approver_type").$type<ApprovalApproverType>().notNull(),
    approverUserId: uuid("approver_user_id"),

    // Status state machine cursor.
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),

    // Context payload snapshot — immutable from the moment of request.
    // Mirrors RequestApprovalStepSchema.context after interpolation
    // resolution. Caps enforced at validator time; DB-level we store
    // text without length checks (validator is the gate).
    contextTitle: text("context_title").notNull(),
    contextSummary: text("context_summary").notNull(),
    contextPreview: text("context_preview"),
    contextMetadata: jsonb("context_metadata").$type<Record<string, unknown>>(),

    // Timeout — denormalized from spec for cron sweep efficiency.
    // timeoutAt is null iff timeoutAction === "wait_indefinitely".
    timeoutAction: text("timeout_action").notNull(),
    timeoutAt: timestamp("timeout_at", { withTimezone: true }),

    // Resolution audit trail (G-10-6 — visible always).
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolutionComment: text("resolution_comment"),
    resolutionReason: text("resolution_reason").$type<ApprovalResolutionReason>(),
    // G-10-7 — true when org-owner used emergency unblock to resolve
    // an approval bound to a different approver. False otherwise.
    overrideFlag: boolean("override_flag").notNull().default(false),

    // Magic-link token (G-10-8). Stored as HMAC hash, not the raw
    // token; the raw token is delivered via email + verified by
    // re-hashing at /api/v1/approvals/magic-link/[token]/resolve.
    // Single-use enforced via the same optimistic lock as the admin
    // surface (status='pending' → resolution invalidates).
    magicLinkTokenHash: text("magic_link_token_hash"),
    magicLinkExpiresAt: timestamp("magic_link_expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Pending approvals for a workspace (admin /agents/approvals
    // page in PR 2). Partial index keeps it tight as resolved rows
    // accumulate.
    index("workflow_approvals_org_pending_idx")
      .on(table.orgId)
      .where(sql`status = 'pending'`),
    // Per-user pending approvals (notification follow-ups + future
    // client portal). Partial index — only rows with a bound user
    // and pending status.
    index("workflow_approvals_user_pending_idx")
      .on(table.approverUserId)
      .where(sql`status = 'pending' AND approver_user_id IS NOT NULL`),
    // Cron timeout sweep (parallel to workflow_waits_timeout_unresolved_idx).
    index("workflow_approvals_timeout_pending_idx")
      .on(table.timeoutAt)
      .where(sql`status = 'pending' AND timeout_at IS NOT NULL`),
    // Per-run lookup (admin /agents/runs drawer + run cancellation).
    index("workflow_approvals_run_idx").on(table.runId),
    // Magic-link token verification — partial index only on rows with
    // a hash present (most rows in legacy operator/user_id flows
    // won't have a token).
    index("workflow_approvals_magic_link_idx")
      .on(table.magicLinkTokenHash)
      .where(sql`magic_link_token_hash IS NOT NULL`),
  ]
);

export type WorkflowApproval = typeof workflowApprovals.$inferSelect;
export type NewWorkflowApproval = typeof workflowApprovals.$inferInsert;
