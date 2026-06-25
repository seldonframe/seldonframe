// TDD for the composio connector kind: the binding/zod shape, the pure
// resolver (resolveComposioBinding), and the getToolsForCapabilities seam — both
// the fail-closed-when-no-key behavior AND the REGRESSION INVARIANT (no
// connectors → byte-for-byte identical native list, same object references).
// The live session/list call is DI-stubbed so nothing touches network/DB.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  connectorBindingSchema,
  type ConnectorBinding,
} from "@/lib/agents/mcp/connectors";
import {
  resolveComposioBinding,
  type ComposioBinding,
  type ComposioWrapDeps,
} from "./connector";
import {
  getToolsForCapabilities,
  nativeToolsForCapabilities,
  type GetToolsOptions,
} from "@/lib/agents/tools";

// ─── zod / shape ──────────────────────────────────────────────────────────────

test("a composio binding validates against connectorBindingSchema", () => {
  const binding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail", "slack"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
    tools: [
      { name: "GMAIL_SEND_EMAIL", description: "Send", inputSchema: { type: "object" } },
    ],
    discoveredAt: "2026-06-23T00:00:00.000Z",
  };
  const parsed = connectorBindingSchema.parse(binding);
  assert.equal(parsed.kind, "composio");
});

test("composio binding rejects an endpoint/serviceName (strict, no smuggling)", () => {
  assert.throws(() =>
    connectorBindingSchema.parse({
      id: "cmp_1",
      kind: "composio",
      enabledToolkits: ["gmail"],
      enabledTools: [],
      // not allowed on a composio binding
      endpoint: "https://evil.example/mcp",
    }),
  );
});

// ─── resolveComposioBinding (pure) ────────────────────────────────────────────

/** A wrap-deps stub that records executeTool calls and never hits the network.
 *  `available=false` simulates a workspace with no Composio key (executeTool
 *  throws the same "not configured" message the real SDK path does). */
function stubDeps(available = true) {
  const called: Array<{ orgId: string; toolName: string; args: Record<string, unknown> }> = [];
  const deps: ComposioWrapDeps = {
    executeTool: async (orgId, toolName, args) => {
      if (!available) {
        throw new Error(
          "Composio is not configured for this workspace (no API key) — connect it in Integrations.",
        );
      }
      called.push({ orgId, toolName, args });
      // The default path returns res.data on success; mirror that here with a
      // recognizable payload so the executor's return is asserted unwrapped.
      return { ok: true, toolName };
    },
  };
  return { deps, called };
}

test("empty enabledTools → zero wrapped tools", () => {
  const binding: ComposioBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: [],
  };
  const { deps } = stubDeps();
  assert.deepEqual(resolveComposioBinding(binding, deps), []);
});

test("wraps each enabled tool, namespaced composio__<tool>, with cached schema", () => {
  const binding: ComposioBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
    tools: [
      {
        name: "GMAIL_SEND_EMAIL",
        description: "Send an email",
        inputSchema: { type: "object", properties: { to: { type: "string" } } },
      },
    ],
  };
  const { deps } = stubDeps();
  const tools = resolveComposioBinding(binding, deps);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "composio__GMAIL_SEND_EMAIL");
  assert.equal(tools[0].description, "Send an email");
  assert.deepEqual(tools[0].jsonSchema, {
    type: "object",
    properties: { to: { type: "string" } },
  });
});

test("executor calls executeTool(orgId, slug, input) — the real action slug, NOT a router meta-tool — and returns its result", async () => {
  const binding: ComposioBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
  };
  const { deps, called } = stubDeps();
  const [tool] = resolveComposioBinding(binding, deps);
  const ctx = {
    orgId: "org-uuid",
    orgSlug: "acme",
    agentId: "a1",
    conversationId: "c1",
    testMode: false,
  } as Parameters<typeof tool.execute>[1];
  const res = await tool.execute({ to: "x@y.com" }, ctx);

  // Exactly one execute, with (ctx.orgId, the bare action slug, the input).
  assert.deepEqual(called, [
    { orgId: "org-uuid", toolName: "GMAIL_SEND_EMAIL", args: { to: "x@y.com" } },
  ]);
  // We invoke the DIRECT toolkit action — never the agentic-router meta-tools.
  assert.notEqual(called[0].toolName, "COMPOSIO_MULTI_EXECUTE_TOOL");
  assert.notEqual(called[0].toolName, "COMPOSIO_SEARCH_TOOLS");
  // The wrapped tool returns executeTool's result unchanged (already unwrapped).
  assert.deepEqual(res, { ok: true, toolName: "GMAIL_SEND_EMAIL" });
});

test("executor throws (mapped to tool_result upstream) when no key (executeTool throws)", async () => {
  const binding: ComposioBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
  };
  const { deps } = stubDeps(false); // no Composio key → executeTool throws
  const [tool] = resolveComposioBinding(binding, deps);
  const ctx = {
    orgId: "org-uuid",
    orgSlug: "acme",
    agentId: "a1",
    conversationId: "c1",
    testMode: false,
  } as Parameters<typeof tool.execute>[1];
  await assert.rejects(() => tool.execute({}, ctx), /not configured/i);
});

// ─── getToolsForCapabilities seam ─────────────────────────────────────────────

test("REGRESSION INVARIANT: no connectors → identical native list (same refs)", async () => {
  const caps = ["book_appointment", "lookup_booking"];
  const expected = nativeToolsForCapabilities(caps);
  const got = await getToolsForCapabilities(caps);
  assert.equal(got.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    // SAME object reference — natives are never copied/re-wrapped.
    assert.equal(got[i], expected[i], `tool[${i}] must be the identical reference`);
  }
});

test("composio binding with a key resolves + appends after natives", async () => {
  const caps = ["book_appointment"];
  const native = nativeToolsForCapabilities(caps);
  const binding: ConnectorBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
  };
  const { deps } = stubDeps();
  const opts: GetToolsOptions = {
    orgId: "org-uuid",
    connectors: [binding],
    composioDeps: deps,
    hasComposioKey: async () => true,
  };
  const got = await getToolsForCapabilities(caps, opts);
  assert.equal(got.length, native.length + 1);
  // natives first, identical refs
  for (let i = 0; i < native.length; i++) assert.equal(got[i], native[i]);
  assert.equal(got[got.length - 1].name, "composio__GMAIL_SEND_EMAIL");
});

test("FAIL-CLOSED: composio binding with NO key → native-only (model never sees it)", async () => {
  const caps = ["book_appointment"];
  const native = nativeToolsForCapabilities(caps);
  const binding: ConnectorBinding = {
    id: "cmp_1",
    kind: "composio",
    enabledToolkits: ["gmail"],
    enabledTools: ["GMAIL_SEND_EMAIL"],
  };
  let depsTouched = false;
  const opts: GetToolsOptions = {
    orgId: "org-uuid",
    connectors: [binding],
    composioDeps: {
      executeTool: async () => {
        depsTouched = true;
        throw new Error("should not be called");
      },
    },
    hasComposioKey: async () => false, // no key
  };
  const got = await getToolsForCapabilities(caps, opts);
  assert.equal(got.length, native.length, "composio tools must be dropped");
  for (let i = 0; i < native.length; i++) assert.equal(got[i], native[i]);
  assert.equal(depsTouched, false, "must not even resolve the binding without a key");
});
