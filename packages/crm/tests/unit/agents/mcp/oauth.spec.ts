// Inline OAuth 2.1 client (TDD) — RFC 8414 discovery, RFC 7591 DCR, PKCE S256,
// token exchange/refresh, and the token envelope. Mirrors client.spec.ts-style
// conventions: pure functions + DI'd fetch, no network.
//
// Grounded in the live Circle probe (design spec §1): Circle's
// `/.well-known/oauth-protected-resource` returns 200 **HTML** (its SPA
// fallback — RFC 9728 NOT implemented), so the HTML-not-JSON rejection here is
// the load-bearing test — without it we'd "discover" a bogus issuer from a
// marketing page.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  discoverAuthServer,
  registerClient,
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
  generatePkcePair,
  generateStateToken,
  parseTokenEnvelope,
  tokenEnvelopeSchema,
  type AsMetadata,
  type TokenEnvelope,
} from "../../../../src/lib/agents/mcp/oauth";

const CIRCLE_ENDPOINT = "https://app.circle.so/api/mcp";

function jsonResponse(body: unknown, init?: { status?: number; contentType?: string }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": init?.contentType ?? "application/json" },
  });
}

function htmlResponse(status = 200): Response {
  return new Response("<!doctype html><html>circle spa fallback</html>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const CIRCLE_AS_METADATA: AsMetadata = {
  issuer: "https://app.circle.so",
  authorization_endpoint: "https://app.circle.so/oauth/authorize",
  token_endpoint: "https://app.circle.so/oauth/token",
  registration_endpoint: "https://app.circle.so/oauth/register",
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["read", "write"],
};

// ─── PKCE + state ────────────────────────────────────────────────────────────

describe("generatePkcePair", () => {
  test("verifier is 43-char base64url; challenge = base64url(sha256(verifier))", () => {
    const { verifier, challenge } = generatePkcePair();
    assert.equal(verifier.length, 43, "32 random bytes → 43-char base64url (no padding)");
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    assert.equal(challenge, expectedChallenge);
  });

  test("two calls produce different verifiers", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    assert.notEqual(a.verifier, b.verifier);
  });
});

describe("generateStateToken", () => {
  test("base64url shape, unique across calls", () => {
    const a = generateStateToken();
    const b = generateStateToken();
    assert.match(a, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(a, b);
  });
});

// ─── discoverAuthServer ──────────────────────────────────────────────────────

describe("discoverAuthServer", () => {
  test("rejects a non-https endpoint before any network call", async () => {
    await assert.rejects(
      () => discoverAuthServer("http://insecure.example.com/mcp", { fetchImpl: async () => { throw new Error("must not fetch"); } }),
      /https/i,
    );
  });

  test("the Circle case: 200-HTML protected-resource then falls back to issuer-root RFC 8414 metadata", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string | URL) => {
      const u = url.toString();
      calls.push(u);
      if (u.includes("/.well-known/oauth-protected-resource")) {
        return htmlResponse(200); // Circle's SPA fallback — must NOT be parsed as success.
      }
      if (u === "https://app.circle.so/.well-known/oauth-authorization-server") {
        return jsonResponse(CIRCLE_AS_METADATA);
      }
      return new Response("not found", { status: 404 });
    };
    const metadata = await discoverAuthServer(CIRCLE_ENDPOINT, { fetchImpl: fetchImpl as typeof fetch });
    assert.equal(metadata.token_endpoint, "https://app.circle.so/oauth/token");
    assert.equal(metadata.registration_endpoint, "https://app.circle.so/oauth/register");
    assert.ok(calls.some((c) => c.includes("oauth-protected-resource")), "must have tried RFC 9728 first");
    assert.ok(calls.some((c) => c.includes("oauth-authorization-server")), "must have fallen back to RFC 8414");
  });

  test("RFC 9728 success path: valid JSON authorization_servers[0] is used as the issuer for step b2", async () => {
    const fetchImpl = async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/.well-known/oauth-protected-resource")) {
        return jsonResponse({ authorization_servers: ["https://auth.example.com"] });
      }
      if (u === "https://auth.example.com/.well-known/oauth-authorization-server") {
        return jsonResponse({
          issuer: "https://auth.example.com",
          authorization_endpoint: "https://auth.example.com/authorize",
          token_endpoint: "https://auth.example.com/token",
        });
      }
      return new Response("not found", { status: 404 });
    };
    const metadata = await discoverAuthServer("https://mcp.example.com/mcp", { fetchImpl: fetchImpl as typeof fetch });
    assert.equal(metadata.issuer, "https://auth.example.com");
  });

  test("total failure (all candidates 404/malformed) throws a descriptive error", async () => {
    const fetchImpl = async () => new Response("nope", { status: 404 });
    await assert.rejects(
      () => discoverAuthServer(CIRCLE_ENDPOINT, { fetchImpl: fetchImpl as typeof fetch }),
      /discovery failed/i,
    );
  });

  test("a 200 response with the wrong shape (missing token_endpoint) does not count as success", async () => {
    const fetchImpl = async (url: string | URL) => {
      const u = url.toString();
      if (u === "https://app.circle.so/.well-known/oauth-authorization-server") {
        return jsonResponse({ issuer: "https://app.circle.so" }); // no endpoints
      }
      return new Response("nope", { status: 404 });
    };
    await assert.rejects(() => discoverAuthServer(CIRCLE_ENDPOINT, { fetchImpl: fetchImpl as typeof fetch }));
  });
});

