// Agent-marketplace MCP rental — tests for the PURE JSON-RPC 2.0 layer.
//
// The /api/v1/agents/[slug]/mcp endpoint speaks JSON-RPC 2.0 over Streamable
// HTTP, the SAME protocol our inline MCP client (lib/agents/mcp/client.ts)
// CONSUMES — so SF agents are reachable by the very protocol we use to reach
// other MCP servers. This module holds the dependency-free parse + route +
// response-shaping so the route handler is thin I/O + the agent run.
//
// What's verified:
//   - parseJsonRpcRequest: valid request, parse error (-32700), invalid
//     request shape (-32600), notification detection (no id).
//   - buildAskToolDescriptor: the ONE delegating tool, name "ask", with the
//     agent name + capabilities woven into the description + the required
//     { message, conversation_id? } inputSchema.
//   - buildInitializeResult / buildToolsListResult: protocolVersion, server
//     name = agent name, tools capability, the ask tool.
//   - extractAskArgs: pulls { message, conversationId } from tools/call params,
//     rejecting a wrong tool name (-32601) and bad/missing message (-32602).
//   - error/result envelope builders carry the request id + jsonrpc:"2.0".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseJsonRpcRequest,
  buildAskToolDescriptor,
  buildInitializeResult,
  buildToolsListResult,
  extractAskArgs,
  jsonRpcResult,
  jsonRpcError,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_PARSE_ERROR,
  JSONRPC_INVALID_REQUEST,
  MCP_PROTOCOL_VERSION,
  ASK_TOOL_NAME,
} from "../../../src/lib/marketplace/agent-mcp-rpc";

describe("parseJsonRpcRequest", () => {
  test("parses a well-formed request", () => {
    const parsed = parseJsonRpcRequest('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.request.id, 1);
      assert.equal(parsed.request.method, "tools/list");
      assert.equal(parsed.request.isNotification, false);
    }
  });

  test("non-JSON body → parse error (-32700)", () => {
    const parsed = parseJsonRpcRequest("not json {");
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error.code, JSONRPC_PARSE_ERROR);
  });

  test("missing method → invalid request (-32600)", () => {
    const parsed = parseJsonRpcRequest('{"jsonrpc":"2.0","id":1}');
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error.code, JSONRPC_INVALID_REQUEST);
  });

  test("a request with no id is a notification (no response expected)", () => {
    const parsed = parseJsonRpcRequest('{"jsonrpc":"2.0","method":"notifications/initialized"}');
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.request.isNotification, true);
      assert.equal(parsed.request.method, "notifications/initialized");
    }
  });

  test("string id is preserved", () => {
    const parsed = parseJsonRpcRequest('{"jsonrpc":"2.0","id":"abc","method":"initialize"}');
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.request.id, "abc");
  });
});

describe("buildAskToolDescriptor", () => {
  test("exposes ONE tool named ask with message required", () => {
    const tool = buildAskToolDescriptor({ agentName: "Sunset Receptionist", capabilities: ["book_appointment"] });
    assert.equal(tool.name, ASK_TOOL_NAME);
    assert.equal(tool.name, "ask");
    const schema = tool.inputSchema as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    assert.equal(schema.type, "object");
    assert.ok("message" in schema.properties);
    assert.ok("conversation_id" in schema.properties);
    assert.deepEqual(schema.required, ["message"]);
  });

  test("description names the agent and summarizes its capabilities", () => {
    const tool = buildAskToolDescriptor({
      agentName: "Sunset Receptionist",
      capabilities: ["look_up_availability", "book_appointment"],
    });
    assert.match(tool.description, /Sunset Receptionist/);
    // capabilities should be summarized in human terms somewhere in the blurb
    assert.match(tool.description.toLowerCase(), /book|availability|appointment/);
    assert.match(tool.description, /Returns the agent's reply/);
  });

  test("handles an agent with no declared capabilities gracefully", () => {
    const tool = buildAskToolDescriptor({ agentName: "Helper", capabilities: [] });
    assert.match(tool.description, /Helper/);
    // still a complete, non-empty sentence
    assert.ok(tool.description.length > 20);
  });
});

describe("buildInitializeResult", () => {
  test("returns protocolVersion, tools capability, and serverInfo named for the agent", () => {
    const result = buildInitializeResult({ agentName: "Sunset Receptionist" }) as {
      protocolVersion: string;
      capabilities: { tools?: unknown };
      serverInfo: { name: string; version: string };
    };
    assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.ok(result.capabilities.tools, "advertises the tools capability");
    assert.equal(result.serverInfo.name, "Sunset Receptionist");
    assert.ok(result.serverInfo.version);
  });
});

describe("buildToolsListResult", () => {
  test("wraps the ask descriptor under a tools array", () => {
    const result = buildToolsListResult({ agentName: "Helper", capabilities: ["provide_faq_answer"] }) as {
      tools: Array<{ name: string }>;
    };
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, "ask");
  });
});

