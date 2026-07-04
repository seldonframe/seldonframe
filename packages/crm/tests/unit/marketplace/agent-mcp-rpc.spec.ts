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
  buildTasteToolsListResult,
  GROUND_TOOL_NAME,
  extractAskArgs,
  jsonRpcResult,
  jsonRpcError,
  buildPromptsListResult,
  buildPromptGetResult,
  parsePromptsGetParams,
  buildDeterministicToolDescriptors,
  executeDeterministicTool,
  GET_QUOTE_RANGE_TOOL_NAME,
  PROVIDE_FAQ_ANSWER_TOOL_NAME,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_PARSE_ERROR,
  JSONRPC_INVALID_REQUEST,
  MCP_PROTOCOL_VERSION,
  ASK_TOOL_NAME,
} from "../../../src/lib/marketplace/agent-mcp-rpc";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

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
  test("wraps the deterministic tools + the ask descriptor under a tools array", () => {
    const result = buildToolsListResult({ agentName: "Helper", capabilities: ["provide_faq_answer"] }) as {
      tools: Array<{ name: string }>;
    };
    // Deterministic rental tools (zero owner compute) + the optional `ask`.
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes("ask"));
    assert.ok(names.includes("get_quote_range"));
    assert.ok(names.includes("provide_faq_answer"));
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

// ─── rental tools model (BUILD #1) ───────────────────────────────────────────
//
// The "renter brings the fuel" surface: the agent's SKILL becomes an MCP prompt
// (prompts/list + prompts/get returning blueprint.customSkillMd) and its
// DETERMINISTIC, blueprint-carried capabilities become tools (get_quote_range +
// provide_faq_answer) the renter's OWN LLM drives — zero compute cost to the
// agent owner. Workspace-stateful tools (book/CRM-write) are NOT exposed (they'd
// write to the creator's workspace) — they stay install-only.

const SKILL_MD = "# Sunset Receptionist playbook\nGreet warmly. Quote ranges, never firm prices. Book Mon–Fri.";

const RENTAL_BLUEPRINT: AgentBlueprint = {
  capabilities: ["look_up_availability", "book_appointment", "get_quote_range", "provide_faq_answer"],
  customSkillMd: SKILL_MD,
  quoteRanges: [
    { service: "Furnace repair", low: 150, high: 600, note: "depends on the part" },
    { service: "AC tune-up", low: 89, high: 129 },
  ],
  faq: [
    { q: "Do you offer emergency service?", a: "Yes, 24/7 for existing customers." },
    { q: "What areas do you serve?", a: "All of the greater Phoenix metro." },
  ],
};

describe("buildPromptsListResult — the agent's skill as ONE MCP prompt", () => {
  test("returns a single act_as_<slug> prompt with no required arguments", () => {
    const result = buildPromptsListResult({
      slug: "sunset-receptionist",
      agentName: "Sunset Receptionist",
      capabilities: RENTAL_BLUEPRINT.capabilities,
    }) as { prompts: Array<{ name: string; description: string; arguments: unknown[] }> };
    assert.equal(result.prompts.length, 1);
    assert.equal(result.prompts[0].name, "act_as_sunset-receptionist");
    // Names the agent + tells the renter what it can do.
    assert.match(result.prompts[0].description, /Sunset Receptionist/);
    assert.deepEqual(result.prompts[0].arguments, []);
  });
});

describe("parsePromptsGetParams — extract + validate the requested prompt name", () => {
  test("pulls a string name", () => {
    const out = parsePromptsGetParams({ name: "act_as_sunset-receptionist" });
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.name, "act_as_sunset-receptionist");
  });

  test("missing/blank/non-string name → invalid params (-32602)", () => {
    const missing = parsePromptsGetParams({});
    const blank = parsePromptsGetParams({ name: "  " });
    const wrongType = parsePromptsGetParams({ name: 7 });
    assert.equal(missing.ok, false);
    assert.equal(blank.ok, false);
    assert.equal(wrongType.ok, false);
    if (!missing.ok) assert.equal(missing.error.code, JSONRPC_INVALID_PARAMS);
    if (!blank.ok) assert.equal(blank.error.code, JSONRPC_INVALID_PARAMS);
    if (!wrongType.ok) assert.equal(wrongType.error.code, JSONRPC_INVALID_PARAMS);
  });
});

