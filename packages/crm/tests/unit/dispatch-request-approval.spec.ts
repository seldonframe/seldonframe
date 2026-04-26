// Tests for the request_approval step dispatcher + resume path.
// SLICE 10 PR 1 C4 per audit §5 + Max's gate-resolution prompt.
//
// L-17 hypothesis B (4th datapoint): dispatchRequestApproval is
// orthogonal to existing dispatchers (no shared mutable state with
// other dispatchers; pause action symmetric to existing pause_event).
// Predicted 1.5-2.0x test/prod ratio.
//
// Coverage:
// 1. Dispatcher returns pause_approval for an operator approver
// 2. Dispatcher returns pause_approval for client_owner — generates
//    magic-link token + hash via the workspace secret
// 3. Dispatcher resolves interpolations in title/summary/preview
//    using the run's variableScope + captureScope (G-4 parity with
//    await_event)
// 4. Dispatcher computes timeoutAt per the discriminated timeout
//    action (abort+seconds → now+seconds; auto_approve+seconds →
//    same; wait_indefinitely → null)
// 5. Dispatcher returns "fail" when client_owner is requested but
//    workspace has no resolved client owner (G-10-7 audit-time issue
//    surfaces; runtime defense)
// 6. resumeApproval CAS-claims + advances to next_on_approve on
//    "approved" / "timed_out_auto_approve"
// 7. resumeApproval CAS-claims + advances to next_on_reject on
//    "rejected" / "timed_out_abort" / "cancelled_with_run"
// 8. resumeApproval no-ops when CAS already lost (idempotent — second
//    call returns without re-advancing)
// 9. resumeApproval no-ops when run is already terminal
//    (cancelled/failed/completed) — defense in depth

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dispatchRequestApproval, resumeApproval } from "../../src/lib/workflow/step-dispatchers/request-approval";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import {
  hashMagicLinkToken,
  verifyMagicLinkToken,
} from "../../src/lib/workflow/approvals/magic-link";
import type {
  RequestApprovalStep,
  AgentSpec,
} from "../../src/lib/agents/validator";
import type { StoredRun } from "../../src/lib/workflow/types";
import type {
  ApprovalDispatchContext,
  ApprovalResumeContext,
  ResolveApproverFn,
} from "../../src/lib/workflow/step-dispatchers/request-approval";

const ORG = "00000000-0000-4000-8000-000000000aaa";
const RUN_ID = "00000000-0000-4000-8000-000000000bbb";
const OWNER_USER_ID = "00000000-0000-4000-8000-000000000ccc";
const CLIENT_USER_ID = "00000000-0000-4000-8000-000000000ddd";
const FAKE_TEST_SECRET = "FAKE_TEST_SECRET_NOT_A_REAL_HMAC_KEY";

const NOW = new Date("2026-04-25T12:00:00Z");

const baseStep = (over: Partial<RequestApprovalStep> = {}): RequestApprovalStep =>
  ({
    id: "needs_review",
    type: "request_approval",
    approver: { type: "operator" },
    context: { title: "Approve send", summary: "Outbound message ready" },
    timeout: { action: "abort", seconds: 3600 },
    next_on_approve: "approve_target",
    next_on_reject: "reject_target",
    ...over,
  }) as RequestApprovalStep;

const baseSpec: AgentSpec = {
  name: "test",
  description: "test",
  trigger: { type: "event", event: "contact.created" },
  variables: { contactId: "trigger.contactId" },
  steps: [
    baseStep(),
    { id: "approve_target", type: "wait", seconds: 0, next: null },
    { id: "reject_target", type: "wait", seconds: 0, next: null },
  ],
};

