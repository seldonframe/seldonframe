// Inline MCP-over-HTTP (Streamable HTTP / JSON-RPC 2.0) client — TDD.
//
// We DON'T depend on @modelcontextprotocol/sdk (not in the lockfile; the
// worktree pnpm blocks new deps). Instead `createMcpClient` is a ~200-LOC
// inline client grounded in the current MCP Streamable HTTP transport spec:
//   - POST JSON-RPC to the endpoint, Accept: application/json + text/event-stream
//   - initialize → capture the Mcp-Session-Id response header, then send a
//     notifications/initialized notification; echo the session id on later calls
//   - tools/list → { tools: [{ name, description, inputSchema }] }
//   - tools/call → { content: [{type:"text", text}|…], isError? }
//   - body may be application/json OR an SSE text/event-stream (parse data: lines)
//
// PATTERN (repo convention): DI the fetch impl — no real network. Each test
// passes a fake `fetchImpl` that records the request and returns a canned
// Response, so the JSON-RPC envelope + header handling + error mapping are all
// asserted without a server. Security: a non-https endpoint is rejected up
// front (no fetch even attempted).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createMcpClient } from "../../../../src/lib/agents/mcp/client";

// ─── fake fetch helpers ──────────────────────────────────────────────────────

type Captured = { url: string; init: RequestInit; body: unknown };

/** A JSON Response with the given status + parsed JSON body + optional headers. */
function jsonResponse(
  body: unknown,
  opts: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  });
}

/** An SSE Response whose body carries one `data:` line holding the JSON-RPC msg. */
function sseResponse(
  body: unknown,
  opts: { headers?: Record<string, string> } = {},
): Response {
  const payload = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  return new Response(payload, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...(opts.headers ?? {}) },
  });
}

/** Build a fake fetch that records every call and dispatches by JSON-RPC method
 *  to the supplied responder. */
function recordingFetch(
  responder: (method: string, captured: Captured) => Response,
): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const body = bodyText ? JSON.parse(bodyText) : undefined;
    const captured: Captured = { url: String(url), init: init ?? {}, body };
    calls.push(captured);
    const method = (body as { method?: string } | undefined)?.method ?? "";
    return responder(method, captured);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const ENDPOINT = "https://api.postiz.test/mcp";

// ─── initialize ──────────────────────────────────────────────────────────────

describe("createMcpClient.initialize", () => {
  test("captures the Mcp-Session-Id header and sends notifications/initialized", async () => {
    const { fetchImpl, calls } = recordingFetch((method) => {
      if (method === "initialize") {
        return jsonResponse(
          { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: {} } },
          { headers: { "mcp-session-id": "sess-abc-123" } },
        );
      }
      // notifications/initialized → servers reply 202 Accepted, no body.
      return new Response(null, { status: 202 });
    });

    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k-secret", fetchImpl });
    await client.initialize();

    // Two calls: the initialize request, then the initialized notification.
    assert.equal(calls.length, 2);
    assert.equal((calls[0]!.body as { method: string }).method, "initialize");
    assert.equal((calls[1]!.body as { method: string }).method, "notifications/initialized");
    // The notification (and any later call) MUST echo the captured session id.
    const notifHeaders = new Headers(calls[1]!.init.headers as HeadersInit);
    assert.equal(notifHeaders.get("mcp-session-id"), "sess-abc-123");
    // Bearer auth on every request.
    const initHeaders = new Headers(calls[0]!.init.headers as HeadersInit);
    assert.equal(initHeaders.get("authorization"), "Bearer k-secret");
    // Accept advertises both JSON and SSE per the transport spec.
    assert.match(initHeaders.get("accept") ?? "", /application\/json/);
    assert.match(initHeaders.get("accept") ?? "", /text\/event-stream/);
  });

  test("works when the server assigns no session id (stateless server)", async () => {
    const { fetchImpl, calls } = recordingFetch((method) => {
      if (method === "initialize") {
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
      }
      return new Response(null, { status: 202 });
    });
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    await client.initialize();
    // No session id → later calls simply omit the header (no crash).
    const notifHeaders = new Headers(calls[1]!.init.headers as HeadersInit);
    assert.equal(notifHeaders.get("mcp-session-id"), null);
  });
});

