// #3 Task 2 — template-scoped MCP bind/unbind/refresh/toggle (pure/DI layer).
//
// The Studio's "Connectors & Tools" picker binds MCP connectors onto the TEMPLATE
// blueprint (agent_templates.blueprint.connectors), reusing #2's table-agnostic
// pure helpers (buildConnectorBinding / mergeConnectorBinding / withRediscovered
// Tools / removeConnectorBinding) — the ONLY difference from the agent-scoped
// path is that load/save target the agent_templates row instead of the agents
// row. The thin "use server" wrappers (mcp-actions.ts) do only auth + the DB
// read/write around these composers; per repo convention (the agent path has no
// actions.spec.ts either) we test the LOGIC layer here with injected discover +
// secret-store + template load/save — no DB, no network.
//
// We assert:
//   - vetted Postiz → secret stored (DI'd, with the key) + tools discovered +
//     merged onto the template blueprint, default-enabled
//   - byo non-HTTPS → rejected BEFORE storing a secret or discovering, blueprint
//     untouched
//   - unbind removes the binding by id (and asks to drop the stored key)
//   - toggle (setTools) updates enabledTools without re-discovering
//   - refresh re-discovers + re-caches, preserving the enabled selection

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  bindTemplateConnector,
  unbindTemplateConnector,
  setTemplateConnectorTools,
  refreshTemplateConnector,
  setTemplateComposioToolkits,
  COMPOSIO_BINDING_ID,
  type TemplateConnectorDeps,
} from "../../../src/lib/agent-templates/mcp-actions";
import type {
  ConnectorBinding,
  McpToolSchema,
} from "../../../src/lib/agents/mcp/connectors";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

const DISCOVERED: McpToolSchema[] = [
  { name: "schedulePost", description: "Schedule a post", inputSchema: { type: "object" } },
  { name: "listChannels", description: "List channels", inputSchema: { type: "object" } },
];

/** A recording deps harness over the template-scoped composer. Starts from a
 *  given blueprint and records the secret writes + discovery + the saved
 *  connectors. */
function harness(
  startBlueprint: AgentBlueprint = { capabilities: [], connectors: [] },
  overrides: Partial<TemplateConnectorDeps> = {},
) {
  const stored: Array<{ workspaceId: string; serviceName: string; value: string }> = [];
  const discoveredFrom: Array<{ endpoint: string; bearer: string }> = [];
  const removedSecrets: string[] = [];
  let blueprint: AgentBlueprint = { ...startBlueprint };
  let savedConnectors: ConnectorBinding[] | undefined;

  const deps: TemplateConnectorDeps = {
    loadBlueprint: async () => blueprint,
    saveConnectors: async (connectors) => {
      savedConnectors = connectors;
      blueprint = { ...blueprint, connectors };
    },
    storeSecret: async ({ workspaceId, serviceName, value }) => {
      stored.push({ workspaceId, serviceName, value });
    },
    discoverTools: async ({ endpoint, bearer }) => {
      discoveredFrom.push({ endpoint, bearer });
      return DISCOVERED;
    },
    getSecret: async () => "stored-bearer",
    removeSecret: async ({ serviceName }) => {
      removedSecrets.push(serviceName);
    },
    ...overrides,
  };

  return {
    deps,
    stored,
    discoveredFrom,
    removedSecrets,
    get blueprint() {
      return blueprint;
    },
    get savedConnectors() {
      return savedConnectors;
    },
  };
}

describe("bindTemplateConnector — vetted Postiz", () => {
  test("stores the key encrypted, discovers + merges onto the template blueprint (default-enabled)", async () => {
    const h = harness();
    const result = await bindTemplateConnector(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
        apiKey: "postiz-secret-key",
      },
      h.deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.connectorId, "postiz");
    assert.equal(result.toolCount, 2);

    // Secret stored under the BUILDER org workspace, with the raw key.
    assert.deepEqual(h.stored, [
      { workspaceId: "builder-1", serviceName: "postiz", value: "postiz-secret-key" },
    ]);
    // Discovery hit the vetted endpoint with the key as bearer.
    assert.deepEqual(h.discoveredFrom, [
      { endpoint: "https://api.postiz.com/mcp", bearer: "postiz-secret-key" },
    ]);
    // The binding landed on the template blueprint, schemas cached, all enabled.
    const connectors = h.savedConnectors ?? [];
    assert.equal(connectors.length, 1);
    assert.equal(connectors[0]!.id, "postiz");
    assert.deepEqual(connectors[0]!.tools, DISCOVERED);
    assert.deepEqual(connectors[0]!.enabledTools.sort(), ["listChannels", "schedulePost"]);
  });

  test("honors a passed enabledTools subset", async () => {
    const h = harness();
    const result = await bindTemplateConnector(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
        apiKey: "k",
        enabledTools: ["schedulePost"],
      },
      h.deps,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(h.savedConnectors?.[0]?.enabledTools, ["schedulePost"]);
    // still caches all discovered tools so the picker can enable more later.
    assert.deepEqual(h.savedConnectors?.[0]?.tools, DISCOVERED);
  });

  test("re-bind replaces the existing binding with the same id (no duplicate)", async () => {
    const existing: ConnectorBinding = {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: ["schedulePost"],
    };
    const h = harness({ capabilities: [], connectors: [existing] });
    await bindTemplateConnector(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
        apiKey: "k",
      },
      h.deps,
    );
    assert.equal(h.savedConnectors?.length, 1, "re-bind must not duplicate the id");
  });
});

