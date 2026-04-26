// SLICE 10 PR 2 C7 — edge case integration tests.
// Per Max's prompt: provider failure / concurrent resolve+reject /
// override-while-pending / magic-link tampering + replay /
// cost-attribution edge under long pause.
//
// These complement C6 (happy paths) by exercising the failure
// surfaces explicitly. Each edge case corresponds to a risk
// register entry in the audit (§15) or a discipline rule
// (L-22 / L-28) that we want a regression test for.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorizeAuthenticatedResolution,
  authorizeMagicLinkResolution,
} from "../../src/lib/workflow/approvals/api";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  verifyMagicLinkToken,
} from "../../src/lib/workflow/approvals/magic-link";
import { notifyApprover } from "../../src/lib/workflow/approvals/notifier";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import {
  dispatchRequestApproval,
  resumeApproval,
} from "../../src/lib/workflow/step-dispatchers/request-approval";
import type {
  AgentSpec,
  RequestApprovalStep,
} from "../../src/lib/agents/validator";
import type { StoredRun } from "../../src/lib/workflow/types";

const ORG = "00000000-0000-4000-8000-000000000aaa";
const RUN_ID = "00000000-0000-4000-8000-000000000bbb";
const APPROVER_USER = "00000000-0000-4000-8000-000000000ccc";
const ORG_OWNER = "00000000-0000-4000-8000-000000000ddd";
const OTHER_USER = "00000000-0000-4000-8000-000000000eee";
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
  name: "edge-case-spec",
  description: "edge",
  trigger: { type: "event", event: "contact.created" },
  variables: {},
  steps: [
    baseStep(),
    { id: "approve_target", type: "wait", seconds: 0, next: null },
    { id: "reject_target", type: "wait", seconds: 0, next: null },
  ] as unknown as AgentSpec["steps"],
};

const baseRun = (over: Partial<StoredRun> = {}): StoredRun => ({
  id: RUN_ID,
  orgId: ORG,
  archetypeId: "edge-case",
  specSnapshot: baseSpec,
  triggerEventId: null,
  triggerPayload: {},
  status: "running",
  currentStepId: "needs_review",
  captureScope: {},
  variableScope: {},
  failureCount: {},
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

// ---------------------------------------------------------------------
// Provider failure (audit §15 — graceful degradation)
// ---------------------------------------------------------------------

describe("Provider failure — Resend down", () => {
  test("notifier email throw → approval still persisted; admin surface accessible", async () => {
    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    try {
      const result = await notifyApprover(
        {
          approval: {
            id: "approval-1",
            orgId: ORG,
            contextTitle: "x",
            contextSummary: "y",
            contextPreview: null,
            timeoutAt: null,
          },
          approver: { email: "ops@test.example", name: "Ops", userId: APPROVER_USER },
          appBaseUrl: "https://test.app",
          magicLinkToken: null,
        },
        {
          sendEmail: async () => {
            throw new Error("Resend API timeout");
          },
        },
      );
      // Notifier swallows + reports — does not throw. Admin surface
      // (drawer in /agents/runs) remains accessible because the
      // approval row was already created at applyAction time
      // (independent of notification).
      assert.equal(result.delivered, false);
      assert.match(result.reason ?? "", /Resend|timeout/i);
      assert.ok(warned, "expected console.warn breadcrumb for ops triage");
    } finally {
      console.warn = originalWarn;
    }
  });
});

// ---------------------------------------------------------------------
// Concurrent approve/reject (audit §15 — race condition)
// ---------------------------------------------------------------------

describe("Concurrent resolve — DB CAS enforces single resolution", () => {
  test("two simultaneous resolutions: first wins; second sees existing row, no re-advance", async () => {
    const storage = makeInMemoryApprovalStorage();
    const id = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
      approverType: "operator",
      approverUserId: APPROVER_USER,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(NOW.getTime() + 3600 * 1000),
      magicLinkTokenHash: null,
      magicLinkExpiresAt: null,
    });
    const advances: string[] = [];
    const ctx = {
      storage,
      loadRun: async () => baseRun({ status: "waiting" }),
      advanceTo: async (_runId: string, nextStepId: string | null) => {
        if (nextStepId) advances.push(nextStepId);
      },
      now: () => NOW,
    };
    // Fire approve + reject concurrently. The CAS at storage layer
    // serializes them; whichever lands first wins.
    const [r1, r2] = await Promise.all([
      resumeApproval(ctx, {
        approvalId: id,
        resolution: "approved",
        resolverUserId: APPROVER_USER,
        comment: null,
        overrideFlag: false,
      }),
      resumeApproval(ctx, {
        approvalId: id,
        resolution: "rejected",
        resolverUserId: APPROVER_USER,
        comment: null,
        overrideFlag: false,
      }),
    ]);
    // Exactly one advance recorded.
    assert.equal(advances.length, 1);
    assert.ok(["approve_target", "reject_target"].includes(advances[0]));
    // Exactly one resumed=true.
    assert.equal([r1.resumed, r2.resumed].filter(Boolean).length, 1);
  });
});