describe("buildPromptGetResult — the playbook (customSkillMd) as the prompt body", () => {
  test("returns a single message whose text carries the customSkillMd + a framing line", () => {
    const out = buildPromptGetResult({
      slug: "sunset-receptionist",
      agentName: "Sunset Receptionist",
      blueprint: RENTAL_BLUEPRINT,
    });
    assert.ok(out.ok, "a known/derived name resolves");
    if (!out.ok) return;
    const result = out.result as {
      description?: string;
      messages: Array<{ role: string; content: { type: string; text: string } }>;
    };
    assert.equal(result.messages.length, 1);
    const msg = result.messages[0];
    // A user OR assistant role message (MCP allows both); text is the playbook.
    assert.ok(msg.role === "user" || msg.role === "assistant");
    assert.equal(msg.content.type, "text");
    // The actual skill md is embedded verbatim.
    assert.ok(msg.content.text.includes(SKILL_MD), "embeds the customSkillMd verbatim");
    // The one-line framing names the agent + lists the deterministic tool names.
    assert.match(msg.content.text, /You are Sunset Receptionist/);
    assert.match(msg.content.text, /get_quote_range/);
    assert.match(msg.content.text, /provide_faq_answer/);
  });

  test("falls back to a sensible skill body when customSkillMd is empty", () => {
    const out = buildPromptGetResult({
      slug: "helper",
      agentName: "Helper",
      blueprint: { capabilities: ["provide_faq_answer"] },
    });
    assert.ok(out.ok);
    if (!out.ok) return;
    const result = out.result as { messages: Array<{ content: { text: string } }> };
    // Still a non-empty, agent-named instruction even with no playbook prose.
    assert.match(result.messages[0].content.text, /Helper/);
    assert.ok(result.messages[0].content.text.length > 20);
  });
});

describe("buildDeterministicToolDescriptors — quote/faq ONLY (no stateful tools)", () => {
  test("advertises get_quote_range + provide_faq_answer with real input schemas", () => {
    const tools = buildDeterministicToolDescriptors({ agentName: "Sunset Receptionist" });
    const names = tools.map((t) => t.name);
    assert.deepEqual(names.sort(), [GET_QUOTE_RANGE_TOOL_NAME, PROVIDE_FAQ_ANSWER_TOOL_NAME].sort());
    for (const tool of tools) {
      const schema = tool.inputSchema as { type: string; properties: Record<string, unknown>; required: string[] };
      assert.equal(schema.type, "object");
      assert.ok(schema.required.length >= 1, `${tool.name} requires an argument`);
      assert.ok(tool.description.length > 10);
    }
  });

  test("does NOT advertise workspace-stateful tools (book/availability/CRM)", () => {
    const names = buildDeterministicToolDescriptors({ agentName: "X" }).map((t) => t.name);
    assert.ok(!names.includes("book_appointment"));
    assert.ok(!names.includes("look_up_availability"));
    assert.ok(!names.includes("take_message"));
  });
});

describe("executeDeterministicTool — pure server-side lookups, NO LLM", () => {
  test("get_quote_range returns the blueprint's range (case-insensitive match)", () => {
    const out = executeDeterministicTool(
      GET_QUOTE_RANGE_TOOL_NAME,
      { service: "furnace repair" },
      RENTAL_BLUEPRINT,
    );
    assert.equal(out.ok, true);
    if (!out.ok) return;
    const payload = out.result as { hasRange: boolean; low?: number; high?: number; note?: string };
    assert.equal(payload.hasRange, true);
    assert.equal(payload.low, 150);
    assert.equal(payload.high, 600);
    assert.match(String(payload.note), /part/);
  });

  test("get_quote_range for an unpriced service → hasRange:false (never guesses)", () => {
    const out = executeDeterministicTool(GET_QUOTE_RANGE_TOOL_NAME, { service: "spaceship detailing" }, RENTAL_BLUEPRINT);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.result, { hasRange: false });
  });

  test("provide_faq_answer returns the best blueprint FAQ match for the question", () => {
    const out = executeDeterministicTool(
      PROVIDE_FAQ_ANSWER_TOOL_NAME,
      { question: "what areas do you serve?" },
      RENTAL_BLUEPRINT,
    );
    assert.equal(out.ok, true);
    if (!out.ok) return;
    const payload = out.result as { matches: Array<{ question: string; answer: string; score: number }> };
    assert.ok(payload.matches.length >= 1);
    assert.match(payload.matches[0].answer, /Phoenix metro/);
    assert.ok(payload.matches[0].score > 0);
  });

  test("provide_faq_answer with no relevant match returns an empty match set (no hallucination)", () => {
    const out = executeDeterministicTool(
      PROVIDE_FAQ_ANSWER_TOOL_NAME,
      { question: "zzzzz totally unrelated quantum" },
      RENTAL_BLUEPRINT,
    );
    assert.equal(out.ok, true);
    if (!out.ok) return;
    const payload = out.result as { matches: unknown[] };
    assert.equal(payload.matches.length, 0);
  });

  test("get_quote_range with a missing/blank service → invalid params (-32602)", () => {
    const out = executeDeterministicTool(GET_QUOTE_RANGE_TOOL_NAME, { service: "  " }, RENTAL_BLUEPRINT);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.error.code, JSONRPC_INVALID_PARAMS);
  });

  test("an unknown deterministic tool name → method-not-found (-32601)", () => {
    const out = executeDeterministicTool("wipe_db", { x: 1 }, RENTAL_BLUEPRINT);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.error.code, JSONRPC_METHOD_NOT_FOUND);
  });
});

