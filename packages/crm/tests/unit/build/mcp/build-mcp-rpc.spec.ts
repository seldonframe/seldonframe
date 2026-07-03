// SeldonFrame Builder MCP — tests for the PURE wire layer.
//
// Everything under test here is pure (no db, no env, no I/O): the tools/list
// descriptors for discover/inspect/run, the per-tool arg parsers/validators,
// the initialize result shape, and the 401 JSON-RPC error body builder.
// Mirrors the rental MCP's agent-mcp-rpc.spec.ts / the ChatGPT app's
// chatgpt-mcp-rpc.spec.ts shape (node:test + node:assert/strict, DI-free pure
// functions).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBuildInitializeResult,
  buildBuildToolsList,
  parseDiscoverArgs,
  parseInspectArgs,
  parseRunArgs,
  DISCOVER_TOOL,
  INSPECT_TOOL,
  RUN_TOOL,
} from "../../../../src/lib/build/mcp/build-mcp-rpc";
import { unauthorizedRpcBody } from "../../../../src/lib/build/mcp/build-mcp-handler";

// ─── initialize ──────────────────────────────────────────────────────────────

describe("buildBuildInitializeResult", () => {
  test("advertises tools-only capabilities + SeldonFrame serverInfo", () => {
    const result = buildBuildInitializeResult();
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.deepEqual(result.capabilities, { tools: {} });
    assert.equal((result.serverInfo as { name?: string }).name, "SeldonFrame");
  });

  test("instructions mention the discover -> inspect -> run flow and billing safety", () => {
    const result = buildBuildInitializeResult();
    const instructions = result.instructions as string;
    assert.match(instructions, /discover/);
    assert.match(instructions, /inspect/);
    assert.match(instructions, /run/i);
    assert.match(instructions, /never charges a card/i);
  });
});

// ─── tools/list ──────────────────────────────────────────────────────────────

describe("buildBuildToolsList", () => {
  test("exposes exactly discover, inspect, run", () => {
    const { tools } = buildBuildToolsList();
    assert.equal(tools.length, 3);
    assert.deepEqual(tools.map((t) => t.name).sort(), [DISCOVER_TOOL, INSPECT_TOOL, RUN_TOOL].sort());
    for (const tool of tools) {
      assert.ok(tool.description.length > 0, `${tool.name} has a description`);
      assert.equal((tool.inputSchema as { type?: string }).type, "object");
    }
  });

  test("discover takes optional query + limit (no required fields)", () => {
    const tool = buildBuildToolsList().tools.find((t) => t.name === DISCOVER_TOOL)!;
    const schema = tool.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.ok(!schema.required || schema.required.length === 0);
    assert.ok("query" in schema.properties);
    assert.ok("limit" in schema.properties);
  });

  test("inspect requires type + id", () => {
    const tool = buildBuildToolsList().tools.find((t) => t.name === INSPECT_TOOL)!;
    const schema = tool.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.deepEqual([...(schema.required ?? [])].sort(), ["id", "type"]);
  });

  test("run requires type + id, declares optional input", () => {
    const tool = buildBuildToolsList().tools.find((t) => t.name === RUN_TOOL)!;
    const schema = tool.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    assert.deepEqual([...(schema.required ?? [])].sort(), ["id", "type"]);
    assert.ok("input" in schema.properties);
  });
});

// ─── arg parsing: discover ───────────────────────────────────────────────────

describe("parseDiscoverArgs", () => {
  test("both fields absent -> ok, both undefined", () => {
    const result = parseDiscoverArgs({});
    assert.deepEqual(result, { ok: true, value: { query: undefined, limit: undefined } });
  });

  test("passes through a string query + numeric limit", () => {
    const result = parseDiscoverArgs({ query: "reviews", limit: 3 });
    assert.deepEqual(result, { ok: true, value: { query: "reviews", limit: 3 } });
  });

  test("a non-positive or non-finite limit is dropped (undefined), not passed through", () => {
    const negative = parseDiscoverArgs({ limit: -5 });
    assert.equal(negative.ok && negative.value.limit, undefined);
    const zero = parseDiscoverArgs({ limit: 0 });
    assert.equal(zero.ok && zero.value.limit, undefined);
    const infinite = parseDiscoverArgs({ limit: Number.POSITIVE_INFINITY });
    assert.equal(infinite.ok && infinite.value.limit, undefined);
  });

  test("a fractional limit is floored", () => {
    const result = parseDiscoverArgs({ limit: 4.9 });
    assert.equal(result.ok && result.value.limit, 4);
  });

  test("a non-string query is dropped (undefined)", () => {
    const result = parseDiscoverArgs({ query: 123 });
    assert.equal(result.ok && result.value.query, undefined);
  });
});

// ─── arg parsing: inspect ────────────────────────────────────────────────────

