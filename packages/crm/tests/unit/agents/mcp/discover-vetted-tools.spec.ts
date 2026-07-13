// Vetted OAuth connector tool discovery + combined persist fill (TDD).
// Mirrors fillComposioBindingTools's structure line-for-line: same
// never-discovered marker guard (enabledTools.length===0 && !discoveredAt),
// same pass-through-byte-identical for non-targets, same never-throws +
// per-binding isolation, same caps.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  fillVettedMcpBindingTools,
  fillAllBindingTools,
  type VettedToolLister,
} from "../../../../src/lib/agents/mcp/discover-vetted-tools";
import type { ConnectorBinding, McpToolSchema } from "../../../../src/lib/agents/mcp/connectors";
import type { ToolkitToolLister } from "../../../../src/lib/integrations/composio/discover-tools";

function circleBinding(overrides: Partial<Extract<ConnectorBinding, { kind: "vetted" }>> = {}): ConnectorBinding {
  return {
    id: "circle",
    kind: "vetted",
    serviceName: "circle",
    enabledTools: [],
    ...overrides,
  };
}

const MEMBER_TOOL: McpToolSchema = {
  name: "listMembers",
  description: "List community members",
  inputSchema: { type: "object" },
};
const POST_TOOL: McpToolSchema = {
  name: "createPost",
  description: "Create a post",
  inputSchema: { type: "object" },
};

describe("fillVettedMcpBindingTools", () => {
  test("undiscovered circle binding + fake lister → fills names, cached tools, discoveredAt", async () => {
    const lister: VettedToolLister = async () => [MEMBER_TOOL, POST_TOOL];
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [circleBinding()], {
      listVettedTools: lister,
    });
    assert.equal(changed, true);
    const filled = connectors[0] as Extract<ConnectorBinding, { kind: "vetted" }>;
    assert.deepEqual(filled.enabledTools, ["listMembers", "createPost"]);
    assert.deepEqual(filled.tools, [MEMBER_TOOL, POST_TOOL]);
    assert.ok(filled.discoveredAt);
  });

  test("explicit-disable (discoveredAt set, empty tools) is left byte-identical", async () => {
    const binding = circleBinding({ discoveredAt: "2026-01-01T00:00:00.000Z" });
    const lister: VettedToolLister = async () => [MEMBER_TOOL];
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [binding], {
      listVettedTools: lister,
    });
    assert.equal(connectors[0], binding, "must be the SAME reference — untouched");
    assert.equal(changed, false);
  });

  test("a bearer-authType vetted binding (postiz) is untouched by the vetted fill", async () => {
    const postizBinding: ConnectorBinding = { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] };
    let listerCalled = false;
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [postizBinding], {
      listVettedTools: async () => {
        listerCalled = true;
        return [MEMBER_TOOL];
      },
    });
    assert.equal(connectors[0], postizBinding);
    assert.equal(changed, false);
    assert.equal(listerCalled, false, "must never call the lister for a bearer-authType vetted connector");
  });

  test("a composio binding passes through untouched", async () => {
    const composioBinding: ConnectorBinding = {
      id: "composio",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: [],
    };
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [composioBinding], {
      listVettedTools: async () => [MEMBER_TOOL],
    });
    assert.equal(connectors[0], composioBinding);
    assert.equal(changed, false);
  });

  test("lister throw → original binding, changed:false (per-binding isolation)", async () => {
    const binding = circleBinding();
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [binding], {
      listVettedTools: async () => { throw new Error("boom"); },
    });
    assert.equal(connectors[0], binding);
    assert.equal(changed, false);
  });

  test("empty lister result → no stamp, retry next encounter", async () => {
    const binding = circleBinding();
    const { connectors, changed } = await fillVettedMcpBindingTools("org-1", [binding], {
      listVettedTools: async () => [],
    });
    assert.equal(connectors[0], binding);
    assert.equal(changed, false);
  });

  test("caps at MAX_ENABLED_TOOLS / MAX_CACHED_TOOLS bounds", async () => {
    const manyTools: McpToolSchema[] = Array.from({ length: 200 }, (_, i) => ({
      name: `tool${i}`,
      description: `Tool ${i}`,
      inputSchema: { type: "object" },
    }));
    const { connectors } = await fillVettedMcpBindingTools("org-1", [circleBinding()], {
      listVettedTools: async () => manyTools,
    });
    const filled = connectors[0] as Extract<ConnectorBinding, { kind: "vetted" }>;
    assert.ok(filled.enabledTools.length <= 64, "MAX_ENABLED_TOOLS bound");
    assert.ok((filled.tools ?? []).length <= 128, "MAX_CACHED_TOOLS bound");
  });
});

describe("fillAllBindingTools", () => {
  test("runs both the composio and vetted fills, ORs changed", async () => {
    const composioBinding: ConnectorBinding = {
      id: "composio",
      kind: "composio",
      enabledToolkits: ["some-toolkit"],
      enabledTools: [],
    };
    const vetted = circleBinding();
    const composioLister: ToolkitToolLister = async () => [{ name: "composioTool", description: "d", inputSchema: {} }];
    const vettedLister: VettedToolLister = async () => [MEMBER_TOOL];

    const { connectors, changed } = await fillAllBindingTools("org-1", [composioBinding, vetted], {
      listToolkitTools: composioLister,
      listVettedTools: vettedLister,
    });
    assert.equal(changed, true);
    const filledComposio = connectors.find((c) => c.kind === "composio") as Extract<ConnectorBinding, { kind: "composio" }>;
    const filledVetted = connectors.find((c) => c.kind === "vetted") as Extract<ConnectorBinding, { kind: "vetted" }>;
    assert.deepEqual(filledComposio.enabledTools, ["composioTool"]);
    assert.deepEqual(filledVetted.enabledTools, ["listMembers"]);
  });

  test("neither fill produces anything → changed:false", async () => {
    const { changed } = await fillAllBindingTools("org-1", [], {});
    assert.equal(changed, false);
  });
});
