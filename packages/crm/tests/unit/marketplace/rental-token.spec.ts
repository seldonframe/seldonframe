// Agent-marketplace MCP rental — tests for the signed rental-key mint/verify.
//
// Phase 2 of the agent marketplace ("Rent via MCP"). The rental key is a
// SELF-CONTAINED signed token (HMAC-SHA-256 over { slug, renterOrgId, exp }) —
// NO database table. It mirrors the proven magic-link token pattern
// (approvals/magic-link.ts): base64url payload + HMAC, constant-time compare,
// "expired" distinct from "invalid". Validating it requires only the server
// secret + the slug from the request path — so a rented agent endpoint can
// authenticate a renter with zero DB round-trips.
//
// Invariants verified:
//   1. Round-trip: mint → verify (same secret + slug) returns renterOrgId.
//   2. Slug binding: a key minted for agent A is REJECTED on agent B's endpoint
//      (the slug is signed INTO the payload AND cross-checked on verify).
//   3. Tamper: any single-character mutation fails verification.
//   4. Wrong secret fails.
//   5. Expiry: closed-open — exactly-at-exp is "expired"; past is "expired"
//      (distinct verdict from "invalid", so the endpoint can hint the renter to
//      regenerate vs. report a malformed key).
//   6. L-28: the key prefix must NOT impersonate a real credential
//      (sk_live_, AC…, AKIA…). It carries a recognizable, debuggable prefix.
//   7. Nonce: two mints with identical inputs produce different keys.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  mintRentalKey,
  verifyRentalKey,
  RENTAL_KEY_DEFAULT_TTL_SECONDS,
  RENTAL_KEY_PREFIX,
} from "../../../src/lib/marketplace/rental-token";

// L-28 — fixtures are obviously fake. A real HMAC secret is 32+ bytes of
// randomness; these are short, lowercase, self-documenting "fake" strings.
const FAKE_SECRET = "FAKE_RENTAL_SECRET_NOT_A_REAL_HMAC_KEY";
const SLUG = "sunset-receptionist";
const RENTER_ORG = "00000000-0000-4000-8000-0000000renter";

describe("mintRentalKey — round-trip + shape", () => {
  test("round-trip: mint then verify with same secret + slug returns renterOrgId", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const verdict = verifyRentalKey({ key, slug: SLUG, secret: FAKE_SECRET, now: new Date() });
    assert.equal(verdict.kind, "valid");
    if (verdict.kind === "valid") {
      assert.equal(verdict.renterOrgId, RENTER_ORG);
      assert.equal(verdict.slug, SLUG);
    }
  });

  test("key carries the recognizable rental prefix (debuggable, not silent)", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    assert.ok(key.startsWith(RENTAL_KEY_PREFIX), `expected ${RENTAL_KEY_PREFIX} prefix, got: ${key.slice(0, 16)}…`);
  });

  test("key does NOT impersonate a real credential prefix (L-28)", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    assert.ok(!key.startsWith("sk_live_"));
    assert.ok(!key.startsWith("sk_test_"));
    assert.ok(!/^AC[a-f0-9]{32}/.test(key));
    assert.ok(!/^AKIA[A-Z0-9]{16}/.test(key));
  });

  test("two mints with identical inputs produce different keys (nonce)", () => {
    const a = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const b = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    assert.notEqual(a, b);
  });
});

describe("verifyRentalKey — slug binding (the rental's core guard)", () => {
  test("a key minted for agent A is REJECTED on agent B's endpoint", () => {
    const key = mintRentalKey({ slug: "agent-a", renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const verdict = verifyRentalKey({ key, slug: "agent-b", secret: FAKE_SECRET, now: new Date() });
    assert.equal(verdict.kind, "slug_mismatch");
  });

  test("the same key still validates on its own agent", () => {
    const key = mintRentalKey({ slug: "agent-a", renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const verdict = verifyRentalKey({ key, slug: "agent-a", secret: FAKE_SECRET, now: new Date() });
    assert.equal(verdict.kind, "valid");
  });
});

describe("verifyRentalKey — tamper detection", () => {
  test("tampered key fails (single-character mutation)", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const mid = Math.floor(key.length / 2);
    const tampered = key.slice(0, mid) + (key[mid] === "a" ? "b" : "a") + key.slice(mid + 1);
    const verdict = verifyRentalKey({ key: tampered, slug: SLUG, secret: FAKE_SECRET, now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });

  test("key signed with a different secret fails", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET });
    const verdict = verifyRentalKey({ key, slug: SLUG, secret: "DIFFERENT_FAKE_SECRET", now: new Date() });
    assert.equal(verdict.kind, "invalid");
  });

  test("empty / prefix-only keys rejected as invalid", () => {
    assert.equal(verifyRentalKey({ key: "", slug: SLUG, secret: FAKE_SECRET, now: new Date() }).kind, "invalid");
    assert.equal(
      verifyRentalKey({ key: `${RENTAL_KEY_PREFIX}xxxx`, slug: SLUG, secret: FAKE_SECRET, now: new Date() }).kind,
      "invalid",
    );
    assert.equal(
      verifyRentalKey({ key: "not-even-a-rental-key", slug: SLUG, secret: FAKE_SECRET, now: new Date() }).kind,
      "invalid",
    );
  });
});

describe("verifyRentalKey — expiry (closed-open)", () => {
  const issuedAt = new Date("2026-06-22T12:00:00Z");

  test("verified within TTL succeeds", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET, now: issuedAt });
    const verdict = verifyRentalKey({
      key,
      slug: SLUG,
      secret: FAKE_SECRET,
      now: new Date(issuedAt.getTime() + 60 * 1000),
    });
    assert.equal(verdict.kind, "valid");
  });

  test("exactly at exp boundary is expired (now >= exp)", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET, now: issuedAt });
    const verdict = verifyRentalKey({
      key,
      slug: SLUG,
      secret: FAKE_SECRET,
      now: new Date(issuedAt.getTime() + RENTAL_KEY_DEFAULT_TTL_SECONDS * 1000),
    });
    assert.equal(verdict.kind, "expired");
  });

  test("past TTL is expired (NOT invalid)", () => {
    const key = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET, now: issuedAt });
    const verdict = verifyRentalKey({
      key,
      slug: SLUG,
      secret: FAKE_SECRET,
      now: new Date(issuedAt.getTime() + (RENTAL_KEY_DEFAULT_TTL_SECONDS + 3600) * 1000),
    });
    assert.equal(verdict.kind, "expired");
  });

  test("custom ttlSeconds is honored", () => {
    const key = mintRentalKey({
      slug: SLUG,
      renterOrgId: RENTER_ORG,
      secret: FAKE_SECRET,
      now: issuedAt,
      ttlSeconds: 120,
    });
    const stillValid = verifyRentalKey({
      key,
      slug: SLUG,
      secret: FAKE_SECRET,
      now: new Date(issuedAt.getTime() + 119 * 1000),
    });
    const expired = verifyRentalKey({
      key,
      slug: SLUG,
      secret: FAKE_SECRET,
      now: new Date(issuedAt.getTime() + 121 * 1000),
    });
    assert.equal(stillValid.kind, "valid");
    assert.equal(expired.kind, "expired");
  });
});

describe("RENTAL_KEY_DEFAULT_TTL_SECONDS", () => {
  test("default TTL is 90 days (a rental engagement, not a magic link)", () => {
    assert.equal(RENTAL_KEY_DEFAULT_TTL_SECONDS, 90 * 24 * 60 * 60);
  });
});
