// Tests for the API authorization helpers.
// SLICE 10 PR 1 C5 per audit §7.5 + Max's gate-resolution prompt.
//
// L-22 structural enforcement: permissions checked at the helper
// layer BEFORE any DB write. Routes translate the discriminated
// outcome into HTTP status codes.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorizeAuthenticatedResolution,
  authorizeMagicLinkResolution,
} from "../../src/lib/workflow/approvals/api";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  MAGIC_LINK_DEFAULT_TTL_SECONDS,
} from "../../src/lib/workflow/approvals/magic-link";

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const RUN = "00000000-0000-4000-8000-000000000010";
const APPROVER = "00000000-0000-4000-8000-000000000aaa";
const OTHER_USER = "00000000-0000-4000-8000-000000000bbb";
const ORG_OWNER = "00000000-0000-4000-8000-000000000ccc";
const FAKE_TEST_SECRET = "FAKE_TEST_SECRET_NOT_A_REAL_HMAC_KEY";

async function seedPending(opts: {
  orgId?: string;
  approverUserId?: string | null;
  magicLinkToken?: string | null;
} = {}) {
  const store = makeInMemoryApprovalStorage();
  const tokenHash = opts.magicLinkToken
    ? hashMagicLinkToken({ token: opts.magicLinkToken, secret: FAKE_TEST_SECRET })
    : null;
  const id = await store.createApproval({
    runId: RUN,
    stepId: "needs_review",
    orgId: opts.orgId ?? ORG_A,
    approverType: opts.magicLinkToken ? "client_owner" : "operator",
    approverUserId: opts.approverUserId ?? APPROVER,
    contextTitle: "x",
    contextSummary: "y",
    contextPreview: null,
    contextMetadata: null,
    timeoutAction: "abort",
    timeoutAt: new Date(Date.now() + 3600 * 1000),
    magicLinkTokenHash: tokenHash,
    magicLinkExpiresAt: opts.magicLinkToken ? new Date(Date.now() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000) : null,
  });
  return { store, id };
}

// ---------------------------------------------------------------------
// authorizeAuthenticatedResolution — regular path (asOverride=false)
// ---------------------------------------------------------------------

describe("authorizeAuthenticatedResolution — regular resolve", () => {
  test("bound approver in same org → ok with overrideFlag=false", async () => {
    const { store, id } = await seedPending();
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: APPROVER, callerIsOrgOwner: false },
      false,
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") assert.equal(outcome.overrideFlag, false);
  });

  test("non-bound user → forbidden(not_bound_approver)", async () => {
    const { store, id } = await seedPending();
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: OTHER_USER, callerIsOrgOwner: false },
      false,
    );
    assert.equal(outcome.kind, "forbidden");
    if (outcome.kind === "forbidden") assert.equal(outcome.reason, "not_bound_approver");
  });

  test("org-owner can also resolve via the regular path (defense in depth)", async () => {
    const { store, id } = await seedPending();
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: ORG_OWNER, callerIsOrgOwner: true },
      false,
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") {
      // Regular path even for the org-owner: overrideFlag=false. The
      // override is only set when they hit the dedicated override route.
      assert.equal(outcome.overrideFlag, false);
    }
  });

  test("cross-org caller → wrong_org", async () => {
    const { store, id } = await seedPending({ orgId: ORG_A });
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_B, callerUserId: APPROVER, callerIsOrgOwner: true },
      false,
    );
    assert.equal(outcome.kind, "wrong_org");
  });

  test("missing approval → not_found", async () => {
    const store = makeInMemoryApprovalStorage();
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: "00000000-0000-4000-8000-00000000ffff", callerOrgId: ORG_A, callerUserId: APPROVER, callerIsOrgOwner: false },
      false,
    );
    assert.equal(outcome.kind, "not_found");
  });

  test("already-resolved approval → already_resolved (idempotent UX)", async () => {
    const { store, id } = await seedPending();
    await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: APPROVER,
      comment: null,
      overrideFlag: false,
      now: new Date(),
    });
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: APPROVER, callerIsOrgOwner: false },
      false,
    );
    assert.equal(outcome.kind, "already_resolved");
  });
});