describe("buildToolsListResult — now lists ask + the deterministic tools", () => {
  test("includes ask, get_quote_range, provide_faq_answer (and NOT book_appointment)", () => {
    const result = buildToolsListResult({
      agentName: "Sunset Receptionist",
      capabilities: RENTAL_BLUEPRINT.capabilities,
    }) as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes(ASK_TOOL_NAME));
    assert.ok(names.includes(GET_QUOTE_RANGE_TOOL_NAME));
    assert.ok(names.includes(PROVIDE_FAQ_ANSWER_TOOL_NAME));
    assert.ok(!names.includes("book_appointment"));
  });
});

describe("buildAskToolDescriptor — relabelled as the owner's-compute path", () => {
  test("description makes clear it delegates to the live agent on the owner's compute", () => {
    const tool = buildAskToolDescriptor({ agentName: "Sunset Receptionist", capabilities: ["book_appointment"] });
    assert.match(tool.description.toLowerCase(), /owner|compute|live/);
  });
});

describe("MCP tool annotations — claude.ai connector-directory prereq", () => {
  test("every tool in the paid tools/list carries annotations", () => {
    const result = buildToolsListResult({
      agentName: "Sunset Receptionist",
      capabilities: RENTAL_BLUEPRINT.capabilities,
    }) as { tools: Array<{ name: string; annotations?: Record<string, unknown> }> };
    for (const tool of result.tools) {
      assert.ok(tool.annotations, `${tool.name} has annotations`);
      assert.equal(typeof tool.annotations!.readOnlyHint, "boolean", `${tool.name}.readOnlyHint is boolean`);
      assert.equal(typeof tool.annotations!.destructiveHint, "boolean", `${tool.name}.destructiveHint is boolean`);
      assert.equal(typeof tool.annotations!.idempotentHint, "boolean", `${tool.name}.idempotentHint is boolean`);
      assert.equal(typeof tool.annotations!.openWorldHint, "boolean", `${tool.name}.openWorldHint is boolean`);
      assert.ok(tool.annotations!.title, `${tool.name} has a title`);
    }
  });

  test("every tool in the taste tools/list carries annotations (incl. ground_on_my_business)", () => {
    const result = buildTasteToolsListResult({
      agentName: "Sunset Receptionist",
      capabilities: RENTAL_BLUEPRINT.capabilities,
      visitorLimit: 5,
    }) as { tools: Array<{ name: string; annotations?: Record<string, unknown> }> };
    assert.ok(result.tools.some((t) => t.name === GROUND_TOOL_NAME));
    for (const tool of result.tools) {
      assert.ok(tool.annotations, `${tool.name} has annotations`);
    }
  });

  test("get_quote_range and provide_faq_answer are read-only + idempotent (pure blueprint lookups)", () => {
    const tools = buildDeterministicToolDescriptors({ agentName: "Sunset Receptionist" });
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name}.readOnlyHint`);
      assert.equal(tool.annotations?.idempotentHint, true, `${tool.name}.idempotentHint`);
      assert.equal(tool.annotations?.destructiveHint, false, `${tool.name}.destructiveHint`);
    }
  });

  test("ask is not read-only (it writes conversation rows) but is non-destructive", () => {
    const tool = buildAskToolDescriptor({ agentName: "Sunset Receptionist", capabilities: ["book_appointment"] });
    assert.equal(tool.annotations?.readOnlyHint, false);
    assert.equal(tool.annotations?.destructiveHint, false);
  });
});
