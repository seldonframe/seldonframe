import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mintTasteToken,
  verifyTasteToken,
  TASTE_TOKEN_PREFIX,
} from "../../../../src/lib/marketplace/taste/taste-token";
import { TASTE_SESSION_TTL_MS } from "../../../../src/lib/marketplace/taste/taste-policy";

const SECRET = "test-secret";
const NOW = new Date("2026-07-03T12:00:00Z");

describe("taste-token", () => {
  it("round-trips a valid token", () => {
    const token = mintTasteToken({ slug: "hvac", sessionId: "sid-1", secret: SECRET, now: NOW });
    assert.ok(token.startsWith(TASTE_TOKEN_PREFIX));
    const v = verifyTasteToken({ token, slug: "hvac", secret: SECRET, now: NOW });
    assert.deepEqual(v, { kind: "valid", sessionId: "sid-1" });
  });

  it("binds to the slug", () => {
    const token = mintTasteToken({ slug: "hvac", sessionId: "sid-1", secret: SECRET, now: NOW });
    assert.equal(verifyTasteToken({ token, slug: "other", secret: SECRET, now: NOW }).kind, "slug_mismatch");
  });

  it("expires after exactly the 1h TTL (closed-open)", () => {
    const token = mintTasteToken({ slug: "s", sessionId: "x", secret: SECRET, now: NOW });
    const justBefore = new Date(NOW.getTime() + TASTE_SESSION_TTL_MS - 1);
    const atExpiry = new Date(NOW.getTime() + TASTE_SESSION_TTL_MS);
    assert.equal(verifyTasteToken({ token, slug: "s", secret: SECRET, now: justBefore }).kind, "valid");
    assert.equal(verifyTasteToken({ token, slug: "s", secret: SECRET, now: atExpiry }).kind, "expired");
  });

  it("rejects tampering, wrong secret, junk, and rk_ tokens", () => {
    const token = mintTasteToken({ slug: "s", sessionId: "x", secret: SECRET, now: NOW });
    assert.equal(verifyTasteToken({ token: token.slice(0, -2), slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token, slug: "s", secret: "wrong", now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token: "garbage", slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token: "rk_abc.def", slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
  });
});
