// SeldonFrame Builder MCP — tests for the DI'd request handler.
//
// Drives the full JSON-RPC method dispatch end-to-end with FAKE deps (no DB,
// no network). This handler assumes auth ALREADY happened (the route runs
// guardApiRequest before ever building deps/calling this handler — see
// build-mcp-handler.ts's file header and the route spec for the 401 path).
// Focus here: method routing, tools/list shape, tools/call arg validation +
// bridge dispatch, structuredContent emission, and the fail-safe behavior when
// the bridge errors or the bridged route returns a non-2xx (a tool-level
// isError result with HTTP 200, never a transport 500).
//
// Pattern: dependency injection (the repo prefers DI over mock.module — see
// missed-call-textback.spec.ts / chatgpt-mcp-handler.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  handleBuildMcpRpc,
  type BuildMcpDeps,
  type BridgeResult,
} from "../../../../src/lib/build/mcp/build-mcp-handler";
import { JSONRPC_INVALID_PARAMS, JSONRPC_METHOD_NOT_FOUND } from "../../../../src/lib/build/mcp/build-mcp-rpc";
import type { BuildToolName } from "../../../../src/lib/build/mcp/build-mcp-rpc";

const NOW = new Date("2026-07-01T12:00:00Z");

type Harness = {
  deps: BuildMcpDeps;
  calls: Array<{ tool: BuildToolName; body: Record<string, unknown> }>;
};

function makeHarness(overrides?: {
  bridge?: BuildMcpDeps["bridge"];
  orgId?: string;
}): Harness {
  const calls: Array<{ tool: BuildToolName; body: Record<string, unknown> }> = [];

  const deps: BuildMcpDeps = {
    orgId: overrides?.orgId ?? "org-1",
    bridge:
      overrides?.bridge ??
      (async (tool, body) => {
        calls.push({ tool, body });
        const canned: Record<BuildToolName, BridgeResult> = {
          discover: { status: 200, json: { results: [{ id: "review-requester", type: "agent", name: "Review Requester", price: { type: "per_call", amountCents: 0 } }], count: 1 } },
          inspect: { status: 200, json: { id: "review-requester", type: "agent", name: "Review Requester", description: "Texts happy customers.", inputSchema: { type: "object", properties: {} }, price: { type: "per_call", amountCents: 0 } } },
          run: { status: 200, json: { runId: "run_abc", status: "completed", output: { reply: "hi" }, price: { type: "per_call", amountCents: 0 }, billing: { calculatedCost: 0, amountCents: 0, feeCents: 0, netCents: 0, charged: false, recorded: false } } },
        };
        return canned[tool];
      }),
    now: () => NOW,
  };

  return { deps, calls };
}

function rpc(method: string, params?: unknown, id: number | string | null = 1) {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) body.id = id;
  if (params !== undefined) body.params = params;
  return JSON.stringify(body);
}

// ─── transport / lifecycle ───────────────────────────────────────────────────

describe("handleBuildMcpRpc — lifecycle", () => {
  test("parse error → JSON-RPC -32700, status 200", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc("not json", deps);
    assert.equal(out.status, 200);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, -32700);
  });

  test("initialize → serverInfo name SeldonFrame, tools capability, protocol version", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("initialize"), deps);
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal((result.serverInfo as { name?: string }).name, "SeldonFrame");
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.deepEqual(result.capabilities, { tools: {} });
  });

  test("initialize → includes descriptive instructions naming the discover/inspect/run flow", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("initialize"), deps);
    const result = (out.body as { result?: { instructions?: string } }).result!;
    assert.match(result.instructions ?? "", /discover/);
    assert.match(result.instructions ?? "", /inspect/);
    assert.match(result.instructions ?? "", /run/);
  });

  test("ping → empty result", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("ping"), deps);
    assert.deepEqual((out.body as { result?: unknown }).result, {});
  });

  test("notification (no id) → 202 + null body", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("notifications/initialized", undefined, null), deps);
    assert.equal(out.status, 202);
    assert.equal(out.body, null);
  });

  test("unknown method → -32601", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("does/not/exist"), deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_METHOD_NOT_FOUND);
  });

  test("tools/list → exactly the 3 builder tools with real inputSchemas", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/list"), deps);
    const tools = (out.body as { result?: { tools?: Array<{ name: string; inputSchema?: unknown }> } }).result?.tools ?? [];
    assert.equal(tools.length, 3);
    assert.deepEqual(tools.map((t) => t.name).sort(), ["discover", "inspect", "run"]);
    for (const t of tools) {
      assert.equal(typeof t.inputSchema, "object");
    }
  });
});