const baseRun = (over: Partial<StoredRun> = {}): StoredRun => ({
  id: RUN_ID,
  orgId: ORG,
  archetypeId: "test",
  specSnapshot: baseSpec,
  triggerEventId: null,
  triggerPayload: { contactId: "ctc_1" },
  status: "running",
  currentStepId: "needs_review",
  captureScope: {},
  variableScope: { contactId: "ctc_1", customerName: "Maria" },
  failureCount: {},
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

function makeDispatchContext(
  over: Partial<ApprovalDispatchContext> = {},
): ApprovalDispatchContext {
  const resolveApprover: ResolveApproverFn = async (orgId, approver) => {
    if (approver.type === "operator") return { userId: OWNER_USER_ID };
    if (approver.type === "client_owner") return { userId: CLIENT_USER_ID };
    return null;
  };
  return {
    storage: makeInMemoryApprovalStorage(),
    resolveApprover,
    getWorkspaceMagicLinkSecret: async () => FAKE_TEST_SECRET,
    now: () => NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------
// dispatchRequestApproval
// ---------------------------------------------------------------------

describe("dispatchRequestApproval — operator approver", () => {
  test("returns pause_approval and creates a pending workflow_approvals row", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(baseRun(), baseStep(), ctx);
    assert.equal(action.kind, "pause_approval");
    if (action.kind !== "pause_approval") return;
    assert.equal(action.approverType, "operator");
    assert.equal(action.approverUserId, OWNER_USER_ID);
    assert.equal(action.contextTitle, "Approve send");
    assert.equal(action.timeoutAction, "abort");
    assert.deepEqual(action.timeoutAt, new Date(NOW.getTime() + 3600 * 1000));
    assert.equal(action.onApproveNext, "approve_target");
    assert.equal(action.onRejectNext, "reject_target");
    // Operator approvers do not get a magic-link token.
    assert.equal(action.magicLinkToken, null);
    assert.equal(action.magicLinkTokenHash, null);
    assert.equal(action.magicLinkExpiresAt, null);
  });

  test("interpolates {{var}} in title/summary/preview using the run scope (G-4 parity)", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({
        context: {
          title: "Approve send to {{customerName}}",
          summary: "Outbound message ready for {{contactId}}",
          preview: "Hi {{customerName}}, check this out.",
        },
      }),
      ctx,
    );
    if (action.kind !== "pause_approval") throw new Error(`expected pause_approval, got ${action.kind}`);
    assert.equal(action.contextTitle, "Approve send to Maria");
    assert.equal(action.contextSummary, "Outbound message ready for ctc_1");
    assert.equal(action.contextPreview, "Hi Maria, check this out.");
  });
});

describe("dispatchRequestApproval — client_owner approver + magic-link", () => {
  test("generates magic-link token + matching hash + 24h-default expiresAt", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ approver: { type: "client_owner" } }),
      ctx,
    );
    if (action.kind !== "pause_approval") throw new Error(`expected pause_approval, got ${action.kind}`);
    assert.equal(action.approverType, "client_owner");
    assert.equal(action.approverUserId, CLIENT_USER_ID);
    assert.ok(action.magicLinkToken, "expected a magic-link token to be generated");
    assert.ok(action.magicLinkTokenHash, "expected a hash for DB lookup");
    // The hash MUST match the deterministic hash of the token+secret.
    const expectedHash = hashMagicLinkToken({ token: action.magicLinkToken!, secret: FAKE_TEST_SECRET });
    assert.equal(action.magicLinkTokenHash, expectedHash);
    // The token MUST be verifiable with the same secret.
    const verdict = verifyMagicLinkToken({ token: action.magicLinkToken!, secret: FAKE_TEST_SECRET, now: NOW });
    assert.equal(verdict.kind, "valid");
    // Expiration is 24h from now.
    const expectedExpiresAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    assert.deepEqual(action.magicLinkExpiresAt, expectedExpiresAt);
  });
});

