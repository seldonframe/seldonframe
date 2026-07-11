// TDD for the composio live-tool-discovery slice (2026-07-11).
//
// discover-tools.ts widens ANY Composio toolkit (not just the 8-toolkit
// catalog) to real bindable tools:
//   • pickDiscoverySubset — PURE important-first/fallback/cap selector.
//   • fillComposioBindingTools — fills `enabledTools` on never-discovered
//     composio bindings ONLY (enabledTools.length===0 && !discoveredAt),
//     catalog defaults first, live discovery (DI'd) only for toolkits with
//     no catalog defaults. Fail-soft, org-scoped by construction, never
//     touches non-composio bindings or already-resolved/explicitly-disabled
//     composio bindings.
//
// NO live Composio API is ever touched here — `listToolkitTools` is always
// injected.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TOOLKIT_DISCOVERY_TOOL_CAP,
  pickDiscoverySubset,
  fillComposioBindingTools,
  fillBlueprintConnectorsForPersist,
  type ToolkitToolLister,
} from "../../../../src/lib/integrations/composio/discover-tools";
import {
  connectorBindingSchema,
  MAX_ENABLED_TOOLS,
  type ConnectorBinding,
  type McpToolSchema,
} from "../../../../src/lib/agents/mcp/connectors";

/** Assert a value parses as a real ConnectorBinding via the canonical schema. */
function assertValidBinding(b: unknown): ConnectorBinding {
  const parsed = connectorBindingSchema.safeParse(b);
  assert.ok(
    parsed.success,
    `binding should validate as a real ConnectorBinding: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );
  return parsed.data;
}

function schema(name: string): McpToolSchema {
  return { name, description: `Composio tool ${name}.`, inputSchema: { type: "object" } };
}

describe("pickDiscoverySubset — pure important-first/fallback/cap", () => {
  test("prefers the important-filtered list when non-empty", () => {
    const important = ["a", "b"];
    const all = ["a", "b", "c", "d"];
    assert.deepEqual(pickDiscoverySubset(important, all), ["a", "b"]);
  });

  test("falls back to the full list when important is empty", () => {
    const all = ["x", "y", "z"];
    assert.deepEqual(pickDiscoverySubset([], all), ["x", "y", "z"]);
  });

  test("caps at TOOLKIT_DISCOVERY_TOOL_CAP either way", () => {
    const big = Array.from({ length: TOOLKIT_DISCOVERY_TOOL_CAP + 10 }, (_, i) => `t${i}`);
    assert.equal(pickDiscoverySubset(big, []).length, TOOLKIT_DISCOVERY_TOOL_CAP);
    assert.equal(pickDiscoverySubset([], big).length, TOOLKIT_DISCOVERY_TOOL_CAP);
  });
});

describe("fillComposioBindingTools — no-op cases", () => {
  test("vetted/byo bindings pass through untouched", async () => {
    const vetted: ConnectorBinding = { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] };
    const byo: ConnectorBinding = {
      id: "custom",
      kind: "byo",
      serviceName: "custom",
      endpoint: "https://example.com/mcp",
      enabledTools: [],
    };
    const result = await fillComposioBindingTools("org1", [vetted, byo]);
    assert.equal(result.changed, false);
    assert.deepEqual(result.connectors, [vetted, byo]);
  });

  test("already-seeded composio binding (enabledTools non-empty) is untouched", async () => {
    const seeded: ConnectorBinding = {
      id: "gmail",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: ["GMAIL_SEND_EMAIL"],
    };
    let listerCalled = false;
    const lister: ToolkitToolLister = async () => {
      listerCalled = true;
      return [];
    };
    const result = await fillComposioBindingTools("org1", [seeded], { listToolkitTools: lister });
    assert.equal(result.changed, false);
    assert.deepEqual(result.connectors, [seeded]);
    assert.equal(listerCalled, false);
  });

  test("explicit disable (discoveredAt set, empty allowlist) is untouched", async () => {
    const disabled: ConnectorBinding = {
      id: "youtube",
      kind: "composio",
      enabledToolkits: ["youtube"],
      enabledTools: [],
      discoveredAt: "2026-01-01T00:00:00.000Z",
    };
    let listerCalled = false;
    const lister: ToolkitToolLister = async () => {
      listerCalled = true;
      return [schema("YOUTUBE_LIST_VIDEOS")];
    };
    const result = await fillComposioBindingTools("org1", [disabled], { listToolkitTools: lister });
    assert.equal(result.changed, false);
    assert.deepEqual(result.connectors, [disabled]);
    assert.equal(listerCalled, false);
  });
});

describe("fillComposioBindingTools — catalog fill", () => {
  test("catalog-only fill widens enabledTools without touching the lister", async () => {
    const binding: ConnectorBinding = {
      id: "gmail",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: [],
    };
    let listerCalled = false;
    const lister: ToolkitToolLister = async () => {
      listerCalled = true;
      return [];
    };
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    assert.equal(result.changed, true);
    assert.equal(listerCalled, false, "catalog toolkit never invokes the live lister");
    const filled = result.connectors[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.ok(filled.enabledTools.length > 0);
    assert.ok(filled.discoveredAt, "discoveredAt stamped");
    assertValidBinding(filled);
  });
});

describe("fillComposioBindingTools — non-catalog live fill", () => {
  test("non-catalog toolkit fills via the injected lister; persisted shape parses", async () => {
    const binding: ConnectorBinding = {
      id: "youtube",
      kind: "composio",
      enabledToolkits: ["youtube"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async (orgId, slug) => {
      assert.equal(orgId, "org1");
      assert.equal(slug, "youtube");
      return [schema("YOUTUBE_LIST_VIDEOS"), schema("YOUTUBE_UPLOAD_VIDEO")];
    };
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    assert.equal(result.changed, true);
    const filled = result.connectors[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.deepEqual(filled.enabledTools.sort(), ["YOUTUBE_LIST_VIDEOS", "YOUTUBE_UPLOAD_VIDEO"].sort());
    assert.equal(filled.tools?.length, 2);
    assert.ok(filled.discoveredAt);
    assertValidBinding(filled);
  });

  test("live discovery producing zero tools leaves the binding byte-identical (no discoveredAt)", async () => {
    const binding: ConnectorBinding = {
      id: "obscure",
      kind: "composio",
      enabledToolkits: ["obscure"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async () => [];
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    assert.equal(result.changed, false);
    assert.deepEqual(result.connectors, [binding]);
  });
});

describe("fillComposioBindingTools — mixed, caps, isolation, multi-binding", () => {
  test("mixed catalog+non-catalog union + dedupe", async () => {
    const binding: ConnectorBinding = {
      id: "mixed",
      kind: "composio",
      enabledToolkits: ["gmail", "youtube"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async (_orgId, slug) => {
      if (slug === "youtube") return [schema("YOUTUBE_LIST_VIDEOS"), schema("GMAIL_SEND_EMAIL")];
      return [];
    };
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    const filled = result.connectors[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    // GMAIL_SEND_EMAIL comes from the catalog default AND (hypothetically) the
    // live list — dedupe means it appears once.
    const occurrences = filled.enabledTools.filter((t) => t === "GMAIL_SEND_EMAIL").length;
    assert.equal(occurrences, 1);
    assert.ok(filled.enabledTools.includes("YOUTUBE_LIST_VIDEOS"));
    assertValidBinding(filled);
  });

  test("caps enabledTools at MAX_ENABLED_TOOLS", async () => {
    const manyToolkits = Array.from({ length: 5 }, (_, i) => `toolkit${i}`);
    const binding: ConnectorBinding = {
      id: "many",
      kind: "composio",
      enabledToolkits: manyToolkits,
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async (_orgId, slug) =>
      Array.from({ length: 20 }, (_, i) => schema(`${slug}_TOOL_${i}`));
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    const filled = result.connectors[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.ok(filled.enabledTools.length <= MAX_ENABLED_TOOLS);
    assertValidBinding(filled);
  });

  test("one toolkit's lister rejection doesn't kill the fill for its siblings", async () => {
    const binding: ConnectorBinding = {
      id: "resilient",
      kind: "composio",
      enabledToolkits: ["bad", "youtube"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async (_orgId, slug) => {
      if (slug === "bad") throw new Error("boom");
      return [schema("YOUTUBE_LIST_VIDEOS")];
    };
    let didThrow = false;
    let result: Awaited<ReturnType<typeof fillComposioBindingTools>> | undefined;
    try {
      result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    } catch {
      didThrow = true;
    }
    assert.equal(didThrow, false, "never throws");
    assert.equal(result?.changed, true);
    const filled = result!.connectors[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.deepEqual(filled.enabledTools, ["YOUTUBE_LIST_VIDEOS"]);
  });

  test("all-toolkit lister rejection for a binding → unchanged, changed:false for that binding", async () => {
    const binding: ConnectorBinding = {
      id: "allbad",
      kind: "composio",
      enabledToolkits: ["allbad"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async () => {
      throw new Error("network down");
    };
    const result = await fillComposioBindingTools("org1", [binding], { listToolkitTools: lister });
    assert.equal(result.changed, false);
    assert.deepEqual(result.connectors, [binding]);
  });

  test("multi-binding arrays where only one changes → changed:true, others byte-identical", async () => {
    const untouched: ConnectorBinding = {
      id: "gmail",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: ["GMAIL_SEND_EMAIL"],
    };
    const toFill: ConnectorBinding = {
      id: "youtube",
      kind: "composio",
      enabledToolkits: ["youtube"],
      enabledTools: [],
    };
    const lister: ToolkitToolLister = async () => [schema("YOUTUBE_LIST_VIDEOS")];
    const result = await fillComposioBindingTools("org1", [untouched, toFill], {
      listToolkitTools: lister,
    });
    assert.equal(result.changed, true);
    assert.equal(result.connectors[0], untouched, "byte-identical (same reference)");
    const filled = result.connectors[1] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.deepEqual(filled.enabledTools, ["YOUTUBE_LIST_VIDEOS"]);
  });

  test("order-stable across the array", async () => {
    const b1: ConnectorBinding = { id: "gmail", kind: "composio", enabledToolkits: ["gmail"], enabledTools: [] };
    const b2: ConnectorBinding = { id: "youtube", kind: "composio", enabledToolkits: ["youtube"], enabledTools: [] };
    const lister: ToolkitToolLister = async () => [schema("YOUTUBE_LIST_VIDEOS")];
    const result = await fillComposioBindingTools("org1", [b1, b2], { listToolkitTools: lister });
    assert.deepEqual(result.connectors.map((c) => c.id), ["gmail", "youtube"]);
  });
});

describe("fillBlueprintConnectorsForPersist — the generate defaultCreate seam", () => {
  test("widens a catalog composio binding on the blueprint via fillComposioBindingTools", async () => {
    const blueprint = {
      greeting: "hi",
      connectors: [
        { id: "gmail", kind: "composio", enabledToolkits: ["gmail"], enabledTools: [] } as ConnectorBinding,
      ],
    };
    // Catalog toolkit — the fill resolves purely from catalog defaults, no
    // live lister is invoked, so this never touches the network/DB.
    const result = await fillBlueprintConnectorsForPersist("org1", blueprint);
    const filled = result.connectors?.[0] as Extract<ConnectorBinding, { kind: "composio" }>;
    assert.ok(filled.enabledTools.length > 0);
    assert.equal(result.greeting, "hi", "other blueprint fields pass through untouched");
    assertValidBinding(filled);
  });

  test("no connectors on the blueprint -> passthrough, no throw", async () => {
    const blueprint = { greeting: "hi" };
    const result = await fillBlueprintConnectorsForPersist("org1", blueprint);
    assert.equal(result.greeting, "hi");
    assert.deepEqual(result.connectors, []);
  });
});

describe("fillComposioBindingTools — robustness (never throws)", () => {
  test("malformed input → connectors as-array-or-[], changed:false", async () => {
    const r1 = await fillComposioBindingTools("org1", undefined);
    assert.deepEqual(r1, { connectors: [], changed: false });

    const r2 = await fillComposioBindingTools("org1", null as unknown as ConnectorBinding[]);
    assert.deepEqual(r2, { connectors: [], changed: false });

    const garbage = [{ not: "a binding" } as unknown as ConnectorBinding];
    let threw = false;
    let r3: Awaited<ReturnType<typeof fillComposioBindingTools>> | undefined;
    try {
      r3 = await fillComposioBindingTools("org1", garbage);
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
    assert.equal(r3?.changed, false);
  });
});