describe("extractAskArgs", () => {
  test("pulls message + conversation_id from a tools/call params block", () => {
    const out = extractAskArgs({
      name: "ask",
      arguments: { message: "Do you have 2pm Friday?", conversation_id: "c-123" },
    });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.message, "Do you have 2pm Friday?");
      assert.equal(out.conversationId, "c-123");
    }
  });

  test("message-only is fine (conversation_id optional)", () => {
    const out = extractAskArgs({ name: "ask", arguments: { message: "hi" } });
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.conversationId, undefined);
  });

  test("unknown tool name → method-not-found (-32601)", () => {
    const out = extractAskArgs({ name: "delete_everything", arguments: { message: "x" } });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.error.code, JSONRPC_METHOD_NOT_FOUND);
  });

  test("missing/blank message → invalid params (-32602)", () => {
    const blank = extractAskArgs({ name: "ask", arguments: { message: "   " } });
    const missing = extractAskArgs({ name: "ask", arguments: {} });
    const wrongType = extractAskArgs({ name: "ask", arguments: { message: 42 } });
    assert.equal(blank.ok, false);
    assert.equal(missing.ok, false);
    assert.equal(wrongType.ok, false);
    if (!blank.ok) assert.equal(blank.error.code, JSONRPC_INVALID_PARAMS);
    if (!missing.ok) assert.equal(missing.error.code, JSONRPC_INVALID_PARAMS);
    if (!wrongType.ok) assert.equal(wrongType.error.code, JSONRPC_INVALID_PARAMS);
  });

  test("non-string conversation_id is ignored (treated as absent), message still used", () => {
    const out = extractAskArgs({ name: "ask", arguments: { message: "hi", conversation_id: 99 } });
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.conversationId, undefined);
  });
});

describe("jsonRpcResult / jsonRpcError envelopes", () => {
  test("result envelope carries jsonrpc 2.0 + the request id + the result", () => {
    const env = jsonRpcResult(7, { foo: "bar" }) as {
      jsonrpc: string;
      id: number;
      result: { foo: string };
    };
    assert.equal(env.jsonrpc, "2.0");
    assert.equal(env.id, 7);
    assert.deepEqual(env.result, { foo: "bar" });
  });

  test("error envelope carries jsonrpc 2.0 + the id + code/message", () => {
    const env = jsonRpcError("req-9", JSONRPC_METHOD_NOT_FOUND, "Method not found: foo") as {
      jsonrpc: string;
      id: string | number | null;
      error: { code: number; message: string };
    };
    assert.equal(env.jsonrpc, "2.0");
    assert.equal(env.id, "req-9");
    assert.equal(env.error.code, JSONRPC_METHOD_NOT_FOUND);
    assert.match(env.error.message, /Method not found/);
  });

  test("error envelope tolerates a null id (parse-error case)", () => {
    const env = jsonRpcError(null, JSONRPC_PARSE_ERROR, "Parse error") as { id: null };
    assert.equal(env.id, null);
  });
});