describe("parseInspectArgs", () => {
  test("valid agent type + id -> ok", () => {
    const result = parseInspectArgs({ type: "agent", id: "review-requester" });
    assert.deepEqual(result, { ok: true, value: { type: "agent", id: "review-requester" } });
  });

  test("valid tool type + id -> ok", () => {
    const result = parseInspectArgs({ type: "tool", id: "GMAIL_SEND_EMAIL" });
    assert.deepEqual(result, { ok: true, value: { type: "tool", id: "GMAIL_SEND_EMAIL" } });
  });

  test("missing type -> error, bridge-safe (does not throw)", () => {
    const result = parseInspectArgs({ id: "x" });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /type/);
  });

  test("invalid type ('widget') -> error", () => {
    const result = parseInspectArgs({ type: "widget", id: "x" });
    assert.equal(result.ok, false);
  });

  test("missing id -> error", () => {
    const result = parseInspectArgs({ type: "agent" });
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /id/);
  });

  test("blank id -> error", () => {
    const result = parseInspectArgs({ type: "agent", id: "   " });
    assert.equal(result.ok, false);
  });

  test("id is trimmed", () => {
    const result = parseInspectArgs({ type: "agent", id: "  review-requester  " });
    assert.equal(result.ok && result.value.id, "review-requester");
  });
});

// ─── arg parsing: run ────────────────────────────────────────────────────────

describe("parseRunArgs", () => {
  test("valid type + id + input -> ok", () => {
    const result = parseRunArgs({ type: "agent", id: "review-requester", input: { message: "hi" } });
    assert.deepEqual(result, { ok: true, value: { type: "agent", id: "review-requester", input: { message: "hi" } } });
  });

  test("missing input defaults to {}", () => {
    const result = parseRunArgs({ type: "tool", id: "GMAIL_SEND_EMAIL" });
    assert.deepEqual(result.ok && result.value.input, {});
  });

  test("a non-object input (array/string/number) falls back to {}", () => {
    const arrayInput = parseRunArgs({ type: "agent", id: "x", input: [1, 2] });
    assert.deepEqual(arrayInput.ok && arrayInput.value.input, {});
    const stringInput = parseRunArgs({ type: "agent", id: "x", input: "oops" });
    assert.deepEqual(stringInput.ok && stringInput.value.input, {});
  });

  test("missing type -> error", () => {
    const result = parseRunArgs({ id: "x" });
    assert.equal(result.ok, false);
  });

  test("missing id -> error", () => {
    const result = parseRunArgs({ type: "agent" });
    assert.equal(result.ok, false);
  });
});

// ─── 401 body (route-level auth-gate shaping) ────────────────────────────────

describe("unauthorizedRpcBody", () => {
  test("shapes a JSON-RPC error envelope naming the bearer requirement", () => {
    const body = unauthorizedRpcBody();
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.id, null);
    const error = body.error as { code: number; message: string };
    assert.equal(typeof error.code, "number");
    assert.match(error.message, /wst_/);
    assert.match(error.message, /Bearer/);
  });

  // OAuth plan Task 14 — the 401 gains a WWW-Authenticate header pointing at
  // the RFC 9728 protected-resource metadata document when SF_OAUTH_ENABLED
  // is "true", and stays byte-identical to the pre-OAuth shape (no header,
  // same JSON-RPC body) when the flag is off. Exercised through the REAL
  // route handler: the no-auth guard path never touches the DB (no bearer →
  // no lookup; missing x-org-id short-circuits before any query), so POSTing
  // a headerless Request is safe under node:test.
  test("route 401 carries WWW-Authenticate resource_metadata when SF_OAUTH_ENABLED=true, with the JSON-RPC body unchanged", async () => {
    const { POST } = await import("../../../../src/app/api/mcp/v1/route");
    const previous = process.env.SF_OAUTH_ENABLED;
    try {
      process.env.SF_OAUTH_ENABLED = "true";
      const response = await POST(
        new Request("http://localhost/api/mcp/v1", { method: "POST", body: "{}" })
      );
      assert.equal(response.status, 401);
      assert.equal(
        response.headers.get("www-authenticate"),
        'Bearer resource_metadata="https://mcp.seldonframe.com/.well-known/oauth-protected-resource"'
      );
      // The body is the exact canonical envelope — the header is ADDITIVE.
      assert.deepEqual(await response.json(), unauthorizedRpcBody());
    } finally {
      if (previous === undefined) delete process.env.SF_OAUTH_ENABLED;
      else process.env.SF_OAUTH_ENABLED = previous;
    }
  });

  test("route 401 has NO WWW-Authenticate header when the flag is off (pre-OAuth shape, body byte-identical)", async () => {
    const { POST } = await import("../../../../src/app/api/mcp/v1/route");
    const previous = process.env.SF_OAUTH_ENABLED;
    try {
      delete process.env.SF_OAUTH_ENABLED;
      const response = await POST(
        new Request("http://localhost/api/mcp/v1", { method: "POST", body: "{}" })
      );
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.deepEqual(await response.json(), unauthorizedRpcBody());
    } finally {
      if (previous === undefined) delete process.env.SF_OAUTH_ENABLED;
      else process.env.SF_OAUTH_ENABLED = previous;
    }
  });
});
