// Tests for the ApprovalStorage interface (in-memory impl).
// SLICE 10 PR 1 C3 per audit §4 + Max's gate-resolution prompt.
//
// The in-memory impl is the spec for the storage interface — both
// the Drizzle impl + future test harnesses must produce identical
// observable behavior. Production Drizzle impl is verified via
// preview deploys (the SLICE 6/7/8/9 pattern).
//
// Coverage:
//   - createApproval round-trips (in → getApprovalById)
//   - listPendingApprovalsForOrg sorting + filtering + pagination
//   - resolveApproval CAS happy path
//   - resolveApproval CAS lost (concurrent resolve) returns claimed=false
//     with the existing row
//   - resolveApproval on missing id returns claimed=false + null
//   - override path sets overrideFlag=true in audit trail (G-10-7)
//   - findApprovalByMagicLinkHash hits valid (not-yet-expired) tokens,
//     misses expired ones, misses absent ones
//   - findTimedOutPendingApprovals returns past-due pending only

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import type { CreateApprovalInput } from "../../src/lib/workflow/approvals/types";

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const RUN_1 = "00000000-0000-4000-8000-000000000010";
const USER_OWNER = "00000000-0000-4000-8000-000000000aaa";
const USER_OTHER = "00000000-0000-4000-8000-000000000bbb";

function baseInput(over: Partial<CreateApprovalInput> = {}): CreateApprovalInput {
  return {
    runId: RUN_1,
    stepId: "needs_review",
    orgId: ORG_A,
    approverType: "operator",
    approverUserId: null,
    contextTitle: "Approve send",
    contextSummary: "Outbound message ready",
    contextPreview: null,
    contextMetadata: null,
    timeoutAction: "abort",
    timeoutAt: new Date("2026-04-26T00:00:00Z"),
    magicLinkTokenHash: null,
    magicLinkExpiresAt: null,
    ...over,
  };
}

describe("createApproval + getApprovalById — round-trip", () => {
  test("created row is retrievable by id with status=pending + override=false", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const row = await store.getApprovalById(id);
    assert.ok(row);
    assert.equal(row!.status, "pending");
    assert.equal(row!.overrideFlag, false);
    assert.equal(row!.contextTitle, "Approve send");
    assert.equal(row!.runId, RUN_1);
  });

  test("getApprovalById returns null for unknown id", async () => {
    const store = makeInMemoryApprovalStorage();
    const row = await store.getApprovalById("00000000-0000-4000-8000-00000000ffff");
    assert.equal(row, null);
  });
});

describe("listPendingApprovalsForOrg — workspace scoping + sort + pagination", () => {
  test("scoped to org; only pending; sorted createdAt DESC", async () => {
    const store = makeInMemoryApprovalStorage();
    const idA1 = await store.createApproval(baseInput({ contextTitle: "A1" }));
    const idA2 = await store.createApproval(baseInput({ contextTitle: "A2" }));
    await store.createApproval(baseInput({ orgId: ORG_B, contextTitle: "B1" }));
    const list = await store.listPendingApprovalsForOrg(ORG_A);
    assert.equal(list.length, 2);
    // newest first (A2 created after A1)
    assert.equal(list[0].id, idA2);
    assert.equal(list[1].id, idA1);
  });

  test("resolved approvals excluded from pending list", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: null,
      overrideFlag: false,
      now: new Date(),
    });
    const list = await store.listPendingApprovalsForOrg(ORG_A);
    assert.equal(list.length, 0);
  });

  test("limit + offset honored", async () => {
    const store = makeInMemoryApprovalStorage();
    for (let i = 0; i < 5; i++) {
      await store.createApproval(baseInput({ contextTitle: `row-${i}` }));
    }
    const page1 = await store.listPendingApprovalsForOrg(ORG_A, { limit: 2, offset: 0 });
    const page2 = await store.listPendingApprovalsForOrg(ORG_A, { limit: 2, offset: 2 });
    assert.equal(page1.length, 2);
    assert.equal(page2.length, 2);
    assert.notEqual(page1[0].id, page2[0].id);
  });
});

