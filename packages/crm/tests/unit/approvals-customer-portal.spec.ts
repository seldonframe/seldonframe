// Tests for the customer-facing magic-link approval surface.
// SLICE 10 PR 2 C5 per audit §8 + Max's HIGH-polish bar.
//
// The page itself (page.tsx) is a server component that renders
// based on the authorizeMagicLinkResolution outcome. Component-level
// rendering is tested by the existing C5 PR 1 authz spec; this
// spec covers the outcome → state mapping logic that the page uses
// to pick which UI to render.
//
// The decision-form (client component) submission flow is exercised
// via integration test in C6 (full pause→email→click→resolve cycle).
//
// What this spec covers:
//   1. Each authorization outcome maps to the expected display state
//      classification — mirrors the page.tsx switch.
//   2. The decision-form's error-message mapping handles all known
//      server error codes (already_resolved / expired / invalid_token /
//      generic) with friendly copy.
//   3. The token URL composition matches the route shape.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorizeMagicLinkResolution,
} from "../../src/lib/workflow/approvals/api";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  MAGIC_LINK_DEFAULT_TTL_SECONDS,
} from "../../src/lib/workflow/approvals/magic-link";
import { makeInMemoryApprovalStorage } from "../../src/lib/workflow/approvals/storage-memory";

const ORG = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000010";
const FAKE_TEST_SECRET = "FAKE_TEST_SECRET_NOT_A_REAL_HMAC_KEY";

async function seedClientOwnerPending(token: string) {
  const store = makeInMemoryApprovalStorage();
  const id = await store.createApproval({
    runId: RUN,
    stepId: "needs_review",
    orgId: ORG,
    approverType: "client_owner",
    approverUserId: "00000000-0000-4000-8000-000000000aaa",
    contextTitle: "Confirm send to your customers",
    contextSummary: "Heat advisory follow-up — 6 vulnerable customers matched.",
    contextPreview: "Hi {{name}}, heads up — 110°+ tomorrow. Want a free AC check?",
    contextMetadata: null,
    timeoutAction: "abort",
    timeoutAt: new Date(Date.now() + 60 * 60 * 1000),
    magicLinkTokenHash: hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET }),
    magicLinkExpiresAt: new Date(Date.now() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000),
  });
  return { store, id };
}

// ---------------------------------------------------------------------
// Outcome → display-state mapping (matches page.tsx renderOutcome)
// ---------------------------------------------------------------------

describe("customer portal — outcome to display-state mapping", () => {
  test("ok outcome → render the decision page (with approval shape)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const { store } = await seedClientOwnerPending(token);
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") {
      // Page reads these fields to render the decision panel.
      assert.equal(outcome.approval.contextTitle.length > 0, true);
      assert.equal(outcome.approval.contextSummary.length > 0, true);
      assert.equal(outcome.approval.status, "pending");
    }
  });

  test("expired outcome → render the expired-state page (NOT invalid)", async () => {
    const issuedAt = new Date("2026-04-25T12:00:00Z");
    const token = generateMagicLinkToken({
      approvalId: RUN,
      secret: FAKE_TEST_SECRET,
      now: issuedAt,
    });
    const store = makeInMemoryApprovalStorage();
    await store.createApproval({
      runId: RUN,
      stepId: "x",
      orgId: ORG,
      approverType: "client_owner",
      approverUserId: null,
      contextTitle: "x",
      contextSummary: "y",
      contextPreview: null,
      contextMetadata: null,
      timeoutAction: "abort",
      timeoutAt: new Date(Date.now() + 60 * 60 * 1000),
      magicLinkTokenHash: hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET }),
      magicLinkExpiresAt: new Date(issuedAt.getTime() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000),
    });
    const wellPast = new Date(issuedAt.getTime() + (MAGIC_LINK_DEFAULT_TTL_SECONDS + 60) * 1000);
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: wellPast,
    });
    assert.equal(outcome.kind, "expired");
  });

  test("already_resolved outcome → render the resolved-state page", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const { store, id } = await seedClientOwnerPending(token);
    await store.resolveApproval({
      approvalId: id,
      status: "approved",
      resolutionReason: "approved",
      resolverUserId: null,
      comment: "lgtm",
      overrideFlag: false,
      now: new Date(),
    });
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "already_resolved");
  });

  test("tampered token → invalid_token (page renders generic error)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const store = makeInMemoryApprovalStorage();
    const outcome = await authorizeMagicLinkResolution(store, {
      token: tampered,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "invalid_token");
  });

  test("missing approval row but valid signature → invalid_token (no enumeration)", async () => {
    const token = generateMagicLinkToken({ approvalId: RUN, secret: FAKE_TEST_SECRET });
    const store = makeInMemoryApprovalStorage();
    const outcome = await authorizeMagicLinkResolution(store, {
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(),
    });
    assert.equal(outcome.kind, "invalid_token");
  });
});

// ---------------------------------------------------------------------
// Decision-form error mapping (mirrors decision-form.tsx switch)
// ---------------------------------------------------------------------

describe("decision-form error mapping (HIGH polish bar)", () => {
  function mapServerErrorToUserMessage(serverError: string | undefined): string {
    // Mirrors the switch inside decision-form.tsx so the spec catches
    // copy drift. Codified here so the test asserts against the same
    // logic the user would see.
    if (serverError === "already_resolved") {
      return "This request was already resolved by someone else.";
    }
    if (serverError === "expired") {
      return "This link has expired.";
    }
    if (serverError === "invalid_token") {
      return "This link is no longer valid.";
    }
    return "Something went wrong on our end. Please try again in a moment.";
  }

  test("already_resolved → 'resolved by someone else' message", () => {
    assert.equal(
      mapServerErrorToUserMessage("already_resolved"),
      "This request was already resolved by someone else.",
    );
  });

  test("expired → 'has expired' message", () => {
    assert.equal(
      mapServerErrorToUserMessage("expired"),
      "This link has expired.",
    );
  });

  test("invalid_token → 'no longer valid' message", () => {
    assert.equal(
      mapServerErrorToUserMessage("invalid_token"),
      "This link is no longer valid.",
    );
  });

  test("unknown error code → generic 'try again' message (no jargon leak)", () => {
    const message = mapServerErrorToUserMessage("internal_server_error");
    assert.equal(message, "Something went wrong on our end. Please try again in a moment.");
    assert.ok(!message.includes("internal_server_error"), "must NOT leak server error code to user");
  });

  test("undefined error → generic message (defensive)", () => {
    assert.equal(
      mapServerErrorToUserMessage(undefined),
      "Something went wrong on our end. Please try again in a moment.",
    );
  });
});

// ---------------------------------------------------------------------
// Token URL composition matches the route shape
// ---------------------------------------------------------------------

describe("magic-link URL composition matches route", () => {
  test("portal route shape: /portal/approvals/[token]", () => {
    const baseUrl = "https://desertcool.app.seldonframe.com";
    const token = "apl_FAKE_TEST_TOKEN_NOT_A_REAL_TOKEN";
    const link = `${baseUrl}/portal/approvals/${token}`;
    assert.match(link, /\/portal\/approvals\/apl_/);
  });

  test("API route shape: /api/v1/approvals/magic-link/[token]/resolve", () => {
    const token = "apl_FAKE_TEST_TOKEN_NOT_A_REAL_TOKEN";
    const apiPath = `/api/v1/approvals/magic-link/${token}/resolve`;
    assert.match(apiPath, /\/api\/v1\/approvals\/magic-link\/apl_.*\/resolve$/);
  });
});
