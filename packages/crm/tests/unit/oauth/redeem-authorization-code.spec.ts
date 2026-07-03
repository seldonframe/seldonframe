import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCodeRedemption } from "@/lib/oauth/redeem-authorization-code";

const baseStoredCode = {
  clientId: "c1",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  expiresAt: new Date(Date.now() + 30_000),
  consumedAt: null as Date | null,
};
const CORRECT_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

describe("validateCodeRedemption", () => {
  it("succeeds with matching client_id, redirect_uri, and PKCE verifier, unexpired, unconsumed", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, true);
  });

  it("rejects a client_id mismatch", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "wrong-client",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_grant");
  });

  it("rejects a redirect_uri mismatch", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://different.example.com/callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an incorrect PKCE verifier", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: "totally-wrong-verifier",
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an expired code", () => {
    const result = validateCodeRedemption({
      storedCode: { ...baseStoredCode, expiresAt: new Date(Date.now() - 1000) },
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an already-consumed code (single-use enforcement)", () => {
    const result = validateCodeRedemption({
      storedCode: { ...baseStoredCode, consumedAt: new Date() },
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects when storedCode is null (unknown code hash)", () => {
    const result = validateCodeRedemption({
      storedCode: null,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });
});
