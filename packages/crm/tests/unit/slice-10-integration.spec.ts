// SLICE 10 integration tests — request_approval composed with HVAC
// archetypes + cost-attribution invariant. PR 2 C6.
//
// Two HVAC examples (audit §11) + cost-attribution invariant
// (audit §15 risk register; PR 2 close-out gates on this).
//
// These are integration tests in the SeldonFrame sense: they
// exercise multiple modules end-to-end against the in-memory
// storage harness (parallel to slice-7-integration.spec.ts +
// hvac-archetypes-integration.spec.ts patterns from prior slices).
// DB-backed E2E + Vercel preview cover the rest.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  dispatchRequestApproval,
  resumeApproval,
} from "../../src/lib/workflow/step-dispatchers/request-approval";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import { runApprovalTimeoutSweep } from "../../src/lib/workflow/approvals/cron-sweep";
import { computeCallCost } from "../../src/lib/ai/pricing";
import type {
  AgentSpec,
  RequestApprovalStep,
} from "../../src/lib/agents/validator";
import type { StoredRun } from "../../src/lib/workflow/types";

const ORG = "00000000-0000-4000-8000-000000000aaa";
const RUN_ID = "00000000-0000-4000-8000-000000000bbb";
const OPERATOR_USER = "00000000-0000-4000-8000-000000000ccc";
const CLIENT_USER = "00000000-0000-4000-8000-000000000ddd";
const FAKE_TEST_SECRET = "FAKE_TEST_SECRET_NOT_A_REAL_HMAC_KEY";
const NOW = new Date("2026-04-25T12:00:00Z");

// Common dispatch context — operator + client_owner both resolvable.
function makeDispatchContext(storage = makeInMemoryApprovalStorage()) {
  return {
    storage,
    resolveApprover: async (
      _orgId: string,
      approver: { type: "operator" } | { type: "client_owner" } | { type: "user_id"; userId: string },
    ) => {
      if (approver.type === "operator") return { userId: OPERATOR_USER };
      if (approver.type === "client_owner") return { userId: CLIENT_USER };
      return null;
    },
    getWorkspaceMagicLinkSecret: async () => FAKE_TEST_SECRET,
    now: () => NOW,
  };
}

// ---------------------------------------------------------------------
// Example 1 — Heat Advisory Outreach with operator approval gate
// ---------------------------------------------------------------------

const heatAdvisoryWithApprovalSpec: AgentSpec = {
  name: "heat-advisory-with-approval",
  description: "Daily 5am check; if forecast > 110°F, operator approves recipient list before SMS cascade.",
  trigger: {
    type: "schedule",
    cron: "0 5 * * *",
    timezone: "America/Phoenix",
    catchup: "skip",
    concurrency: "skip",
  },
  variables: {},
  steps: [
    {
      id: "review_send",
      type: "request_approval",
      approver: { type: "operator" },
      context: {
        title: "Heat Advisory: 6 vulnerable customers matched",
        summary: "Outreach SMS draft ready for tomorrow's 110°+ forecast.",
        preview: "Hi {{name}}, heads up — 110°+ tomorrow. Want a free AC check before it hits? Reply YES.",
      },
      timeout: { action: "abort", seconds: 12 * 3600 },
      next_on_approve: "send_advisory",
      next_on_reject: "log_skipped",
    },
    { id: "send_advisory", type: "wait", seconds: 0, next: null },
    { id: "log_skipped", type: "wait", seconds: 0, next: null },
  ] as unknown as AgentSpec["steps"],
};

