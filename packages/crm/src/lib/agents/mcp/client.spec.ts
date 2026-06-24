// TDD for the inline MCP client's auth-header behavior. The Composio session's
// MCP endpoint requires `x-api-key` (NOT Authorization: Bearer), so the client
// must (a) forward an arbitrary headers map and (b) emit `Authorization: Bearer`
// ONLY when a non-empty bearer is supplied — so existing vetted/byo connectors
// (bearer, no headers) are byte-for-byte unchanged.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createMcpClient } from "./client";

/** A fake fetch that records the headers of every request and returns a canned
 *  JSON-RPC result, so we can assert on what the client sent. */
function recordingFetch() {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = init?.headers as Record<string, string> | undefined;
    if (h) for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), headers, body });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body?.id ?? 1, result: { tools: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test("headers map path: sends x-api-key and NO Authorization, no empty bearer", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createMcpClient({
    endpoint: "https://mcp.composio.dev/abc",
    bearer: "",
    headers: { "x-api-key": "key-123" },
    fetchImpl,
  });
  await client.listTools();

  assert.ok(calls.length >= 1, "expected at least one request");
  for (const call of calls) {
    assert.equal(call.headers["x-api-key"], "key-123", "x-api-key must be forwarded");
    assert.ok(
      !("authorization" in call.headers),
      `Authorization must NOT be present when bearer is empty (got: ${JSON.stringify(call.headers)})`,
    );
    // base headers still present
    assert.equal(call.headers["content-type"], "application/json");
    assert.ok(call.headers["accept"].includes("text/event-stream"));
  }
});

test("bearer path unchanged: Authorization present, no x-api-key", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createMcpClient({
    endpoint: "https://api.postiz.com/mcp",
    bearer: "tok-xyz",
    fetchImpl,
  });
  await client.listTools();

  for (const call of calls) {
    assert.equal(call.headers["authorization"], "Bearer tok-xyz");
    assert.ok(!("x-api-key" in call.headers), "x-api-key must not appear on the bearer path");
  }
});

test("headers map does NOT override the managed content-type/accept", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createMcpClient({
    endpoint: "https://mcp.composio.dev/abc",
    bearer: "",
    // A hostile/wrong override attempt — the client's managed defaults win for
    // the JSON-RPC content negotiation; only auxiliary headers (x-api-key) ride.
    headers: { "x-api-key": "key-123" },
    fetchImpl,
  });
  await client.listTools();
  for (const call of calls) {
    assert.equal(call.headers["content-type"], "application/json");
    assert.ok(call.headers["accept"].includes("application/json"));
  }
});

test("both bearer AND headers: Authorization + x-api-key both present", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createMcpClient({
    endpoint: "https://mcp.composio.dev/abc",
    bearer: "tok-xyz",
    headers: { "x-api-key": "key-123" },
    fetchImpl,
  });
  await client.listTools();
  for (const call of calls) {
    assert.equal(call.headers["authorization"], "Bearer tok-xyz");
    assert.equal(call.headers["x-api-key"], "key-123");
  }
});
