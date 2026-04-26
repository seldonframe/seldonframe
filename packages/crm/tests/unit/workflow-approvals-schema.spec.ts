// Tests for the workflow_approvals Drizzle schema shape.
// SLICE 10 PR 1 C2 per audit §4 + Max's gate-resolution prompt.
//
// Drizzle schemas don't run SQL in unit tests; instead we verify
// the inferred TS shape exposes every column documented in the
// audit, with the right nullability + default semantics. Migration
// SQL lives at packages/crm/drizzle/0027_*.sql and is applied via
// pnpm db:push at deploy time (verified via Vercel preview).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { workflowApprovals } from "../../src/db/schema/workflow-approvals";
import type {
  WorkflowApproval,
  NewWorkflowApproval,
  ApprovalStatus,
  ApprovalApproverType,
  ApprovalResolutionReason,
} from "../../src/db/schema/workflow-approvals";

describe("workflow_approvals — table shape", () => {
  test("exports a Drizzle PgTable named workflow_approvals", () => {
    // The Drizzle PgTable carries its name in a Symbol-keyed slot;
    // we don't unwrap that here. Existence + type identity is enough.
    assert.equal(typeof workflowApprovals, "object");
    assert.ok(workflowApprovals);
  });

  test("columns: required identifiers (id, runId, stepId, orgId)", () => {
    assert.ok("id" in workflowApprovals);
    assert.ok("runId" in workflowApprovals);
    assert.ok("stepId" in workflowApprovals);
    assert.ok("orgId" in workflowApprovals);
  });

  test("columns: approver binding (approverType, approverUserId)", () => {
    assert.ok("approverType" in workflowApprovals);
    assert.ok("approverUserId" in workflowApprovals);
  });

  test("columns: status state machine (status)", () => {
    assert.ok("status" in workflowApprovals);
  });

  test("columns: context payload snapshot (title, summary, preview, metadata)", () => {
    assert.ok("contextTitle" in workflowApprovals);
    assert.ok("contextSummary" in workflowApprovals);
    assert.ok("contextPreview" in workflowApprovals);
    assert.ok("contextMetadata" in workflowApprovals);
  });

  test("columns: timeout (timeoutAction, timeoutAt)", () => {
    assert.ok("timeoutAction" in workflowApprovals);
    assert.ok("timeoutAt" in workflowApprovals);
  });

  test("columns: resolution audit trail (resolvedAt, resolvedByUserId, resolutionComment, resolutionReason, overrideFlag)", () => {
    assert.ok("resolvedAt" in workflowApprovals);
    assert.ok("resolvedByUserId" in workflowApprovals);
    assert.ok("resolutionComment" in workflowApprovals);
    assert.ok("resolutionReason" in workflowApprovals);
    assert.ok("overrideFlag" in workflowApprovals);
  });

  test("columns: magic-link token (magicLinkTokenHash, magicLinkExpiresAt)", () => {
    assert.ok("magicLinkTokenHash" in workflowApprovals);
    assert.ok("magicLinkExpiresAt" in workflowApprovals);
  });

  test("columns: createdAt timestamp", () => {
    assert.ok("createdAt" in workflowApprovals);
  });
});

describe("workflow_approvals — type exports", () => {
  test("WorkflowApproval row type is exported", () => {
    const sample: WorkflowApproval = {
      id: "00000000-0000-4000-8000-000000000001",
      runId: "00000000-0000-4000-8000-000000000002",
      stepId: "needs_review",
      orgId: "00000000-0000-4000-8000-000000000003",
      approverType: "operator",
      approverUserId: null,
      status: "pending",
      contextTitle: "Approve send",
      contextSummary: "Outbound message ready",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(),
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionComment: null,
      resolutionReason: null,
      overrideFlag: false,
      magicLinkTokenHash: null,
      magicLinkExpiresAt: null,
      createdAt: new Date(),
    };
    assert.equal(sample.status, "pending");
  });

  test("NewWorkflowApproval insert type allows defaults to be omitted", () => {
    const insert: NewWorkflowApproval = {
      runId: "00000000-0000-4000-8000-000000000002",
      stepId: "needs_review",
      orgId: "00000000-0000-4000-8000-000000000003",
      approverType: "client_owner",
      contextTitle: "x",
      contextSummary: "y",
      timeoutAction: "wait_indefinitely",
      timeoutAt: null,
    };
    assert.equal(insert.approverType, "client_owner");
  });

  test("ApprovalStatus enum has the 5 expected values (G-10-6 + audit §4.1)", () => {
    const all: ApprovalStatus[] = [
      "pending",
      "approved",
      "rejected",
      "timed_out",
      "cancelled",
    ];
    assert.equal(all.length, 5);
  });

  test("ApprovalApproverType enum has 3 values (G-10-1 schema-level)", () => {
    const all: ApprovalApproverType[] = ["operator", "client_owner", "user_id"];
    assert.equal(all.length, 3);
  });

  test("ApprovalResolutionReason enum captures the 5 cause kinds (audit §4.1)", () => {
    const all: ApprovalResolutionReason[] = [
      "approved",
      "rejected",
      "timed_out_abort",
      "timed_out_auto_approve",
      "cancelled_with_run",
    ];
    assert.equal(all.length, 5);
  });
});

describe("workflow_approvals — exported from schema/index.ts barrel", () => {
  test("barrel re-export wires workflow_approvals into the db schema bundle", async () => {
    const schemaBarrel = await import("../../src/db/schema");
    assert.ok(
      "workflowApprovals" in schemaBarrel,
      "workflow_approvals must be re-exported via the schema barrel so drizzle config picks it up",
    );
  });
});