describe("resolveApproval — CAS happy path + audit trail", () => {
  test("first resolve wins, sets resolution metadata", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const now = new Date("2026-04-25T13:00:00Z");
    const result = await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: "lgtm",
      overrideFlag: false,
      now,
    });
    assert.equal(result.claimed, true);
    assert.ok(result.approval);
    assert.equal(result.approval!.status, "approved");
    assert.equal(result.approval!.resolvedByUserId, USER_OWNER);
    assert.equal(result.approval!.resolutionComment, "lgtm");
    assert.equal(result.approval!.resolutionReason, "approved");
    assert.deepEqual(result.approval!.resolvedAt, now);
    assert.equal(result.approval!.overrideFlag, false);
  });

  test("rejection records correctly", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const result = await store.resolveApproval({
      approvalId: id,
      status: "rejected",
      resolutionReason: "rejected",
      resolverUserId: USER_OWNER,
      comment: "wrong recipient list",
      overrideFlag: false,
      now: new Date(),
    });
    assert.equal(result.claimed, true);
    assert.equal(result.approval!.status, "rejected");
    assert.equal(result.approval!.resolutionReason, "rejected");
  });
});

describe("resolveApproval — CAS race losers + idempotency", () => {
  test("second resolve attempt returns claimed=false with the already-resolved row", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const now = new Date("2026-04-25T13:00:00Z");
    const first = await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: null,
      overrideFlag: false,
      now,
    });
    const second = await store.resolveApproval({
      approvalId: id,
      status: "rejected",
      resolutionReason: "rejected",
      resolverUserId: USER_OTHER,
      comment: "I want to reject",
      overrideFlag: false,
      now: new Date(now.getTime() + 1000),
    });
    assert.equal(first.claimed, true);
    assert.equal(second.claimed, false);
    // Loser sees the existing row, NOT a fresh resolution.
    assert.equal(second.approval!.status, "approved");
    assert.equal(second.approval!.resolvedByUserId, USER_OWNER);
  });

  test("resolve on unknown approval id returns claimed=false + null approval", async () => {
    const store = makeInMemoryApprovalStorage();
    const result = await store.resolveApproval({
      approvalId: "00000000-0000-4000-8000-00000000ffff",
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: null,
      overrideFlag: false,
      now: new Date(),
    });
    assert.equal(result.claimed, false);
    assert.equal(result.approval, null);
  });
});

describe("resolveApproval — override path (G-10-7)", () => {
  test("overrideFlag=true sets the boolean in the audit trail", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput({ approverUserId: USER_OTHER }));
    const result = await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: "approver OOO; approving on their behalf",
      overrideFlag: true,
      now: new Date(),
    });
    assert.equal(result.claimed, true);
    assert.equal(result.approval!.overrideFlag, true);
    assert.equal(result.approval!.resolvedByUserId, USER_OWNER);
    // The original approverUserId stays in place — audit trail
    // shows "intended approver" + "actual resolver" + override flag.
    assert.equal(result.approval!.approverUserId, USER_OTHER);
  });
});

describe("resolveApproval — terminal-state semantics for timeouts + cancellations", () => {
  test("timed_out resolution records correctly", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const result = await store.resolveApproval({
      approvalId: id,
      status: "timed_out",
      resolutionReason: "timed_out_abort",
      resolverUserId: null,
      comment: null,
      overrideFlag: false,
      now: new Date(),
    });
    assert.equal(result.claimed, true);
    assert.equal(result.approval!.status, "timed_out");
    assert.equal(result.approval!.resolutionReason, "timed_out_abort");
    assert.equal(result.approval!.resolvedByUserId, null);
  });

  test("cancelled-with-run resolution records correctly", async () => {
    const store = makeInMemoryApprovalStorage();
    const id = await store.createApproval(baseInput());
    const result = await store.resolveApproval({
      approvalId: id,
      status: "cancelled",
      resolutionReason: "cancelled_with_run",
      resolverUserId: null,
      comment: "run cancelled by operator",
      overrideFlag: false,
      now: new Date(),
    });
    assert.equal(result.claimed, true);
    assert.equal(result.approval!.status, "cancelled");
    assert.equal(result.approval!.resolutionReason, "cancelled_with_run");
  });
});

