// OAuth-aware bearer resolver (TDD). Makes an OAuth token envelope look like a
// plain bearer to every existing consumer (wrap-tool, bind-time discovery):
//   - a plain (non-JSON) stored secret is returned verbatim — postiz/rube are
//     byte-for-byte unchanged.
//   - a `{...}` OAuth envelope is parsed; a fresh access_token is returned; a
//     stale one is proactively refreshed (60s skew) and the ROTATED envelope
//     is re-persisted via storeSecret; concurrent calls single-flight so only
//     ONE refresh request happens per (orgId, serviceName).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveConnectorBearer } from "../../../../src/lib/agents/mcp/resolve-bearer";
import type { TokenEnvelope } from "../../../../src/lib/agents/mcp/oauth";

function envelope(overrides: Partial<TokenEnvelope> = {}): TokenEnvelope {
  return {
    v: 1,
    kind: "oauth",
    access_token: "fake-access-token-NOT-REAL",
    refresh_token: "fake-refresh-token-NOT-REAL",
    expires_at: undefined,
    token_endpoint: "https://app.circle.so/oauth/token",
    client_id: "circle-client-1",
    client_secret: "fake-client-secret-NOT-REAL",
    obtained_at: 0,
    ...overrides,
  };
}

describe("resolveConnectorBearer", () => {
  test("null stored secret → null", async () => {
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => null,
      storeSecret: async () => { throw new Error("must not store"); },
    });
    assert.equal(result, null);
  });

  test("plain (non-JSON) secret → returned verbatim (postiz/rube unchanged)", async () => {
    const result = await resolveConnectorBearer("org-1", "postiz", {
      getSecretValue: async () => "plain-bearer-key-123",
      storeSecret: async () => { throw new Error("must not store"); },
    });
    assert.equal(result, "plain-bearer-key-123");
  });

  test("fresh envelope (no expires_at) → access_token, no store call", async () => {
    let stored = false;
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => JSON.stringify(envelope()),
      storeSecret: async () => { stored = true; },
    });
    assert.equal(result, "fake-access-token-NOT-REAL");
    assert.equal(stored, false);
  });

  test("fresh envelope (expires_at far in the future) → access_token, no store call", async () => {
    let stored = false;
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => JSON.stringify(envelope({ expires_at: 10_000_000 })),
      storeSecret: async () => { stored = true; },
      now: () => 0,
    });
    assert.equal(result, "fake-access-token-NOT-REAL");
    assert.equal(stored, false);
  });

  test("stale + refresh_token → refreshed token AND storeSecret called once with a rotated envelope that parses back", async () => {
    let storeCallCount = 0;
    let storedValue = "";
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ access_token: "fake-refreshed-access-token-NOT-REAL", refresh_token: "fake-refreshed-refresh-token-NOT-REAL", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => JSON.stringify(envelope({ expires_at: 100 })), // stale relative to now()=1000
      storeSecret: async ({ value }) => {
        storeCallCount += 1;
        storedValue = value;
      },
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1000,
    });
    assert.equal(result, "fake-refreshed-access-token-NOT-REAL");
    assert.equal(storeCallCount, 1);
    const parsedBack = JSON.parse(storedValue);
    assert.equal(parsedBack.access_token, "fake-refreshed-access-token-NOT-REAL");
    assert.equal(parsedBack.refresh_token, "fake-refreshed-refresh-token-NOT-REAL");
  });

  test("stale + no refresh_token → null, no fetch attempted", async () => {
    let fetchCalled = false;
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => JSON.stringify(envelope({ expires_at: 100, refresh_token: undefined })),
      storeSecret: async () => {},
      fetchImpl: (async () => {
        fetchCalled = true;
        throw new Error("must not fetch");
      }) as unknown as typeof fetch,
      now: () => 1000,
    });
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  });

  test("malformed `{`-prefixed secret (unparseable envelope) → null, never passed through as a raw bearer", async () => {
    const result = await resolveConnectorBearer("org-1", "circle", {
      getSecretValue: async () => "{not valid json at all",
      storeSecret: async () => { throw new Error("must not store"); },
    });
    assert.equal(result, null);
  });

  test("concurrent calls while a refresh is in flight → ONE fetch (single-flight)", async () => {
    let fetchCount = 0;
    let resolveFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { resolveFetch = resolve; });
    const fetchImpl = async () => {
      fetchCount += 1;
      await gate;
      return new Response(
        JSON.stringify({ access_token: "fake-refreshed-access-token-NOT-REAL", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const deps = {
      getSecretValue: async () => JSON.stringify(envelope({ expires_at: 100 })),
      storeSecret: async () => {},
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1000,
    };
    const p1 = resolveConnectorBearer("org-concurrent", "circle", deps);
    const p2 = resolveConnectorBearer("org-concurrent", "circle", deps);
    resolveFetch?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, "fake-refreshed-access-token-NOT-REAL");
    assert.equal(r2, "fake-refreshed-access-token-NOT-REAL");
    assert.equal(fetchCount, 1, "only one refresh network call for concurrent resolves of the same org+service");
  });

  test("refresh failure (non-2xx) → null, no store call", async () => {
    let stored = false;
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "content-type": "application/json" } });
    const result = await resolveConnectorBearer("org-refresh-fail", "circle", {
      getSecretValue: async () => JSON.stringify(envelope({ expires_at: 100 })),
      storeSecret: async () => { stored = true; },
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1000,
    });
    assert.equal(result, null);
    assert.equal(stored, false);
  });
});
