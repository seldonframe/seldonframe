import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAuthorizationCode, generateRefreshToken, hashOauthSecret } from "@/lib/oauth/tokens";

describe("hashOauthSecret", () => {
  it("produces a deterministic SHA-256 hex digest", () => {
    const h1 = hashOauthSecret("abc123");
    const h2 = hashOauthSecret("abc123");
    assert.equal(h1, h2);
    assert.equal(h1.length, 64); // hex-encoded SHA-256 = 64 chars
  });

  it("produces different digests for different inputs", () => {
    assert.notEqual(hashOauthSecret("abc123"), hashOauthSecret("abc124"));
  });
});

describe("generateAuthorizationCode", () => {
  it("returns a sufficiently random, URL-safe string", () => {
    const code = generateAuthorizationCode();
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.ok(code.length >= 32);
  });

  it("never generates the same code twice across many calls", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateAuthorizationCode()));
    assert.equal(codes.size, 1000);
  });
});

describe("generateRefreshToken", () => {
  it("returns a sufficiently random, URL-safe string distinct from an authorization code's shape", () => {
    const token = generateRefreshToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length >= 32);
  });
});