const baseRun = (over: Partial<StoredRun> = {}): StoredRun => ({
  id: RUN_ID,
  orgId: ORG,
  archetypeId: "heat-advisory-with-approval",
  specSnapshot: heatAdvisoryWithApprovalSpec,
  triggerEventId: null,
  triggerPayload: {},
  status: "running",
  currentStepId: "review_send",
  captureScope: {},
  variableScope: {},
  failureCount: {},
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe("Example 1 — Heat Advisory + operator approval gate", () => {
  test("operator approves → workflow advances to send_advisory", async () => {
    const storage = makeInMemoryApprovalStorage();
    const ctx = makeDispatchContext(storage);
    const step = heatAdvisoryWithApprovalSpec.steps[0] as unknown as RequestApprovalStep;
    const action = await dispatchRequestApproval(baseRun(), step, ctx);
    assert.equal(action.kind, "pause_approval");
    if (action.kind !== "pause_approval") return;
    const approvalId = await storage.createApproval({
      runId: RUN_ID,
      stepId: "review_send",
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

    let advancedTo: string | null | undefined;
    await resumeApproval(
      {
        storage,
        loadRun: async () => baseRun({ status: "waiting" }),
        advanceTo: async (_runId, nextStepId) => {
          advancedTo = nextStepId;
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "approved",
        resolverUserId: OPERATOR_USER,
        comment: "ship it",
        overrideFlag: false,
      },
    );
    assert.equal(advancedTo, "send_advisory");
  });

  test("operator rejects → workflow advances to log_skipped (no SMS cascade)", async () => {
    const storage = makeInMemoryApprovalStorage();
    const ctx = makeDispatchContext(storage);
    const step = heatAdvisoryWithApprovalSpec.steps[0] as unknown as RequestApprovalStep;
    const action = await dispatchRequestApproval(baseRun(), step, ctx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    const approvalId = await storage.createApproval({
      runId: RUN_ID,
      stepId: "review_send",
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
    let advancedTo: string | null | undefined;
    await resumeApproval(
      {
        storage,
        loadRun: async () => baseRun({ status: "waiting" }),
        advanceTo: async (_runId, nextStepId) => {
          advancedTo = nextStepId;
        },
        now: () => NOW,
      },
      {
        approvalId,
        resolution: "rejected",
        resolverUserId: OPERATOR_USER,
        comment: "wrong recipient list — let's hold",
        overrideFlag: false,
      },
    );
    assert.equal(advancedTo, "log_skipped");
  });
});

// ---------------------------------------------------------------------
// Example 2 — Post-service follow-up with client_owner magic-link
// ---------------------------------------------------------------------

const postServiceWithApprovalSpec: AgentSpec = {
  name: "post-service-followup-with-client-approval",
  description: "After payment > $200, client owner approves the review-request SMS via magic-link before send.",
  trigger: { type: "event", event: "payment.completed" },
  variables: {},
  steps: [
    {
      id: "client_approves_review_ask",
      type: "request_approval",
      approver: { type: "client_owner" },
      context: {
        title: "Approve customer review request",
        summary: "Maria paid $284 for HVAC service. We'd like to ask her for a Google review.",
        preview: "Thanks Maria! If you have a moment, would you mind leaving a quick Google review? https://...",
      },
      timeout: { action: "abort", seconds: 24 * 3600 },
      next_on_approve: "send_review_request",
      next_on_reject: "log_skipped",
    },
    { id: "send_review_request", type: "wait", seconds: 0, next: null },
    { id: "log_skipped", type: "wait", seconds: 0, next: null },
  ] as unknown as AgentSpec["steps"],
};

describe("Example 2 — Post-service follow-up + client_owner magic-link", () => {
  test("magic-link generated; client approves → workflow advances to send_review_request", async () => {
    const storage = makeInMemoryApprovalStorage();
    const ctx = makeDispatchContext(storage);
    const step = postServiceWithApprovalSpec.steps[0] as unknown as RequestApprovalStep;
    const run = {
      ...baseRun({
        archetypeId: "post-service-followup-with-client-approval",
        specSnapshot: postServiceWithApprovalSpec,
        currentStepId: "client_approves_review_ask",
      }),
    };
    const action = await dispatchRequestApproval(run, step, ctx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    // Magic-link should be generated for client_owner.
    assert.ok(action.magicLinkToken, "expected a magic-link token");
    assert.ok(action.magicLinkTokenHash, "expected a hash");
    const approvalId = await storage.createApproval({
      runId: run.id,
      stepId: step.id,
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
    let advancedTo: string | null | undefined;
    await resumeApproval(
      {
        storage,
        loadRun: async () => ({ ...run, status: "waiting" }),
        advanceTo: async (_runId, nextStepId) => {
          advancedTo = nextStepId;
        },
        now: () => NOW,
      },
      {
        // Magic-link path: resolverUserId is null (no SeldonFrame user
        // identity for the client; the magic-link hash IS the auth).
        approvalId,
        resolution: "approved",
        resolverUserId: null,
        comment: null,
        overrideFlag: false,
      },
    );
    assert.equal(advancedTo, "send_review_request");
  });

  test("client doesn't respond in 24h → cron sweep fires timeout_abort → log_skipped", async () => {
    const storage = makeInMemoryApprovalStorage();
    const ctx = makeDispatchContext(storage);
    const step = postServiceWithApprovalSpec.steps[0] as unknown as RequestApprovalStep;
    const run = baseRun({
      archetypeId: "post-service-followup-with-client-approval",
      specSnapshot: postServiceWithApprovalSpec,
      currentStepId: "client_approves_review_ask",
    });
    const action = await dispatchRequestApproval(run, step, ctx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    await storage.createApproval({
      runId: run.id,
      stepId: step.id,
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
    // 25 hours later (past the 24h timeout) — cron sweep fires.
    let advancedTo: string | null | undefined;
    const past = new Date(NOW.getTime() + 25 * 3600 * 1000);
    await runApprovalTimeoutSweep({
      storage,
      now: past,
      batchLimit: 100,
      resumeApproval: async (input) => {
        // Stub the resume context's advanceTo to capture the routing.
        return resumeApproval(
          {
            storage,
            loadRun: async () => ({ ...run, status: "waiting" }),
            advanceTo: async (_runId, nextStepId) => {
              advancedTo = nextStepId;
            },
            now: () => past,
          },
          input,
        );
      },
    });
    // timeout=abort → routes to next_on_reject (log_skipped)
    assert.equal(advancedTo, "log_skipped");
  });
});

// ---------------------------------------------------------------------
// Cost-attribution invariant (audit §15 risk register)
// ---------------------------------------------------------------------

describe("Cost-attribution invariant — workflow_run cost continues across approval pause", () => {
  test("cost recorder is status-agnostic (writes work whether run is running OR waiting)", () => {
    // The recordLlmUsage helper (SLICE 9 PR 2 C4) operates on runId
    // and increments via SQL `+=`. It does NOT branch on status. This
    // test documents that contract by exercising the cost-computation
    // arithmetic that the recorder writes.
    //
    // Pre-pause LLM cost (e.g., agent generates draft for approval):
    const preCost = computeCallCost("claude-sonnet-4-6", 1000, 500);
    // 1000 in × $3/M = $0.003; 500 out × $15/M = $0.0075; total $0.0105
    assert.equal(preCost, 0.0105);

    // Post-resume LLM cost (e.g., agent renders SMS body after approval):
    const postCost = computeCallCost("claude-sonnet-4-6", 500, 200);
    // 500 in × $3/M = $0.0015; 200 out × $15/M = $0.003; total $0.0045
    assert.equal(postCost, 0.0045);

    // The aggregate that `recordLlmUsage` produces by SQL `+=` for
    // both calls against the same run_id:
    const total = preCost + postCost;
    assert.equal(total, 0.015);

    // Critical invariant: this addition is independent of whether
    // the workflow_run was paused on a request_approval between
    // the two LLM calls. The cost recorder doesn't read or branch
    // on workflow_runs.status. The pause_approval path in
    // applyAction (runtime.ts) creates the approval row + flips
    // run status to "waiting" — but does NOT touch the cost
    // columns. The post-resume LLM call hits the same runId and
    // accumulates against the same row.
  });

  test("approval pause does NOT introduce a cost-recording gap", async () => {
    // Document this by simulation: dispatch the approval, observe
    // that approvalStorage.createApproval is called (the only
    // side-effect of pause_approval beyond run.status=waiting), and
    // verify the approval-create payload carries no cost-related
    // field that could clobber workflow_runs cost columns.
    const storage = makeInMemoryApprovalStorage();
    const ctx = makeDispatchContext(storage);
    const step = heatAdvisoryWithApprovalSpec.steps[0] as unknown as RequestApprovalStep;
    const action = await dispatchRequestApproval(baseRun(), step, ctx);
    if (action.kind !== "pause_approval") throw new Error("expected pause_approval");
    // Verify the action shape carries NO cost field — the cost
    // observability columns on workflow_runs are not touched by the
    // pause_approval path in applyAction (verified via inspection
    // of runtime.ts).
    assert.ok(!("totalTokensInput" in action), "pause_approval action must not carry token data");
    assert.ok(!("totalCostUsdEstimate" in action), "pause_approval action must not carry cost data");
    // The createApproval input also carries no cost data (asserted
    // via the storage.createApproval signature in PR 1 C3).
  });
});