describe("findApprovalByMagicLinkHash", () => {
  test("returns the approval when hash matches AND magic_link_expires_at > now", async () => {
    const store = makeInMemoryApprovalStorage();
    const futureExpires = new Date("2026-12-31T00:00:00Z");
    const id = await store.createApproval(
      baseInput({
        magicLinkTokenHash: "abc123",
        magicLinkExpiresAt: futureExpires,
      }),
    );
    const found = await store.findApprovalByMagicLinkHash("abc123", new Date("2026-04-25T12:00:00Z"));
    assert.ok(found);
    assert.equal(found!.id, id);
  });

  test("returns null when hash matches but expired", async () => {
    const store = makeInMemoryApprovalStorage();
    const expiredAt = new Date("2026-01-01T00:00:00Z");
    await store.createApproval(
      baseInput({
        magicLinkTokenHash: "abc123",
        magicLinkExpiresAt: expiredAt,
      }),
    );
    const found = await store.findApprovalByMagicLinkHash("abc123", new Date("2026-04-25T12:00:00Z"));
    assert.equal(found, null);
  });

  test("returns null when hash doesn't match (no enumeration)", async () => {
    const store = makeInMemoryApprovalStorage();
    await store.createApproval(
      baseInput({
        magicLinkTokenHash: "abc123",
        magicLinkExpiresAt: new Date("2026-12-31T00:00:00Z"),
      }),
    );
    const found = await store.findApprovalByMagicLinkHash("wrong-hash", new Date("2026-04-25T12:00:00Z"));
    assert.equal(found, null);
  });

  test("returns null when no magic-link hash exists on any row", async () => {
    const store = makeInMemoryApprovalStorage();
    await store.createApproval(baseInput()); // no magic-link
    const found = await store.findApprovalByMagicLinkHash("any-hash", new Date());
    assert.equal(found, null);
  });
});

describe("findTimedOutPendingApprovals", () => {
  test("returns pending approvals with timeoutAt <= now", async () => {
    const store = makeInMemoryApprovalStorage();
    const past = new Date("2026-01-01T00:00:00Z");
    const future = new Date("2026-12-31T00:00:00Z");
    const idPast = await store.createApproval(baseInput({ timeoutAt: past }));
    await store.createApproval(baseInput({ timeoutAt: future }));
    const now = new Date("2026-04-25T12:00:00Z");
    const list = await store.findTimedOutPendingApprovals(now);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, idPast);
  });

  test("excludes already-resolved (no double-firing)", async () => {
    const store = makeInMemoryApprovalStorage();
    const past = new Date("2026-01-01T00:00:00Z");
    const id = await store.createApproval(baseInput({ timeoutAt: past }));
    await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: USER_OWNER,
      comment: null,
      overrideFlag: false,
      now: new Date("2026-04-24T12:00:00Z"),
    });
    const list = await store.findTimedOutPendingApprovals(new Date("2026-04-25T12:00:00Z"));
    assert.equal(list.length, 0);
  });

  test("excludes wait_indefinitely (timeoutAt is null)", async () => {
    const store = makeInMemoryApprovalStorage();
    await store.createApproval(baseInput({ timeoutAction: "wait_indefinitely", timeoutAt: null }));
    const list = await store.findTimedOutPendingApprovals(new Date("2099-01-01T00:00:00Z"));
    assert.equal(list.length, 0);
  });
});
