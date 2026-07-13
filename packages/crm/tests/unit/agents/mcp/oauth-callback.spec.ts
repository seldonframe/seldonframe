// Signed-state cookie + OAuth callback handler (TDD). The state cookie is the
// CSRF/session-binding seam for the whole connect flow: it carries the PKCE
// verifier + expected state + org id, HMAC-signed so a tampered cookie is
// rejected before the callback ever calls the token endpoint.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  MCP_OAUTH_COOKIE,
  signMcpOauthState,
  verifyMcpOauthState,
  type McpOauthState,
} from "../../../../src/lib/agents/mcp/oauth-state-cookie";
import {
  handleMcpOauthCallback,
  type McpCallbackDeps,
} from "../../../../src/lib/agents/mcp/oauth-callback";
import type { TokenEnvelope } from "../../../../src/lib/agents/mcp/oauth";

const SECRET = "test-signing-secret-NOT-REAL";

function basePayload(overrides: Partial<McpOauthState> = {}): McpOauthState {
  return {
    v: 1,
    state: "state-abc",
    verifier: "verifier-abc",
    connectorId: "circle",
    orgId: "org-1",
    clientId: "circle-client-1",
    clientSecret: "fake-client-secret-NOT-REAL",
    tokenEndpoint: "https://app.circle.so/oauth/token",
    scopes: ["read"],
    exp: 2_000_000,
    ...overrides,
  };
}

// ─── cookie sign/verify ──────────────────────────────────────────────────────

describe("signMcpOauthState / verifyMcpOauthState", () => {
  test("round-trips: sign then verify returns the same payload", () => {
    const payload = basePayload();
    const signed = signMcpOauthState(payload, SECRET);
    const verified = verifyMcpOauthState(signed, SECRET, () => 1_000_000);
    assert.deepEqual(verified, payload);
  });

  test("a tampered payload (bit flipped in the b64url json part) → null", () => {
    const signed = signMcpOauthState(basePayload(), SECRET);
    const [payloadPart, sigPart] = signed.split(".");
    const tampered = `${payloadPart}x.${sigPart}`;
    assert.equal(verifyMcpOauthState(tampered, SECRET, () => 1_000_000), null);
  });

  test("a tampered signature → null", () => {
    const signed = signMcpOauthState(basePayload(), SECRET);
    const [payloadPart] = signed.split(".");
    const tampered = `${payloadPart}.deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdead`;
    assert.equal(verifyMcpOauthState(tampered, SECRET, () => 1_000_000), null);
  });

  test("wrong-length signature → null without throwing", () => {
    const signed = signMcpOauthState(basePayload(), SECRET);
    const [payloadPart] = signed.split(".");
    assert.doesNotThrow(() => {
      const result = verifyMcpOauthState(`${payloadPart}.short`, SECRET, () => 1_000_000);
      assert.equal(result, null);
    });
  });

  test("expired payload (now > exp) → null", () => {
    const signed = signMcpOauthState(basePayload({ exp: 100 }), SECRET);
    assert.equal(verifyMcpOauthState(signed, SECRET, () => 200), null);
  });

  test("garbage cookie value → null", () => {
    assert.equal(verifyMcpOauthState("not-a-valid-cookie-value", SECRET, () => 0), null);
  });

  test("signed with a DIFFERENT secret → null", () => {
    const signed = signMcpOauthState(basePayload(), SECRET);
    assert.equal(verifyMcpOauthState(signed, "a-different-secret", () => 1_000_000), null);
  });
});

// ─── callback handler ────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<McpCallbackDeps> = {}): McpCallbackDeps {
  return {
    getCookie: () => signMcpOauthState(basePayload(), SECRET),
    resolveSessionOrgId: async () => "org-1",
    storeSecret: async () => undefined,
    exchange: async () => ({
      v: 1,
      kind: "oauth",
      access_token: "fake-access-token-NOT-REAL",
      token_endpoint: "https://app.circle.so/oauth/token",
      client_id: "circle-client-1",
      obtained_at: 1_000_000,
    } as TokenEnvelope),
    probeTools: async () => 7,
    redirectUri: "https://app.seldonframe.com/api/integrations/mcp/callback",
    now: () => 1_000_000,
    authSecret: SECRET,
    ...overrides,
  };
}

describe("handleMcpOauthCallback", () => {
  test("missing code/state params → missing_params, clears cookie", async () => {
    const result = await handleMcpOauthCallback({ code: null, state: "s" }, makeDeps());
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_missing_params");
    assert.equal(result.clearCookie, true);
  });

  test("missing cookie → bad_state", async () => {
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ getCookie: () => undefined }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_bad_state");
  });

  test("cookie signature invalid → bad_state", async () => {
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ getCookie: () => "garbage-cookie-value" }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_bad_state");
  });

  test("state param mismatch vs cookie payload → bad_state", async () => {
    const result = await handleMcpOauthCallback({ code: "c", state: "WRONG" }, makeDeps());
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_bad_state");
  });

  test("expired cookie → expired", async () => {
    const expiredCookie = signMcpOauthState(basePayload({ exp: 500 }), SECRET);
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ getCookie: () => expiredCookie, now: () => 1_000_000 }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_expired");
  });

  test("session org doesn't match cookie's org → org_mismatch, does NOT store", async () => {
    let stored = false;
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ resolveSessionOrgId: async () => "org-DIFFERENT", storeSecret: async () => { stored = true; } }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_org_mismatch");
    assert.equal(stored, false);
  });

  test("no session (resolveSessionOrgId → null) → org_mismatch", async () => {
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ resolveSessionOrgId: async () => null }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_org_mismatch");
  });

  test("exchange throws → exchange_failed", async () => {
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ exchange: async () => { throw new Error("boom"); } }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_exchange_failed");
  });

  test("happy path: stores envelope JSON with discovered_tools_count stamped, redirects ?connected=circle, clears cookie", async () => {
    let storedValue = "";
    const result = await handleMcpOauthCallback(
      { code: "authcode", state: "state-abc" },
      makeDeps({
        storeSecret: async ({ value }) => { storedValue = value; },
        probeTools: async () => 7,
      }),
    );
    assert.equal(result.redirect, "/integrations?connected=circle");
    assert.equal(result.clearCookie, true);
    const parsed = JSON.parse(storedValue);
    assert.equal(parsed.access_token, "fake-access-token-NOT-REAL");
    assert.equal(parsed.discovered_tools_count, 7);
  });

  test("probe returning null (fail-soft) → envelope stored WITHOUT discovered_tools_count", async () => {
    let storedValue = "";
    const result = await handleMcpOauthCallback(
      { code: "authcode", state: "state-abc" },
      makeDeps({
        storeSecret: async ({ value }) => { storedValue = value; },
        probeTools: async () => null,
      }),
    );
    assert.equal(result.redirect, "/integrations?connected=circle");
    const parsed = JSON.parse(storedValue);
    assert.equal("discovered_tools_count" in parsed, false);
  });

  test("unknown connector id in the cookie payload → bad_state", async () => {
    const unknownCookie = signMcpOauthState(basePayload({ connectorId: "ghost-connector" }), SECRET);
    const result = await handleMcpOauthCallback(
      { code: "c", state: "state-abc" },
      makeDeps({ getCookie: () => unknownCookie }),
    );
    assert.equal(result.redirect, "/integrations?error=mcp_oauth_bad_state");
  });
});