describe("bindTemplateConnector — BYO guard", () => {
  test("a non-HTTPS byo endpoint is rejected before storing a secret / discovering / saving", async () => {
    const h = harness();
    const result = await bindTemplateConnector(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connector: {
          kind: "byo",
          id: "evil",
          serviceName: "byo_evil",
          endpoint: "http://insecure.example.com/mcp",
        },
        apiKey: "k",
      },
      h.deps,
    );
    assert.equal(result.ok, false);
    assert.equal(h.stored.length, 0, "no secret stored for a rejected endpoint");
    assert.equal(h.discoveredFrom.length, 0, "no discovery for a rejected endpoint");
    assert.equal(h.savedConnectors, undefined, "blueprint connectors never saved");
  });

  test("an empty apiKey is rejected", async () => {
    const h = harness();
    const result = await bindTemplateConnector(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
        apiKey: "   ",
      },
      h.deps,
    );
    assert.equal(result.ok, false);
    assert.equal(h.stored.length, 0);
  });
});

describe("unbindTemplateConnector", () => {
  test("removes the binding by id and drops the stored key", async () => {
    const existing: ConnectorBinding[] = [
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: ["schedulePost"] },
      {
        id: "byo1",
        kind: "byo",
        serviceName: "byo_byo1",
        endpoint: "https://x.example.com/mcp",
        enabledTools: [],
      },
    ];
    const h = harness({ capabilities: [], connectors: existing });
    const result = await unbindTemplateConnector(
      { orgId: "builder-1", templateId: "tmpl-1", connectorId: "postiz" },
      h.deps,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(h.savedConnectors?.map((b) => b.id), ["byo1"]);
    assert.deepEqual(h.removedSecrets, ["postiz"], "the unbound connector's key is dropped");
  });
});

describe("setTemplateConnectorTools — toggle", () => {
  test("updates enabledTools on a bound connector without re-discovering", async () => {
    const existing: ConnectorBinding[] = [
      {
        id: "postiz",
        kind: "vetted",
        serviceName: "postiz",
        enabledTools: ["schedulePost", "listChannels"],
        tools: DISCOVERED,
      },
    ];
    const h = harness({ capabilities: [], connectors: existing });
    const result = await setTemplateConnectorTools(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        connectorId: "postiz",
        enabledTools: ["schedulePost"],
      },
      h.deps,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(h.savedConnectors?.[0]?.enabledTools, ["schedulePost"]);
    // toggling never re-discovers (cached schemas preserved verbatim).
    assert.equal(h.discoveredFrom.length, 0);
    assert.deepEqual(h.savedConnectors?.[0]?.tools, DISCOVERED);
  });

  test("rejects when the connector is not bound", async () => {
    const h = harness({ capabilities: [], connectors: [] });
    const result = await setTemplateConnectorTools(
      { orgId: "builder-1", templateId: "tmpl-1", connectorId: "ghost", enabledTools: [] },
      h.deps,
    );
    assert.equal(result.ok, false);
  });
});

describe("refreshTemplateConnector", () => {
  test("re-discovers via the stored key + re-caches, preserving enabled selection", async () => {
    const existing: ConnectorBinding[] = [
      {
        id: "postiz",
        kind: "vetted",
        serviceName: "postiz",
        enabledTools: ["schedulePost"],
        tools: [{ name: "schedulePost", description: "old", inputSchema: { type: "object" } }],
      },
    ];
    const h = harness({ capabilities: [], connectors: existing });
    const result = await refreshTemplateConnector(
      { orgId: "builder-1", templateId: "tmpl-1", connectorId: "postiz" },
      h.deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.toolCount, 2);
    // Re-cached the freshly discovered schemas.
    assert.deepEqual(h.savedConnectors?.[0]?.tools, DISCOVERED);
    // Preserved the operator's still-valid enabled choice.
    assert.deepEqual(h.savedConnectors?.[0]?.enabledTools, ["schedulePost"]);
    // Used the stored bearer (no apiKey passed to refresh).
    assert.deepEqual(h.discoveredFrom, [
      { endpoint: "https://api.postiz.com/mcp", bearer: "stored-bearer" },
    ]);
  });

  test("rejects when the stored key is missing", async () => {
    const existing: ConnectorBinding[] = [
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] },
    ];
    const h = harness({ capabilities: [], connectors: existing }, {
      getSecret: async () => null,
    });
    const result = await refreshTemplateConnector(
      { orgId: "builder-1", templateId: "tmpl-1", connectorId: "postiz" },
      h.deps,
    );
    assert.equal(result.ok, false);
  });
});