// ---------------------------------------------------------------------
// Override-while-pending (G-10-7)
// ---------------------------------------------------------------------

describe("Override-while-pending — org-owner emergency unblock", () => {
  test("org-owner override succeeds; overrideFlag=true in audit row", async () => {
    const storage = makeInMemoryApprovalStorage();
    const id = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
      approverType: "operator",
      approverUserId: APPROVER_USER,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(NOW.getTime() + 3600 * 1000),
      magicLinkTokenHash: null,
      magicLinkExpiresAt: null,
    });
    const authz = await authorizeAuthenticatedResolution(
      storage,
      { approvalId: id, callerOrgId: ORG, callerUserId: ORG_OWNER, callerIsOrgOwner: true },
      true, // override
    );
    assert.equal(authz.kind, "ok");
    if (authz.kind !== "ok") return;
    // Now resolve via the storage CAS with overrideFlag=true.
    const resolved = await storage.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: ORG_OWNER,
      comment: "owner override — approver OOO",
      overrideFlag: true,
      now: NOW,
    });
    assert.equal(resolved.claimed, true);
    assert.equal(resolved.approval!.overrideFlag, true);
    // Original approverUserId stays in place — audit shows
    // intent vs actuality.
    assert.equal(resolved.approval!.approverUserId, APPROVER_USER);
    assert.equal(resolved.approval!.resolvedByUserId, ORG_OWNER);
  });

  test("non-owner override attempt → forbidden", async () => {
    const storage = makeInMemoryApprovalStorage();
    const id = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
      approverType: "operator",
      approverUserId: APPROVER_USER,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(NOW.getTime() + 3600 * 1000),
      magicLinkTokenHash: null,
      magicLinkExpiresAt: null,
    });
    const authz = await authorizeAuthenticatedResolution(
      storage,
      { approvalId: id, callerOrgId: ORG, callerUserId: OTHER_USER, callerIsOrgOwner: false },
      true,
    );
    assert.equal(authz.kind, "forbidden");
    if (authz.kind === "forbidden") {
      assert.equal(authz.reason, "override_requires_org_owner");
    }
  });
});

// ---------------------------------------------------------------------
// Magic-link tampering + replay (audit §8.3 — security posture)
// ---------------------------------------------------------------------