// ─── listTools ───────────────────────────────────────────────────────────────

describe("createMcpClient.listTools", () => {
  test("parses { tools: [...] } into {name, description, inputSchema}[]", async () => {
    const { fetchImpl } = recordingFetch((method) => {
      if (method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              {
                name: "schedulePost",
                description: "Schedule a social post",
                inputSchema: { type: "object", properties: { text: { type: "string" } } },
              },
              { name: "listChannels", description: "List channels", inputSchema: { type: "object" } },
            ],
          },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
    });

    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    const tools = await client.listTools();
    assert.equal(tools.length, 2);
    assert.equal(tools[0]!.name, "schedulePost");
    assert.equal(tools[0]!.description, "Schedule a social post");
    assert.deepEqual(tools[0]!.inputSchema, {
      type: "object",
      properties: { text: { type: "string" } },
    });
    assert.equal(tools[1]!.name, "listChannels");
  });

  test("parses an SSE (text/event-stream) response body", async () => {
    const { fetchImpl } = recordingFetch((method) => {
      if (method === "tools/list") {
        return sseResponse({
          jsonrpc: "2.0",
          id: 2,
          result: { tools: [{ name: "t1", description: "d", inputSchema: { type: "object" } }] },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
    });
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    const tools = await client.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0]!.name, "t1");
  });
});

// ─── callTool ────────────────────────────────────────────────────────────────

describe("createMcpClient.callTool", () => {
  test("sends {name, arguments} and returns the content payload", async () => {
    let callBody: unknown;
    const { fetchImpl } = recordingFetch((method, captured) => {
      if (method === "tools/call") {
        callBody = captured.body;
        return jsonResponse({
          jsonrpc: "2.0",
          id: 3,
          result: { content: [{ type: "text", text: "scheduled!" }] },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
    });

    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    const out = (await client.callTool("schedulePost", { text: "hi" })) as {
      content: Array<{ type: string; text?: string }>;
    };
    // The wire params follow the spec: { name, arguments }.
    assert.deepEqual((callBody as { params: unknown }).params, {
      name: "schedulePost",
      arguments: { text: "hi" },
    });
    assert.equal(out.content[0]!.text, "scheduled!");
  });

  test("isError:true result → throws (mapped to an error, caught by the wrapper above)", async () => {
    const { fetchImpl } = recordingFetch((method) => {
      if (method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 3,
          result: { content: [{ type: "text", text: "channel not connected" }], isError: true },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
    });
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    await assert.rejects(() => client.callTool("schedulePost", {}), /channel not connected/);
  });

  test("a JSON-RPC error object → throws with the error message", async () => {
    const { fetchImpl } = recordingFetch((method) => {
      if (method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: 3,
          error: { code: -32602, message: "Invalid params" },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} });
    });
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    await assert.rejects(() => client.callTool("x", {}), /Invalid params/);
  });
});

// ─── transport error mapping ─────────────────────────────────────────────────

describe("createMcpClient transport errors", () => {
  test("non-2xx HTTP → throws a mapped error (status surfaced, no raw throw escapes)", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("nope", { status: 500 }));
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    await assert.rejects(() => client.listTools(), /500/);
  });

  test("malformed JSON body → throws a mapped error", async () => {
    const { fetchImpl } = recordingFetch(
      () =>
        new Response("{ not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createMcpClient({ endpoint: ENDPOINT, bearer: "k", fetchImpl });
    await assert.rejects(() => client.listTools(), /pars|json|unexpected/i);
  });
});

// ─── security: HTTPS-only ────────────────────────────────────────────────────

describe("createMcpClient HTTPS-only", () => {
  test("rejects a non-https endpoint at construction or first call (no fetch attempted)", async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    // Either the factory throws synchronously, or the first call rejects — both
    // are acceptable; what matters is fetch is NEVER reached for http://.
    await assert.rejects(async () => {
      const client = createMcpClient({ endpoint: "http://insecure.test/mcp", bearer: "k", fetchImpl });
      await client.listTools();
    }, /https/i);
    assert.equal(fetched, false, "fetch must not run for an http:// endpoint");
  });
});