// ─── tools/call: discover ────────────────────────────────────────────────────

describe("handleBuildMcpRpc — discover", () => {
  test("bridges to the discover route and relays results in content + structuredContent", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "discover", arguments: { query: "reviews", limit: 5 } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].tool, "discover");
    assert.deepEqual(h.calls[0].body, { query: "reviews", limit: 5 });

    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /review-requester/);
    const structured = result.structuredContent as { results?: unknown[] };
    assert.equal(structured.results?.length, 1);
  });

  test("empty args discover is allowed (both fields optional)", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { name: "discover", arguments: {} }), h.deps);
    assert.equal(out.status, 200);
    assert.deepEqual(h.calls[0].body, { query: undefined, limit: undefined });
  });
});

// ─── tools/call: inspect ─────────────────────────────────────────────────────

describe("handleBuildMcpRpc — inspect", () => {
  test("bridges to the inspect route with type + id", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "inspect", arguments: { type: "agent", id: "review-requester" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.deepEqual(h.calls[0].body, { type: "agent", id: "review-requester" });
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const structured = result.structuredContent as { inputSchema?: unknown };
    assert.equal(typeof structured.inputSchema, "object");
  });

  test("missing type → -32602, bridge not called", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { name: "inspect", arguments: { id: "x" } }), h.deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.calls.length, 0);
  });

  test("missing id → -32602, bridge not called", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { name: "inspect", arguments: { type: "agent" } }), h.deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.calls.length, 0);
  });

  test("invalid type ('widget') → -32602, bridge not called", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "inspect", arguments: { type: "widget", id: "x" } }),
      h.deps,
    );
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.calls.length, 0);
  });
});

// ─── tools/call: run ─────────────────────────────────────────────────────────

describe("handleBuildMcpRpc — run", () => {
  test("bridges to the run route with type + id + input", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "run", arguments: { type: "agent", id: "review-requester", input: { message: "hi" } } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.deepEqual(h.calls[0].body, { type: "agent", id: "review-requester", input: { message: "hi" } });
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const structured = result.structuredContent as { runId?: string; billing?: { charged?: boolean } };
    assert.equal(structured.runId, "run_abc");
    assert.equal(structured.billing?.charged, false);
  });

  test("missing input defaults to {}", async () => {
    const h = makeHarness();
    await handleBuildMcpRpc(rpc("tools/call", { name: "run", arguments: { type: "tool", id: "GMAIL_SEND_EMAIL" } }), h.deps);
    assert.deepEqual(h.calls[0].body, { type: "tool", id: "GMAIL_SEND_EMAIL", input: {} });
  });

  test("missing id → -32602, bridge not called", async () => {
    const h = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { name: "run", arguments: { type: "agent" } }), h.deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.calls.length, 0);
  });

  test("a non-2xx bridge result (e.g. 402 insufficient balance) → tool-level isError, HTTP 200", async () => {
    const h = makeHarness({
      bridge: async () => ({
        status: 402,
        json: { runId: "run_x", status: "insufficient_balance", error: "Insufficient wallet balance. Top up at /build/wallet to run this." },
      }),
    });
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "run", arguments: { type: "agent", id: "review-requester" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /Insufficient wallet balance/);
    // structuredContent still carries the full bridged body for programmatic use.
    const structured = result.structuredContent as { status?: string };
    assert.equal(structured.status, "insufficient_balance");
  });

  test("a throwing bridge (network failure) → isError text result, status 200 (not a 500)", async () => {
    const h = makeHarness({
      bridge: async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      },
    });
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "run", arguments: { type: "agent", id: "review-requester" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /ECONNREFUSED/);
  });

  test("a 404 bridge result with no error field → generic status message, still isError", async () => {
    const h = makeHarness({
      bridge: async () => ({ status: 404, json: {} }),
    });
    const out = await handleBuildMcpRpc(
      rpc("tools/call", { name: "run", arguments: { type: "agent", id: "unknown-slug" } }),
      h.deps,
    );
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /404/);
  });
});

// ─── tools/call: bad tool name ───────────────────────────────────────────────

describe("handleBuildMcpRpc — bad tool name", () => {
  test("unknown tool → -32601", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { name: "frobnicate", arguments: {} }), deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_METHOD_NOT_FOUND);
  });

  test("missing tool name → a transport error, not a crash", async () => {
    const { deps } = makeHarness();
    const out = await handleBuildMcpRpc(rpc("tools/call", { arguments: {} }), deps);
    const code = (out.body as { error?: { code?: number } }).error?.code;
    assert.equal(code, JSONRPC_METHOD_NOT_FOUND);
  });
});