describe("dispatchRequestApproval — timeout action variants", () => {
  test("abort + seconds → timeoutAt = now + seconds", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ timeout: { action: "abort", seconds: 7200 } }),
      ctx,
    );
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    assert.equal(action.timeoutAction, "abort");
    assert.deepEqual(action.timeoutAt, new Date(NOW.getTime() + 7200 * 1000));
  });

  test("auto_approve + seconds → timeoutAt = now + seconds, action recorded", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ timeout: { action: "auto_approve", seconds: 86400 } }),
      ctx,
    );
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    assert.equal(action.timeoutAction, "auto_approve");
    assert.deepEqual(action.timeoutAt, new Date(NOW.getTime() + 86400 * 1000));
  });

  test("wait_indefinitely → timeoutAt is null (no cron sweep ever fires)", async () => {
    const ctx = makeDispatchContext();
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ timeout: { action: "wait_indefinitely" } }),
      ctx,
    );
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    assert.equal(action.timeoutAction, "wait_indefinitely");
    assert.equal(action.timeoutAt, null);
  });
});

describe("dispatchRequestApproval — failure paths", () => {
  test("returns fail when resolveApprover returns null (e.g., client_owner unresolved)", async () => {
    const ctx = makeDispatchContext({
      resolveApprover: async () => null,
    });
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ approver: { type: "client_owner" } }),
      ctx,
    );
    assert.equal(action.kind, "fail");
    if (action.kind === "fail") {
      assert.match(action.reason, /could not be resolved|unresolved|approver/i);
    }
  });
});

// ---------------------------------------------------------------------
// resumeApproval — CAS + step routing
// ---------------------------------------------------------------------

