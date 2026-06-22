// Runtime seam — merge MCP tools into the tool set (TDD).
//
// The whole connector feature funnels through ONE seam: getToolsForCapabilities.
// It becomes async and, AFTER the native (capability-filtered) tools, appends
// each bound connector's enabled+cached tools wrapped as AgentTools. The
// Anthropic tool loop + dispatch are otherwise untouched — a wrapped MCP tool is
// indistinguishable from a native one ({name, description, inputSchema,
// jsonSchema, execute}).
//
// THE MOST IMPORTANT TEST HERE is the regression guard: with NO connectors the
// seam returns the IDENTICAL native list it does today (same tools, same order,
// same object references). That proves the live voice/web/SMS agents are
// unaffected.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ALL_TOOLS,
  getToolsForCapabilities,
  type AgentTool,
  type ToolExecuteContext,
} from "../../../../src/lib/agents/tools";
import { wrapMcpTool, type WrapMcpDeps } from "../../../../src/lib/agents/mcp/wrap-tool";
import type { ConnectorBinding, McpToolSchema } from "../../../../src/lib/agents/mcp/connectors";

const CTX: ToolExecuteContext = {
  orgId: "org-42",
  orgSlug: "acme",
  agentId: "agt-1",
  conversationId: "conv-1",
  testMode: false,
};

const SCHEDULE_TOOL: McpToolSchema = {
  name: "schedulePost",
  description: "Schedule a social post",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
};
const LIST_TOOL: McpToolSchema = {
  name: "listChannels",
  description: "List channels",
  inputSchema: { type: "object" },
};

function postizBinding(enabled: string[], tools: McpToolSchema[]): ConnectorBinding {
  return { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: enabled, tools };
}

// ─── wrapMcpTool ─────────────────────────────────────────────────────────────

describe("wrapMcpTool", () => {
  test("namespaces the tool name as `${serviceName}__${toolName}` and copies the schema", () => {
    const binding = postizBinding(["schedulePost"], [SCHEDULE_TOOL]);
    const deps: WrapMcpDeps = {
      getSecret: async () => "k",
      makeClient: () => ({
        initialize: async () => {},
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
      }),
    };
    const tool = wrapMcpTool(binding, SCHEDULE_TOOL, deps);
    assert.equal(tool.name, "postiz__schedulePost");
    assert.equal(tool.description, "Schedule a social post");
    assert.deepEqual(tool.jsonSchema, SCHEDULE_TOOL.inputSchema);
  });

  test("execute() resolves the bearer via getSecret(orgId, serviceName), builds a client at the resolved endpoint, and calls callTool(toolName, input)", async () => {
    const seen: { secret?: [string, string]; endpoint?: string; bearer?: string; call?: [string, unknown] } = {};
    const binding = postizBinding(["schedulePost"], [SCHEDULE_TOOL]);
    const deps: WrapMcpDeps = {
      getSecret: async (orgId, serviceName) => {
        seen.secret = [orgId, serviceName];
        return "postiz-key";
      },
      makeClient: (endpoint, bearer) => {
        seen.endpoint = endpoint;
        seen.bearer = bearer;
        return {
          initialize: async () => {},
          listTools: async () => [],
          callTool: async (name, args) => {
            seen.call = [name, args];
            return { content: [{ type: "text", text: "ok" }] };
          },
        };
      },
    };
    const tool = wrapMcpTool(binding, SCHEDULE_TOOL, deps);
    const out = await (tool as AgentTool<unknown, unknown>).execute({ text: "hi" }, CTX);

    assert.deepEqual(seen.secret, ["org-42", "postiz"], "getSecret(orgId, serviceName)");
    assert.equal(seen.endpoint, "https://api.postiz.com/mcp", "client built at the vetted endpoint");
    assert.equal(seen.bearer, "postiz-key", "client gets the decrypted bearer");
    assert.deepEqual(seen.call, ["schedulePost", { text: "hi" }], "callTool(unNamespacedName, input)");
    assert.deepEqual(out, { content: [{ type: "text", text: "ok" }] });
  });

  test("a missing secret → execute throws (the runtime loop maps it to an error tool_result)", async () => {
    const binding = postizBinding(["schedulePost"], [SCHEDULE_TOOL]);
    const deps: WrapMcpDeps = {
      getSecret: async () => null, // no key stored
      makeClient: () => {
        throw new Error("must not build a client without a key");
      },
    };
    const tool = wrapMcpTool(binding, SCHEDULE_TOOL, deps);
    await assert.rejects(() => (tool as AgentTool<unknown, unknown>).execute({}, CTX), /key|secret|credential/i);
  });
});

