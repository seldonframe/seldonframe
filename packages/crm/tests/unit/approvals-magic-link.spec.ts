// Tests for the magic-link token generator + verifier.
// SLICE 10 PR 1 C3 per audit §8.3 + Max's gate-resolution prompt.
//
// Invariants verified:
//   1. Token round-trip (sign → verify) succeeds with no tampering.
//   2. Tampered payload (any byte mutation) fails verification.
//   3. Signature alone (no prefix payload) is rejected.
//   4. Expired tokens fail verification with a clean "expired" verdict
//      (distinct from "invalid" to allow surface-level UX without
//      revealing user enumeration).
//   5. Token format DOES NOT contain real-secret prefixes (L-28
//      retroactive — generator output must not look like a Stripe key,
//      Twilio SID, etc.).
//   6. Hash is deterministic (same token + secret → same hash) so DB
//      lookup-by-hash works.
//   7. Verification returns the approval id encoded in the token (so
//      the API can route to the right row without DB lookup-by-token).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  generateMagicLinkToken,
  verifyMagicLinkToken,
  hashMagicLinkToken,
  MAGIC_LINK_DEFAULT_TTL_SECONDS,
} from "../../src/lib/workflow/approvals/magic-link";

// L-28 — secrets used in test fixtures are clearly fake. Real
// HMAC-signing keys are 32+ bytes of cryptographic randomness;
// these test secrets are short, lowercase, self-documenting "fake"
// strings.
const FAKE_TEST_SECRET = "FAKE_TEST_SECRET_NOT_A_REAL_HMAC_KEY";
const APPROVAL_ID = "00000000-0000-4000-8000-000000000aaa";

describe("generateMagicLinkToken — round-trip + token shape", () => {
  test("round-trip: sign then verify with same secret returns approvalId", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const verdict = verifyMagicLinkToken({ token, secret: FAKE_TEST_SECRET, now: new Date() });
    assert.equal(verdict.kind, "valid");
    if (verdict.kind === "valid") {
      assert.equal(verdict.approvalId, APPROVAL_ID);
    }
  });

  test("token does NOT contain Stripe/Twilio/AWS prefix patterns (L-28)", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    assert.ok(!token.startsWith("sk_live_"));
    assert.ok(!token.startsWith("sk_test_"));
    assert.ok(!/^AC[a-f0-9]{32}/.test(token));
    assert.ok(!/^AKIA[A-Z0-9]{16}/.test(token));
  });

  test("token has a clear approval-link prefix (debuggable, not silent)", () => {
    // Per the audit's debuggability bias: tokens should be
    // recognizable as approval tokens at a glance. Format-broken
    // for L-28 + self-documenting prefix.
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    assert.ok(token.startsWith("apl_"), `expected apl_ prefix, got: ${token.slice(0, 20)}…`);
  });

  test("two calls produce different tokens (token includes a nonce)", () => {
    // Defense in depth: even with same approvalId + secret, each
    // generation emits a fresh random nonce so re-emitting a
    // notification doesn't produce the same token (which would let
    // an attacker who saw a token-in-an-email use it after
    // resolution + re-emission).
    const t1 = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const t2 = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    assert.notEqual(t1, t2);
  });
});

describe("verifyMagicLinkToken — tamper detection", () => {
  test("tampered payload fails verification (any single character mutation)", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    // Flip a character in the middle of the token.
    const mid = Math.floor(token.length / 2);
    const tampered = token.slice(0, mid) + (token[mid] === "a" ? "b" : "a") + token.slice(mid + 1);
    const verdict = verifyMagicLinkToken({ token: tampered, secret: FAKE_TEST_SECRET, now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });

  test("signature alone (no payload) is rejected", () => {
    const verdict = verifyMagicLinkToken({ token: "apl_xxxx", secret: FAKE_TEST_SECRET, now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });

  test("token signed with a different secret fails verification", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const verdict = verifyMagicLinkToken({ token, secret: "DIFFERENT_FAKE_SECRET", now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });

  test("empty token rejected", () => {
    const verdict = verifyMagicLinkToken({ token: "", secret: FAKE_TEST_SECRET, now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });
});

describe("verifyMagicLinkToken — expiration", () => {
  test("token verified within TTL succeeds", () => {
    const issuedAt = new Date("2026-04-25T12:00:00Z");
    const token = generateMagicLinkToken({
      approvalId: APPROVAL_ID,
      secret: FAKE_TEST_SECRET,
      now: issuedAt,
    });
    const verdict = verifyMagicLinkToken({
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(issuedAt.getTime() + 60 * 1000), // 60s later
    });
    assert.equal(verdict.kind, "valid");
  });

  test("token verified at exactly TTL boundary considered expired (closed-open semantics)", () => {
    const issuedAt = new Date("2026-04-25T12:00:00Z");
    const token = generateMagicLinkToken({
      approvalId: APPROVAL_ID,
      secret: FAKE_TEST_SECRET,
      now: issuedAt,
    });
    // At exactly TTL, the token is considered expired (now >= expiresAt).
    const verdict = verifyMagicLinkToken({
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(issuedAt.getTime() + MAGIC_LINK_DEFAULT_TTL_SECONDS * 1000),
    });
    assert.equal(verdict.kind, "expired");
  });

  test("token verified past TTL fails as expired (NOT invalid)", () => {
    const issuedAt = new Date("2026-04-25T12:00:00Z");
    const token = generateMagicLinkToken({
      approvalId: APPROVAL_ID,
      secret: FAKE_TEST_SECRET,
      now: issuedAt,
    });
    const verdict = verifyMagicLinkToken({
      token,
      secret: FAKE_TEST_SECRET,
      now: new Date(issuedAt.getTime() + (MAGIC_LINK_DEFAULT_TTL_SECONDS + 60) * 1000),
    });
    // "expired" is distinct from "invalid" so the API can decide
    // which surface to show (expired → "this link expired, ask for
    // a new one"; invalid → "this link is malformed").
    assert.equal(verdict.kind, "expired");
  });
});

describe("hashMagicLinkToken — deterministic for DB lookup", () => {
  test("same token + secret produces same hash (deterministic)", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const h1 = hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET });
    const h2 = hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET });
    assert.equal(h1, h2);
  });

  test("different tokens produce different hashes", () => {
    const t1 = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const t2 = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const h1 = hashMagicLinkToken({ token: t1, secret: FAKE_TEST_SECRET });
    const h2 = hashMagicLinkToken({ token: t2, secret: FAKE_TEST_SECRET });
    assert.notEqual(h1, h2);
  });

  test("hash is hex-encoded SHA-256 (64 chars)", () => {
    const token = generateMagicLinkToken({ approvalId: APPROVAL_ID, secret: FAKE_TEST_SECRET });
    const hash = hashMagicLinkToken({ token, secret: FAKE_TEST_SECRET });
    assert.match(hash, /^[a-f0-9]{64}$/);
  });
});

describe("MAGIC_LINK_DEFAULT_TTL_SECONDS", () => {
  test("default TTL is 24 hours per G-10-8", () => {
    assert.equal(MAGIC_LINK_DEFAULT_TTL_SECONDS, 24 * 60 * 60);
  });
});