// ─── registerClient (DCR) ────────────────────────────────────────────────────

describe("registerClient", () => {
  test("happy path posts to registration_endpoint and returns client_id/client_secret", async () => {
    let seenBody: unknown;
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ client_id: "circle-client-1", client_secret: "fake-client-secret-NOT-REAL" }, { status: 201 });
    };
    const result = await registerClient({
      metadata: CIRCLE_AS_METADATA,
      redirectUri: "https://app.seldonframe.com/api/integrations/mcp/callback",
      clientName: "SeldonFrame",
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(result.client_id, "circle-client-1");
    assert.equal(result.client_secret, "fake-client-secret-NOT-REAL");
    assert.equal((seenBody as { token_endpoint_auth_method?: string }).token_endpoint_auth_method, "none");
    assert.deepEqual((seenBody as { redirect_uris?: string[] }).redirect_uris, [
      "https://app.seldonframe.com/api/integrations/mcp/callback",
    ]);
  });

  test("downgrades to client_secret_post when the AS metadata doesn't advertise \"none\"", async () => {
    let seenBody: unknown;
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ client_id: "id1", client_secret: "fake-secret-NOT-REAL" });
    };
    await registerClient({
      metadata: {
        ...CIRCLE_AS_METADATA,
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      } as AsMetadata & { token_endpoint_auth_methods_supported: string[] },
      redirectUri: "https://x/cb",
      clientName: "SeldonFrame",
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal((seenBody as { token_endpoint_auth_method?: string }).token_endpoint_auth_method, "client_secret_post");
  });

  test("no registration_endpoint in metadata → throws", async () => {
    const { registration_endpoint, ...rest } = CIRCLE_AS_METADATA;
    void registration_endpoint;
    await assert.rejects(() =>
      registerClient({
        metadata: rest as AsMetadata,
        redirectUri: "https://x/cb",
        clientName: "SeldonFrame",
        fetchImpl: (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch,
      }),
    );
  });
});

// ─── buildAuthorizeUrl ───────────────────────────────────────────────────────

describe("buildAuthorizeUrl", () => {
  test("contains all 7 required params", () => {
    const url = buildAuthorizeUrl({
      metadata: CIRCLE_AS_METADATA,
      clientId: "circle-client-1",
      redirectUri: "https://app.seldonframe.com/api/integrations/mcp/callback",
      scopes: ["read"],
      state: "state123",
      codeChallenge: "challenge123",
    });
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://app.circle.so/oauth/authorize");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("client_id"), "circle-client-1");
    assert.equal(parsed.searchParams.get("redirect_uri"), "https://app.seldonframe.com/api/integrations/mcp/callback");
    assert.equal(parsed.searchParams.get("scope"), "read");
    assert.equal(parsed.searchParams.get("state"), "state123");
    assert.equal(parsed.searchParams.get("code_challenge"), "challenge123");
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  });
});

// ─── exchangeCode ────────────────────────────────────────────────────────────