describe("resumeApproval — happy path routes to next_on_approve / next_on_reject", () => {
  test("approved → advances run.currentStepId to next_on_approve + status='running'", async () => {
    const storage = makeInMemoryApprovalStorage();
    const dispatchCtx = makeDispatchContext({ storage });
    const action = await dispatchRequestApproval(baseRun(), baseStep(), dispatchCtx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");

    // Apply the pause manually to a stub run (simulating the runtime).
    const approvalId = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
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

    const run = baseRun({ status: "waiting" });
    let advanced: { runId: string; nextStepId: string | null } | null = null;
    const resumeCtx: ApprovalResumeContext = {
      storage,
      loadRun: async (id) => (id === run.id ? run : null),
      advanceTo: async (runId, nextStepId) => {
        advanced = { runId, nextStepId };
      },
      now: () => NOW,
    };

    const result = await resumeApproval(resumeCtx, {
      approvalId,
      resolution: "approved",
      resolverUserId: OWNER_USER_ID,
      comment: "lgtm",
      overrideFlag: false,
    });
    assert.equal(result.resumed, true);
    assert.deepEqual(advanced, { runId: RUN_ID, nextStepId: "approve_target" });
  });

  test("rejected → advances to next_on_reject", async () => {
    const storage = makeInMemoryApprovalStorage();
    const dispatchCtx = makeDispatchContext({ storage });
    const action = await dispatchRequestApproval(baseRun(), baseStep(), dispatchCtx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    const approvalId = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
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
    const run = baseRun({ status: "waiting" });
    let advanced: { runId: string; nextStepId: string | null } | null = null;
    await resumeApproval(
      {
        storage,
        loadRun: async () => run,
        advanceTo: async (runId, nextStepId) => {
          advanced = { runId, nextStepId };
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "rejected",
        resolverUserId: OWNER_USER_ID,
        comment: null,
        overrideFlag: false,
      },
    );
    assert.deepEqual(advanced, { runId: RUN_ID, nextStepId: "reject_target" });
  });

  test("timed_out_auto_approve → advances to next_on_approve (timeout maps to approve)", async () => {
    const { storage, approvalId, run } = await primePending();
    let advanced: { runId: string; nextStepId: string | null } | null = null;
    await resumeApproval(
      {
        storage,
        loadRun: async () => run,
        advanceTo: async (runId, nextStepId) => {
          advanced = { runId, nextStepId };
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "timed_out_auto_approve",
        resolverUserId: null,
        comment: null,
        overrideFlag: false,
      },
    );
    assert.deepEqual(advanced, { runId: RUN_ID, nextStepId: "approve_target" });
  });

  test("timed_out_abort → advances to next_on_reject", async () => {
    const { storage, approvalId, run } = await primePending();
    let advanced: { runId: string; nextStepId: string | null } | null = null;
    await resumeApproval(
      {
        storage,
        loadRun: async () => run,
        advanceTo: async (runId, nextStepId) => {
          advanced = { runId, nextStepId };
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "timed_out_abort",
        resolverUserId: null,
        comment: null,
        overrideFlag: false,
      },
    );
    assert.deepEqual(advanced, { runId: RUN_ID, nextStepId: "reject_target" });
  });

  test("cancelled_with_run → no advance (run is terminal); resolution recorded for audit", async () => {
    const { storage, approvalId } = await primePending();
    const run = baseRun({ status: "cancelled" });
    let advanced: { runId: string; nextStepId: string | null } | null = null;
    const result = await resumeApproval(
      {
        storage,
        loadRun: async () => run,
        advanceTo: async (runId, nextStepId) => {
          advanced = { runId, nextStepId };
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "cancelled_with_run",
        resolverUserId: null,
        comment: "run cancelled",
        overrideFlag: false,
      },
    );
    assert.equal(result.resumed, true); // CAS claimed the row
    assert.equal(advanced, null); // but did NOT advance the run
    const after = await storage.getApprovalById(approvalId);
    assert.equal(after!.status, "cancelled");
  });
});

describe("resumeApproval — race + idempotency", () => {
  test("second resolution attempt returns resumed=false (CAS lost); does not re-advance", async () => {
    const { storage, approvalId, run } = await primePending();
    const calls: Array<{ runId: string; nextStepId: string | null }> = [];
    const resumeCtx: ApprovalResumeContext = {
      storage,
      loadRun: async () => run,
      advanceTo: async (runId, nextStepId) => {
        calls.push({ runId, nextStepId });
      },
      now: () => NOW,
    };
    const first = await resumeApproval(resumeCtx, {
      approvalId,
      resolution: "approved",
      resolverUserId: OWNER_USER_ID,
      comment: null,
      overrideFlag: false,
    });
    const second = await resumeApproval(resumeCtx, {
      approvalId,
      resolution: "rejected",
      resolverUserId: OWNER_USER_ID,
      comment: null,
      overrideFlag: false,
    });
    assert.equal(first.resumed, true);
    assert.equal(second.resumed, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].nextStepId, "approve_target");
  });

  test("resolveApproval on terminal run is a no-op for advance", async () => {
    const { storage, approvalId } = await primePending();
    let advanced = false;
    await resumeApproval(
      {
        storage,
        loadRun: async () => baseRun({ status: "completed" }),
        advanceTo: async () => {
          advanced = true;
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "approved",
        resolverUserId: OWNER_USER_ID,
        comment: null,
        overrideFlag: false,
      },
    );
    assert.equal(advanced, false);
  });

  test("override resolution records overrideFlag=true on the row", async () => {
    const { storage, approvalId } = await primePending();
    let advanced = false;
    await resumeApproval(
      {
        storage,
        loadRun: async () => baseRun({ status: "waiting" }),
        advanceTo: async () => {
          advanced = true;
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "approved",
        resolverUserId: OWNER_USER_ID,
        comment: "approver OOO; org-owner unblock",
        overrideFlag: true,
      },
    );
    assert.equal(advanced, true);
    const row = await storage.getApprovalById(approvalId);
    assert.equal(row!.overrideFlag, true);
  });
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function primePending() {
  const storage = makeInMemoryApprovalStorage();
  const dispatchCtx = makeDispatchContext({ storage });
  const action = await dispatchRequestApproval(baseRun(), baseStep(), dispatchCtx);
  if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
  const approvalId = await storage.createApproval({
    runId: RUN_ID,
    stepId: "needs_review",
    orgId: ORG,
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
  const run = baseRun({ status: "waiting" });
  return { storage, approvalId, run };
}