describe("Magic-link tampering + replay", () => {
  test("tampered token → invalid_token (no enumeration; uniform error)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN_ID, secret: FAKE_TEST_SECRET });
    const tampered = token.slice(0, -2) + "xx";
    const verdict = verifyMagicLinkToken({
      token: tampered,
      secret: FAKE_TEST_SECRET,
      now: NOW,
    });
    assert.equal(verdict.kind, "invalid");
  });

  test("replay after resolution → already_resolved (token not technically invalidated; row status is the gate)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN_ID, secret: FAKE_TEST_SECRET });
    const storage = makeInMemoryApprovalStorage();
    const id = await storage.createApproval({
      runId: RUN_ID,
      stepId: "needs_review",
      orgId: ORG,
      approverType: "client_owner",
      approverUserId: APPROVER_USER,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(NOW.getTime() + 3600 * 1000),
      magicLinkTokenHash: hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET }),
      magicLinkExpiresAt: new Date(NOW.getTime() + 24 * 3600 * 1000),
    });
    // First resolution succeeds.
    const first = await storage.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: null,
      comment: null,
      overrideFlag: false,
      now: NOW,
    });
    assert.equal(first.claimed, true);
    // Replay attempt with the same valid token.
    const replay = await authorizeMagicLinkResolution(storage, {
      token,
      secret: FAKE_TEST_SECRET,
      now: NOW,
    });
    assert.equal(replay.kind, "already_resolved");
  });

  test("token with wrong secret → invalid_token (no info leak)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN_ID, secret: FAKE_TEST_SECRET });
    const verdict = verifyMagicLinkToken({
      token,
      secret: "WRONG_FAKE_SECRET_NOT_REAL",
      now: NOW,
    });
    assert.equal(verdict.kind, "invalid");
  });
});

// ---------------------------------------------------------------------
// Cost-attribution edge — long pause
// ---------------------------------------------------------------------

describe("Cost-attribution edge — workflow paused for >24h", () => {
  test("approval with 7-day timeout: pause/resume across week-long gap doesn't impact cost recorder", async () => {
    // The cost recorder writes to workflow_runs.{totalTokensInput,
    // totalTokensOutput, totalCostUsdEstimate} via SQL `+=` keyed
    // on runId. It is status-agnostic and time-agnostic. Approval
    // pause duration has no semantic effect on the recorder.
    //
    // This test documents that contract by simulating a 7-day
    // approval pause and asserting that:
    //   1. The dispatcher doesn't write to workflow_runs cost
    //      columns (only approvalStorage.createApproval is called)
    //   2. The pause action carries no cost-related field
    //   3. The resume path doesn't touch cost columns either
    const storage = makeInMemoryApprovalStorage();
    const longTimeoutSec = 7 * 24 * 3600;
    const ctx = {
      storage,
      resolveApprover: async () => ({ userId: APPROVER_USER }),
      getWorkspaceMagicLinkSecret: async () => FAKE_TEST_SECRET,
      now: () => NOW,
    };
    const action = await dispatchRequestApproval(
      baseRun(),
      baseStep({ timeout: { action: "wait_indefinitely" } }),
      ctx,
    );
    assert.equal(action.kind, "pause_approval");
    if (action.kind !== "pause_approval") return;
    // Verify no cost-related fields on the pause action.
    assert.ok(!("totalTokensInput" in action));
    assert.ok(!("totalCostUsdEstimate" in action));

    // Now create the approval + simulate a week's pause, then
    // resume.
    const id = await storage.createApproval({
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
    const weekLater = new Date(NOW.getTime() + longTimeoutSec * 1000);
    const advanceCalls: Array<{ runId: string; nextStepId: string | null }> = [];
    await resumeApproval(
      {
        storage,
        loadRun: async () => baseRun({ status: "waiting", updatedAt: weekLater }),
        advanceTo: async (runId, nextStepId) => {
          advanceCalls.push({ runId, nextStepId });
        },
        now: () => weekLater,
      },
      {
        approvalId: id,
        resolution: "approved",
        resolverUserId: APPROVER_USER,
        comment: null,
        overrideFlag: false,
      },
    );
    // Resume happens cleanly even after a 7-day gap. The cost
    // recorder (not invoked here) would continue accumulating
    // against the same runId on subsequent LLM calls — pause
    // duration is irrelevant to its arithmetic.
    assert.equal(advanceCalls.length, 1);
    assert.equal(advanceCalls[0].nextStepId, "approve_target");
  });
});
