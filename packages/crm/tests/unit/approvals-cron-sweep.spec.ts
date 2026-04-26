// Tests for the approval timeout cron sweep.
// SLICE 10 PR 2 C2 per audit §5 + Max's gate-resolution prompt.
//
// Behavior:
//   - Iterates findTimedOutPendingApprovals (PR 1 C3 storage method)
//   - For each timed-out approval: routes per its timeoutAction
//     (abort | auto_approve) → calls runtimeResumeApproval with the
//     appropriate resolution
//   - Idempotency: status state machine on the storage layer prevents
//     double-processing; sweeps that race with manual resolution see
//     resumed=false and no-op
//   - Error isolation: one approval failure doesn't block the rest
//     of the batch
//   - wait_indefinitely approvals never appear in the sweep (timeoutAt
//     is null in the DB)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runApprovalTimeoutSweep } from "../../src/lib/workflow/approvals/cron-sweep";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import type { ApprovalResolution } from "../../src/lib/workflow/step-dispatchers/request-approval";

const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000010";
const APPROVER = "00000000-0000-4000-8000-000000000aaa";
const NOW = new Date("2026-04-25T12:00:00Z");

const baseInput = (over: { timeoutAction: "abort" | "auto_approve" | "wait_indefinitely"; timeoutAt: Date | null }) => ({
  runId: RUN,
  stepId: "needs_review",
  orgId: ORG,
  approverType: "operator" as const,
  approverUserId: APPROVER,
  contextTitle: "x",
  contextSummary: "y",
  contextPreview: null,
  contextMetadata: null,
  timeoutAction: over.timeoutAction,
  timeoutAt: over.timeoutAt,
  magicLinkTokenHash: null,
  magicLinkExpiresAt: null,
});

describe("runApprovalTimeoutSweep — happy paths", () => {
  test("abort timeout → resumes with timed_out_abort", async () => {
    const storage = makeInMemoryApprovalStorage();
    await storage.createApproval(baseInput({ timeoutAction: "abort", timeoutAt: new Date("2026-01-01") }));
    const calls: ApprovalResolution[] = [];
    const result = await runApprovalTimeoutSweep({
      storage,
      now: NOW,
      batchLimit: 100,
      resumeApproval: async ({ resolution }) => {
        calls.push(resolution);
        return { resumed: true, runId: RUN };
      },
    });
    assert.equal(result.scanned, 1);
    assert.equal(result.resolved, 1);
    assert.deepEqual(calls, ["timed_out_abort"]);
  });

  test("auto_approve timeout → resumes with timed_out_auto_approve", async () => {
    const storage = makeInMemoryApprovalStorage();
    await storage.createApproval(baseInput({ timeoutAction: "auto_approve", timeoutAt: new Date("2026-01-01") }));
    const calls: ApprovalResolution[] = [];
    await runApprovalTimeoutSweep({
      storage,
      now: NOW,
      batchLimit: 100,
      resumeApproval: async ({ resolution }) => {
        calls.push(resolution);
        return { resumed: true, runId: RUN };
      },
    });
    assert.deepEqual(calls, ["timed_out_auto_approve"]);
  });

  test("wait_indefinitely (timeoutAt=null) is NEVER swept", async () => {
    const storage = makeInMemoryApprovalStorage();
    await storage.createApproval(baseInput({ timeoutAction: "wait_indefinitely", timeoutAt: null }));
    let invoked = false;
    const result = await runApprovalTimeoutSweep({
      storage,
      now: new Date("2099-01-01"),
      batchLimit: 100,
      resumeApproval: async () => {
        invoked = true;
        return { resumed: true, runId: RUN };
      },
    });
    assert.equal(invoked, false);
    assert.equal(result.scanned, 0);
  });

  test("future-due approval is NOT swept (timeoutAt > now)", async () => {
    const storage = makeInMemoryApprovalStorage();
    await storage.createApproval(baseInput({ timeoutAction: "abort", timeoutAt: new Date("2099-01-01") }));
    let invoked = false;
    await runApprovalTimeoutSweep({
      storage,
      now: NOW,
      batchLimit: 100,
      resumeApproval: async () => {
        invoked = true;
        return { resumed: true, runId: RUN };
      },
    });
    assert.equal(invoked, false);
  });
});

describe("runApprovalTimeoutSweep — idempotency + race", () => {
  test("CAS lost (resumed=false) counted as raced, not failed", async () => {
    const storage = makeInMemoryApprovalStorage();
    await storage.createApproval(baseInput({ timeoutAction: "abort", timeoutAt: new Date("2026-01-01") }));
    const result = await runApprovalTimeoutSweep({
      storage,
      now: NOW,
      batchLimit: 100,
      resumeApproval: async () => ({ resumed: false, runId: null }),
    });
    assert.equal(result.scanned, 1);
    assert.equal(result.resolved, 0);
    assert.equal(result.raced, 1);
    assert.equal(result.failed, 0);
  });

  test("multiple due approvals processed in batch", async () => {
    const storage = makeInMemoryApprovalStorage();
    for (let i = 0; i < 5; i++) {
      await storage.createApproval(baseInput({ timeoutAction: "abort", timeoutAt: new Date("2026-01-01") }));
    }
    let invocations = 0;
    const result = await runApprovalTimeoutSweep({
      storage,
      now: NOW,
      batchLimit: 100,
      resumeApproval: async () => {
        invocations += 1;
        return { resumed: true, runId: RUN };
      },
    });
    assert.equal(invocations, 5);
    assert.equal(result.scanned, 5);
    assert.equal(result.resolved, 5);
  });
});

describe("runApprovalTimeoutSweep — error isolation", () => {
  test("one approval throws → batch continues for the rest", async () => {
    const storage = makeInMemoryApprovalStorage();
    for (let i = 0; i < 3; i++) {
      await storage.createApproval(baseInput({ timeoutAction: "abort", timeoutAt: new Date("2026-01-01") }));
    }
    let calls = 0;
    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    try {
      const result = await runApprovalTimeoutSweep({
        storage,
        now: NOW,
        batchLimit: 100,
        resumeApproval: async () => {
          calls += 1;
          if (calls === 2) throw new Error("simulated failure");
          return { resumed: true, runId: RUN };
        },
      });
      assert.equal(result.scanned, 3);
      assert.equal(result.resolved, 2);
      assert.equal(result.failed, 1);
      assert.ok(warned, "expected console.warn for the failed approval");
    } finally {
      console.warn = originalWarn;
    }
  });
});
