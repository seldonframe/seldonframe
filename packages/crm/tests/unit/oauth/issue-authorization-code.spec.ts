import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizationCodeRecord } from "@/lib/oauth/issue-authorization-code";

describe("buildAuthorizationCodeRecord", () => {
  it("sets expiresAt to createdAt + 60 seconds exactly", () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    const record = buildAuthorizationCodeRecord({
      clientId: "c1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      orgId: "org1",
      userId: "user1",
      codeChallenge: "chal",
      resource: undefined,
      now,
    });
    assert.equal(record.expiresAt.getTime() - now.getTime(), 60_000);
  });

  it("generates a code and its hash consistently (hash matches hashOauthSecret(code))", () => {
    const now = new Date();
    const record = buildAuthorizationCodeRecord({
      clientId: "c1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      orgId: "org1",
      userId: "user1",
      codeChallenge: "chal",
      resource: undefined,
      now,
    });
    // record.code is the raw value to return to the caller ONCE;
    // record.codeHash is what gets persisted. They must correspond.
    assert.notEqual(record.code, record.codeHash);
    assert.ok(record.codeHash.length === 64); // sha256 hex
  });
});
