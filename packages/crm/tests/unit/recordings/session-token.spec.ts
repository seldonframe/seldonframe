import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  hashIp,
  hashSessionToken,
  mintSessionToken,
  resolveTokenSecret,
} from "@/lib/recordings/session-token";

describe("mintSessionToken / hashSessionToken", () => {
  test("mint produces a 64-char hex string (32 random bytes)", () => {
    const { raw } = mintSessionToken();
    assert.equal(typeof raw, "string");
    assert.equal(raw.length, 64);
    assert.match(raw, /^[0-9a-f]{64}$/);
  });

  test("two mints never collide", () => {
    const a = mintSessionToken();
    const b = mintSessionToken();
    assert.notEqual(a.raw, b.raw);
  });

  test("hash roundtrip is deterministic for the same raw+secret", () => {
    const { raw } = mintSessionToken();
    const h1 = hashSessionToken(raw, "shh");
    const h2 = hashSessionToken(raw, "shh");
    assert.equal(h1, h2);
    assert.equal(h1.length, 64); // sha256 hex
    assert.notEqual(h1, raw);
  });

  test("hash differs across secrets (never reversible to a shared value)", () => {
    const { raw } = mintSessionToken();
    assert.notEqual(hashSessionToken(raw, "a"), hashSessionToken(raw, "b"));
  });
});

describe("resolveTokenSecret", () => {
  test("prefers AUTH_SECRET over NEXTAUTH_SECRET", () => {
    assert.equal(resolveTokenSecret({ AUTH_SECRET: "primary", NEXTAUTH_SECRET: "fallback" }), "primary");
  });

  test("falls back to NEXTAUTH_SECRET when AUTH_SECRET is unset", () => {
    assert.equal(resolveTokenSecret({ NEXTAUTH_SECRET: "fallback" }), "fallback");
  });

  test("throws when both are unset", () => {
    assert.throws(() => resolveTokenSecret({}), /AUTH_SECRET/);
  });

  test("throws when both are blank strings", () => {
    assert.throws(() => resolveTokenSecret({ AUTH_SECRET: "  ", NEXTAUTH_SECRET: "" }));
  });
});

describe("hashIp", () => {
  test("deterministic for the same ip+secret", () => {
    assert.equal(hashIp("1.2.3.4", "s"), hashIp("1.2.3.4", "s"));
  });

  test("differs across ips", () => {
    assert.notEqual(hashIp("1.2.3.4", "s"), hashIp("5.6.7.8", "s"));
  });
});
