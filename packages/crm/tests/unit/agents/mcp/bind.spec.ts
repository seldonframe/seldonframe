// Bind composition — pure/DI layer, TDD (Task 5).
//
// The bind FLOW is: org-guard → resolve endpoint → store the apiKey ENCRYPTED →
// discover tools via the MCP client → cache the schemas + default-enable them
// onto the agent's blueprint.connectors (append/replace by id). The thin
// "use server" action (bindMcpConnectorAction) does only auth + the
// blueprint-update DB write around this; the LOGIC lives in pure helpers here
// (mcp/bind.ts) so it's directly testable with injected discover + secret-store
// (no DB, no network), exactly as prior builds covered "use server" actions.
//
// We assert:
//   - vetted Postiz → endpoint resolved, secret stored (DI'd, with the key),
//     tools discovered + cached on the binding, all default-enabled
//   - a passed enabledTools subset is honored (only those enabled)
//   - byo non-HTTPS → rejected BEFORE storing a secret or discovering
//   - mergeConnectorBinding appends a new id and replaces an existing one

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildConnectorBinding,
  mergeConnectorBinding,
  type BindDeps,
} from "../../../../src/lib/agents/mcp/bind";
import type { ConnectorBinding, McpToolSchema } from "../../../../src/lib/agents/mcp/connectors";

const DISCOVERED: McpToolSchema[] = [
  { name: "schedulePost", description: "Schedule a post", inputSchema: { type: "object" } },
  { name: "listChannels", description: "List channels", inputSchema: { type: "object" } },
];

function recordingDeps(overrides: Partial<BindDeps> = {}): {
  deps: BindDeps;
  stored: Array<{ serviceName: string; value: string }>;
  discoveredFrom: Array<{ endpoint: string; bearer: string }>;
} {
  const stored: Array<{ serviceName: string; value: string }> = [];
  const discoveredFrom: Array<{ endpoint: string; bearer: string }> = [];
  const deps: BindDeps = {
    storeSecret: async ({ serviceName, value }) => {
      stored.push({ serviceName, value });
    },
    discoverTools: async ({ endpoint, bearer }) => {
      discoveredFrom.push({ endpoint, bearer });
      return DISCOVERED;
    },
    ...overrides,
  };
  return { deps, stored, discoveredFrom };
}

describe("buildConnectorBinding — vetted Postiz", () => {
  test("resolves endpoint, stores the key encrypted, discovers + caches all tools (default-enabled)", async () => {
    const { deps, stored, discoveredFrom } = recordingDeps();
    const binding = await buildConnectorBinding({
      orgId: "org-1",
      connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
      apiKey: "postiz-secret-key",
      deps,
    });

    // Secret stored under the connector's service name, with the raw key.
    assert.deepEqual(stored, [{ serviceName: "postiz", value: "postiz-secret-key" }]);
    // Discovery hit the vetted endpoint with the key as bearer.
    assert.deepEqual(discoveredFrom, [
      { endpoint: "https://api.postiz.com/mcp", bearer: "postiz-secret-key" },
    ]);
    // The binding caches the discovered schemas + enables them all by default.
    assert.equal(binding.kind, "vetted");
    assert.equal(binding.id, "postiz");
    assert.equal(binding.serviceName, "postiz");
    assert.deepEqual(binding.tools, DISCOVERED);
    assert.deepEqual(binding.enabledTools.sort(), ["listChannels", "schedulePost"]);
    assert.ok(binding.discoveredAt, "discoveredAt timestamp is set");
  });

  test("honors a passed enabledTools subset (only those are enabled)", async () => {
    const { deps } = recordingDeps();
    const binding = await buildConnectorBinding({
      orgId: "org-1",
      connector: { kind: "vetted", id: "postiz", serviceName: "postiz" },
      apiKey: "k",
      enabledTools: ["schedulePost"],
      deps,
    });
    assert.deepEqual(binding.enabledTools, ["schedulePost"]);
    // Still caches ALL discovered tools (so the picker UI can enable more later).
    assert.deepEqual(binding.tools, DISCOVERED);
  });
});

describe("buildConnectorBinding — BYO", () => {
  test("an HTTPS byo endpoint resolves + discovers", async () => {
    const { deps, discoveredFrom } = recordingDeps();
    const binding = await buildConnectorBinding({
      orgId: "org-1",
      connector: { kind: "byo", id: "my-mcp", serviceName: "byo_my-mcp", endpoint: "https://x.example.com/mcp" },
      apiKey: "k",
      deps,
    });
    assert.equal(binding.kind, "byo");
    assert.deepEqual(discoveredFrom, [{ endpoint: "https://x.example.com/mcp", bearer: "k" }]);
  });

  test("a non-HTTPS byo endpoint is REJECTED before storing a secret or discovering", async () => {
    const { deps, stored, discoveredFrom } = recordingDeps();
    await assert.rejects(
      () =>
        buildConnectorBinding({
          orgId: "org-1",
          connector: { kind: "byo", id: "evil", serviceName: "byo_evil", endpoint: "http://insecure.example.com/mcp" },
          apiKey: "k",
          deps,
        }),
      /https/i,
    );
    assert.equal(stored.length, 0, "no secret stored for a rejected endpoint");
    assert.equal(discoveredFrom.length, 0, "no discovery for a rejected endpoint");
  });

  test("an unknown vetted id is rejected", async () => {
    const { deps } = recordingDeps();
    await assert.rejects(
      () =>
        buildConnectorBinding({
          orgId: "org-1",
          connector: { kind: "vetted", id: "ghost", serviceName: "ghost" },
          apiKey: "k",
          deps,
        }),
      /ghost|vetted|unknown/i,
    );
  });
});

describe("mergeConnectorBinding", () => {
  const base: ConnectorBinding = {
    id: "postiz",
    kind: "vetted",
    serviceName: "postiz",
    enabledTools: ["schedulePost"],
  };

  test("appends a new binding id", () => {
    const existing: ConnectorBinding[] = [base];
    const incoming: ConnectorBinding = {
      id: "byo1",
      kind: "byo",
      serviceName: "byo_byo1",
      endpoint: "https://x.example.com/mcp",
      enabledTools: [],
    };
    const merged = mergeConnectorBinding(existing, incoming);
    assert.deepEqual(merged.map((b) => b.id), ["postiz", "byo1"]);
  });

  test("replaces an existing binding with the same id (re-bind)", () => {
    const existing: ConnectorBinding[] = [base];
    const incoming: ConnectorBinding = {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: ["schedulePost", "listChannels"],
    };
    const merged = mergeConnectorBinding(existing, incoming);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0]!.enabledTools, ["schedulePost", "listChannels"]);
  });

  test("removeConnectorBinding drops by id (used by unbind)", async () => {
    const { removeConnectorBinding } = await import("../../../../src/lib/agents/mcp/bind");
    const existing: ConnectorBinding[] = [
      base,
      { id: "byo1", kind: "byo", serviceName: "byo_byo1", endpoint: "https://x.example.com/mcp", enabledTools: [] },
    ];
    const after = removeConnectorBinding(existing, "postiz");
    assert.deepEqual(after.map((b) => b.id), ["byo1"]);
  });
});