// ---------------------------------------------------------------------
// authorizeAuthenticatedResolution — override path (asOverride=true)
// ---------------------------------------------------------------------

describe("authorizeAuthenticatedResolution — override path (G-10-7)", () => {
  test("org-owner override → ok with overrideFlag=true", async () => {
    const { store, id } = await seedPending({ approverUserId: APPROVER });
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: ORG_OWNER, callerIsOrgOwner: true },
      true,
    );
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") assert.equal(outcome.overrideFlag, true);
  });

  test("non-owner trying to override → forbidden(override_requires_org_owner)", async () => {
    const { store, id } = await seedPending();
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_A, callerUserId: OTHER_USER, callerIsOrgOwner: false },
      true,
    );
    assert.equal(outcome.kind, "forbidden");
    if (outcome.kind === "forbidden") assert.equal(outcome.reason, "override_requires_org_owner");
  });

  test("override on cross-org approval → wrong_org (org check runs first)", async () => {
    const { store, id } = await seedPending({ orgId: ORG_A });
    const outcome = await authorizeAuthenticatedResolution(
      store,
      { approvalId: id, callerOrgId: ORG_B, callerUserId: ORG_OWNER, callerIsOrgOwner: true },
      true,
    );
    assert.equal(outcome.kind, "wrong_org");
  });
});

// ---------------------------------------------------------------------
// authorizeMagicLinkResolution
// ---------------------------------------------------------------------

describe("authorizeMagicLinkResolution", () => {
  test("valid token + matching hash + pending approval → ok", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const { store } = await seedPending({ magicLinkToken: token });
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") assert.equal(outcome.overrideFlag, false);
  });

  test("tampered token → invalid_token", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    await seedPending({ magicLinkToken: token });
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const store = makeInMemoryApprovalStorage();
    const outcome = await authorizeMagicLinkResolution(store, {
      token: tampered,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "invalid_token");
  });

  test("wrong secret → invalid_token", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const { store } = await seedPending({ magicLinkToken: token });
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: "WRONG_SECRET_FAKE",
      now: new Date(),
    });
    assert.equal(outcome.kind, "invalid_token");
  });

  test("expired token → expired (distinct from invalid)", async () => {
    const issuedAt = new Date("2026-04-25T12:00:00Z");
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET, now: issuedAt });
    const store = makeInMemoryApprovalStorage();
    await store.createApproval({
      runId: RUN,
      stepId: "x",
      orgId: ORG_A,
      approverType: "client_owner",
      approverUserId: APPROVER,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(Date.now() + 3600 * 1000),
      magicLinkTokenHash: hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET }),
      magicLinkExpiresAt: new Date(issuedAt.getTime() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000),
    });
    // Verify well past expiration.
    const wellPast = new Date(issuedAt.getTime() + (MAGIC_LINK_DEFAULT_TTL_SECONDS + 60) * 1000);
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: wellPast,
    });
    assert.equal(outcome.kind, "expired");
  });

  test("token signature valid but hash absent in DB → invalid_token (uniform error, no enumeration)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    // Don't seed any matching approval row.
    const store = makeInMemoryApprovalStorage();
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "invalid_token");
  });

  test("already-resolved approval via magic link → already_resolved", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const { store, id } = await seedPending({ magicLinkToken: token });
    await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: APPROVER,
      comment: null,
      overrideFlag: false,
      now: new Date(),
    });
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    // Resolved approvals via magic link return invalid_token from
    // findApprovalByMagicLinkHash because the storage method only
    // returns rows that haven't expired AND the hash matches; our
    // in-memory impl + Drizzle impl both don't filter by status.
    // After resolution the row is still findable by hash — the
    // already_resolved path fires. (If a future iteration tightens
    // the storage method to filter resolved rows out, this test
    // expectation should change to invalid_token.)
    assert.equal(outcome.kind, "already_resolved");
  });
});