// ─── setTemplateComposioToolkits (the Studio "Composio apps" picker) ──────────
//
// A composio binding carries NO endpoint and NO secret — so the composer is a
// pure blueprint write: it never calls storeSecret / discoverTools. We assert it
// writes ONE kind:"composio" binding (fixed id) with the catalog-filtered
// toolkits + a curated default tool allowlist, leaves other bindings alone, and
// removes the binding when the selection goes empty.
describe("setTemplateComposioToolkits — per-agent Composio apps", () => {
  test("writes one composio binding with the selected toolkits + default tools (no secret/discovery)", async () => {
    const h = harness();
    const result = await setTemplateComposioToolkits(
      { orgId: "builder-1", templateId: "tmpl-1", toolkits: ["gmail", "slack"] },
      h.deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.toolkitCount, 2);
    assert.ok(result.toolCount > 0);

    // Never touched the bearer-store or discovery seams.
    assert.deepEqual(h.stored, []);
    assert.deepEqual(h.discoveredFrom, []);

    const saved = h.savedConnectors ?? [];
    assert.equal(saved.length, 1);
    const binding = saved[0];
    assert.equal(binding.id, COMPOSIO_BINDING_ID);
    assert.equal(binding.kind, "composio");
    if (binding.kind !== "composio") return;
    assert.deepEqual(binding.enabledToolkits, ["gmail", "slack"]);
    // Curated defaults seeded the allowlist (e.g. GMAIL_SEND_EMAIL + SLACK_SEND_MESSAGE).
    assert.ok(binding.enabledTools.includes("GMAIL_SEND_EMAIL"));
    assert.ok(binding.enabledTools.includes("SLACK_SEND_MESSAGE"));
    // Cached tool schemas mirror the allowlist (so the picker can list names).
    assert.equal((binding.tools ?? []).length, binding.enabledTools.length);
  });

  test("filters non-catalog toolkits + de-dupes, lowercasing slugs", async () => {
    const h = harness();
    const result = await setTemplateComposioToolkits(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        toolkits: ["Gmail", "gmail", "definitely-not-a-toolkit"],
      },
      h.deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const binding = (h.savedConnectors ?? [])[0];
    assert.equal(binding.kind, "composio");
    if (binding.kind !== "composio") return;
    assert.deepEqual(binding.enabledToolkits, ["gmail"]);
  });

  test("an explicit enabledTools override replaces the curated default", async () => {
    const h = harness();
    await setTemplateComposioToolkits(
      {
        orgId: "builder-1",
        templateId: "tmpl-1",
        toolkits: ["gmail"],
        enabledTools: ["GMAIL_FETCH_EMAILS"],
      },
      h.deps,
    );
    const binding = (h.savedConnectors ?? [])[0];
    assert.equal(binding.kind, "composio");
    if (binding.kind !== "composio") return;
    assert.deepEqual(binding.enabledTools, ["GMAIL_FETCH_EMAILS"]);
  });

  test("empty selection removes the composio binding, preserving vetted/byo bindings", async () => {
    const existing: ConnectorBinding[] = [
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: ["schedulePost"] },
      { id: COMPOSIO_BINDING_ID, kind: "composio", enabledToolkits: ["gmail"], enabledTools: ["GMAIL_SEND_EMAIL"] },
    ];
    const h = harness({ capabilities: [], connectors: existing });
    const result = await setTemplateComposioToolkits(
      { orgId: "builder-1", templateId: "tmpl-1", toolkits: [] },
      h.deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.removed, true);
    const saved = h.savedConnectors ?? [];
    // Composio binding gone; the vetted Postiz binding untouched.
    assert.equal(saved.find((b) => b.kind === "composio"), undefined);
    assert.ok(saved.some((b) => b.id === "postiz"));
  });

  test("re-selecting upserts (one composio binding, never duplicates) and widens toolkits", async () => {
    const existing: ConnectorBinding[] = [
      { id: COMPOSIO_BINDING_ID, kind: "composio", enabledToolkits: ["gmail"], enabledTools: ["GMAIL_SEND_EMAIL"] },
    ];
    const h = harness({ capabilities: [], connectors: existing });
    await setTemplateComposioToolkits(
      { orgId: "builder-1", templateId: "tmpl-1", toolkits: ["gmail", "hubspot"] },
      h.deps,
    );
    const saved = (h.savedConnectors ?? []).filter((b) => b.kind === "composio");
    assert.equal(saved.length, 1);
    const binding = saved[0];
    if (binding.kind !== "composio") return;
    assert.deepEqual(binding.enabledToolkits, ["gmail", "hubspot"]);
  });

  test("missing template → error (blueprint not loaded)", async () => {
    const h = harness();
    const result = await setTemplateComposioToolkits(
      { orgId: "builder-1", templateId: "tmpl-1", toolkits: ["gmail"] },
      { ...h.deps, loadBlueprint: async () => null },
    );
    assert.equal(result.ok, false);
  });
});