// ─── getToolsForCapabilities: regression guard (MOST IMPORTANT) ───────────────

describe("getToolsForCapabilities — native path is byte-for-byte unchanged", () => {
  test("no opts → returns the full native ALL_TOOLS (same refs, same order)", async () => {
    const tools = await getToolsForCapabilities(undefined);
    assert.deepEqual(
      tools.map((t) => t.name),
      ALL_TOOLS.map((t) => t.name),
    );
    // Same object references — no copying / re-wrapping of native tools.
    for (let i = 0; i < ALL_TOOLS.length; i++) {
      assert.equal(tools[i], ALL_TOOLS[i], `native tool ${i} must be the same reference`);
    }
  });

  test("capability filter still works identically + no connectors appended", async () => {
    const caps = ["look_up_availability", "book_appointment"];
    const tools = await getToolsForCapabilities(caps);
    assert.deepEqual(tools.map((t) => t.name), caps);
  });

  test("connectors: undefined / [] → IDENTICAL to native (regression guard)", async () => {
    const caps = ["look_up_availability"];
    const withUndef = await getToolsForCapabilities(caps, { orgId: "o", connectors: undefined });
    const withEmpty = await getToolsForCapabilities(caps, { orgId: "o", connectors: [] });
    const native = await getToolsForCapabilities(caps);
    assert.deepEqual(withUndef.map((t) => t.name), native.map((t) => t.name));
    assert.deepEqual(withEmpty.map((t) => t.name), native.map((t) => t.name));
  });
});

// ─── getToolsForCapabilities: with connectors ─────────────────────────────────

describe("getToolsForCapabilities — appends bound MCP tools", () => {
  const deps: WrapMcpDeps = {
    getSecret: async () => "k",
    makeClient: () => ({
      initialize: async () => {},
      listTools: async () => [],
      callTool: async () => ({ content: [] }),
    }),
  };

  test("native + 2 enabled cached tools (namespaced), appended after natives", async () => {
    const caps = ["look_up_availability"];
    const binding = postizBinding(["schedulePost", "listChannels"], [SCHEDULE_TOOL, LIST_TOOL]);
    const tools = await getToolsForCapabilities(caps, {
      orgId: "org-42",
      connectors: [binding],
      mcpDeps: deps,
    });
    assert.deepEqual(tools.map((t) => t.name), [
      "look_up_availability",
      "postiz__schedulePost",
      "postiz__listChannels",
    ]);
  });

  test("only enabledTools are wrapped — a cached-but-disabled tool is NOT exposed", async () => {
    const caps = ["look_up_availability"];
    // listChannels is cached but NOT enabled → must be skipped.
    const binding = postizBinding(["schedulePost"], [SCHEDULE_TOOL, LIST_TOOL]);
    const tools = await getToolsForCapabilities(caps, {
      orgId: "org-42",
      connectors: [binding],
      mcpDeps: deps,
    });
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("postiz__schedulePost"));
    assert.ok(!names.includes("postiz__listChannels"), "disabled tool must not be wrapped");
  });

  test("an enabled tool with NO cached schema is skipped (nothing to wrap)", async () => {
    const caps = ["look_up_availability"];
    // enabledTools names a tool that isn't in the cached `tools` list.
    const binding = postizBinding(["ghostTool"], [SCHEDULE_TOOL]);
    const tools = await getToolsForCapabilities(caps, {
      orgId: "org-42",
      connectors: [binding],
      mcpDeps: deps,
    });
    assert.deepEqual(tools.map((t) => t.name), ["look_up_availability"]);
  });
});