describe("exchangeCode", () => {
  test("happy path builds an envelope with computed expires_at (injected now)", async () => {
    const fetchImpl = async () =>
      jsonResponse({ access_token: "fake-access-token-NOT-REAL", token_type: "bearer", expires_in: 3600, refresh_token: "fake-refresh-token-NOT-REAL", scope: "read" });
    const envelope = await exchangeCode({
      tokenEndpoint: "https://app.circle.so/oauth/token",
      clientId: "circle-client-1",
      clientSecret: "fake-client-secret-NOT-REAL",
      code: "authcode123",
      codeVerifier: "verifier123",
      redirectUri: "https://x/cb",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_000_000,
    });
    assert.equal(envelope.v, 1);
    assert.equal(envelope.kind, "oauth");
    assert.equal(envelope.access_token, "fake-access-token-NOT-REAL");
    assert.equal(envelope.refresh_token, "fake-refresh-token-NOT-REAL");
    assert.equal(envelope.expires_at, 1_000_000 + 3_600_000);
    assert.equal(envelope.token_endpoint, "https://app.circle.so/oauth/token");
    assert.equal(envelope.client_id, "circle-client-1");
  });

  test("no expires_in → expires_at is undefined (non-expiring)", async () => {
    const fetchImpl = async () => jsonResponse({ access_token: "fake-access-token-NOT-REAL" });
    const envelope = await exchangeCode({
      tokenEndpoint: "https://x/token",
      clientId: "id",
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://x/cb",
      fetchImpl: fetchImpl as typeof fetch,
    });
    assert.equal(envelope.expires_at, undefined);
  });

  test("non-2xx throws WITHOUT leaking a planted token value from the fake body", async () => {
    const plantedSecret = "fake-secret-value-NOT-REAL-abcdefghijklmnop";
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", leaked: plantedSecret }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(
      () =>
        exchangeCode({
          tokenEndpoint: "https://x/token",
          clientId: "id",
          code: "c",
          codeVerifier: "v",
          redirectUri: "https://x/cb",
          fetchImpl: fetchImpl as typeof fetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(!err.message.includes(plantedSecret), "must not echo the raw token-shaped value");
        return true;
      },
    );
  });

  test("missing access_token in a 2xx response throws", async () => {
    const fetchImpl = async () => jsonResponse({ token_type: "bearer" });
    await assert.rejects(() =>
      exchangeCode({
        tokenEndpoint: "https://x/token",
        clientId: "id",
        code: "c",
        codeVerifier: "v",
        redirectUri: "https://x/cb",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    );
  });
});

// ─── refreshTokens ───────────────────────────────────────────────────────────

describe("refreshTokens", () => {
  const baseEnvelope: TokenEnvelope = {
    v: 1,
    kind: "oauth",
    access_token: "fake-old-access-token-NOT-REAL",
    refresh_token: "fake-old-refresh-token-NOT-REAL",
    expires_at: 500,
    scope: "read",
    token_endpoint: "https://app.circle.so/oauth/token",
    client_id: "circle-client-1",
    client_secret: "fake-client-secret-NOT-REAL",
    obtained_at: 100,
  };

  test("rotates refresh_token when the response includes a new one", async () => {
    const fetchImpl = async () =>
      jsonResponse({ access_token: "fake-new-access-token-NOT-REAL", refresh_token: "fake-new-refresh-token-NOT-REAL", expires_in: 3600 });
    const next = await refreshTokens({ envelope: baseEnvelope, fetchImpl: fetchImpl as typeof fetch, now: () => 2_000_000 });
    assert.equal(next.access_token, "fake-new-access-token-NOT-REAL");
    assert.equal(next.refresh_token, "fake-new-refresh-token-NOT-REAL");
    assert.equal(next.expires_at, 2_000_000 + 3_600_000);
    assert.equal(next.client_id, "circle-client-1");
    assert.equal(next.token_endpoint, baseEnvelope.token_endpoint);
  });

  test("preserves the OLD refresh_token when the response omits one (rotation-optional)", async () => {
    const fetchImpl = async () => jsonResponse({ access_token: "fake-new-access-token-NOT-REAL", expires_in: 60 });
    const next = await refreshTokens({ envelope: baseEnvelope, fetchImpl: fetchImpl as typeof fetch, now: () => 0 });
    assert.equal(next.refresh_token, baseEnvelope.refresh_token);
  });

  test("non-2xx throws", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
    await assert.rejects(() => refreshTokens({ envelope: baseEnvelope, fetchImpl: fetchImpl as typeof fetch }));
  });
});

// ─── token envelope parse/round-trip ─────────────────────────────────────────

describe("parseTokenEnvelope", () => {
  test("round-trips a valid envelope", () => {
    const envelope: TokenEnvelope = {
      v: 1,
      kind: "oauth",
      access_token: "fake-access-token-NOT-REAL",
      token_endpoint: "https://app.circle.so/oauth/token",
      client_id: "circle-client-1",
      obtained_at: 123,
    };
    const raw = JSON.stringify(envelope);
    const parsed = parseTokenEnvelope(raw);
    assert.deepEqual(parsed, envelope);
    assert.doesNotThrow(() => tokenEnvelopeSchema.parse(parsed));
  });

  test("null on garbage JSON", () => {
    assert.equal(parseTokenEnvelope("{not json"), null);
  });

  test("null on a plain-bearer string (not our envelope shape)", () => {
    assert.equal(parseTokenEnvelope("plain-bearer-key-123"), null);
  });

  test("null when v/kind literals don't match", () => {
    assert.equal(
      parseTokenEnvelope(JSON.stringify({ v: 2, kind: "oauth", access_token: "x", token_endpoint: "y", client_id: "z", obtained_at: 1 })),
      null,
    );
  });
});
