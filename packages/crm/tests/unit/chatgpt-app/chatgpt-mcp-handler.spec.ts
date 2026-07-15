// ChatGPT App MCP — tests for the DI'd request handler.
//
// Drives the full JSON-RPC method dispatch end-to-end with FAKE deps (no DB, no
// network). The ChatGPT server is PUBLIC (no auth gate) — so the focus is the
// method routing, the tools/call arg validation + dep dispatch, structuredContent
// emission, and the fail-safe behavior when a dep throws (a tool-level isError
// result with HTTP 200, never a transport 500). Pattern: dependency injection
// (the repo prefers DI over mock.module — see missed-call-textback.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  handleChatGptRpc,
  type ChatGptMcpDeps,
} from "../../../src/lib/chatgpt-app/chatgpt-mcp-handler";
import { MCP_PROTOCOL_VERSION, JSONRPC_INVALID_PARAMS, JSONRPC_METHOD_NOT_FOUND } from "../../../src/lib/marketplace/agent-mcp-rpc";
import type { MarketplaceAgentRow } from "../../../src/lib/marketplace/agent-listings";

const NOW = new Date("2026-06-23T12:00:00Z");

const ROWS: MarketplaceAgentRow[] = [
  {
    id: "1",
    slug: "review-requester",
    name: "Review Requester",
    description: "Texts happy customers for a Google review.",
    niche: "reviews",
    tags: [],
    price: 0,
    agentType: "chat_assistant",
    installCount: 12,
    rating: 4.8,
    reviewCount: 5,
    isFeatured: true,
    previewImageUrl: null,
  },
];

type Harness = {
  deps: ChatGptMcpDeps;
  built: Array<Record<string, unknown>>;
  builtMeta: Array<{ subject?: string; session?: string }>;
  browsed: Array<{ query?: string; niche?: string }>;
  deployed: Array<{ workspaceToken: string; slug: string }>;
};

function makeHarness(overrides?: {
  buildWorkspace?: ChatGptMcpDeps["buildWorkspace"];
  browse?: ChatGptMcpDeps["browse"];
  deploy?: ChatGptMcpDeps["deploy"];
}): Harness {
  const built: Array<Record<string, unknown>> = [];
  const builtMeta: Array<{ subject?: string; session?: string }> = [];
  const browsed: Array<{ query?: string; niche?: string }> = [];
  const deployed: Array<{ workspaceToken: string; slug: string }> = [];

  const deps: ChatGptMcpDeps = {
    buildWorkspace:
      overrides?.buildWorkspace ??
      (async (args, meta) => {
        built.push(args as unknown as Record<string, unknown>);
        builtMeta.push(meta);
        return {
          url: "https://acme.app.seldonframe.com",
          claimUrl: "https://app.seldonframe.com/admin/org-1?token=tok",
          workspaceToken: "wst_fake_token",
        };
      }),
    browse:
      overrides?.browse ??
      (async (filters) => {
        browsed.push(filters);
        return ROWS;
      }),
    deploy:
      overrides?.deploy ??
      (async (args) => {
        deployed.push(args);
        return { ok: true, name: "Review Requester", url: "https://app.seldonframe.com/agents/abc" };
      }),
    now: () => NOW,
  };

  return { deps, built, builtMeta, browsed, deployed };
}

function rpc(method: string, params?: unknown, id: number | string | null = 1) {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) body.id = id;
  if (params !== undefined) body.params = params;
  return JSON.stringify(body);
}

// ─── transport / lifecycle ───────────────────────────────────────────────────

describe("handleChatGptRpc — lifecycle", () => {
  test("parse error → JSON-RPC -32700, status 200", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc("not json", deps);
    assert.equal(out.status, 200);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, -32700);
  });

  test("initialize → serverInfo name SeldonFrame + protocol version", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("initialize"), deps);
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal((result.serverInfo as { name?: string }).name, "SeldonFrame");
    assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
  });

  test("initialize → includes descriptive server instructions naming the tool flow", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("initialize"), deps);
    const result = (out.body as { result?: { instructions?: string } }).result!;
    assert.equal(typeof result.instructions, "string");
    assert.ok((result.instructions ?? "").length > 50, "instructions should be descriptive");
    assert.match(result.instructions!, /build_workspace/);
  });

  test("ping → empty result", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("ping"), deps);
    assert.deepEqual((out.body as { result?: unknown }).result, {});
  });

  test("notification (no id) → 202 + null body", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("notifications/initialized", undefined, null), deps);
    assert.equal(out.status, 202);
    assert.equal(out.body, null);
  });

  test("unknown method → -32601", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("does/not/exist"), deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_METHOD_NOT_FOUND);
  });

  test("tools/list → exactly the 3 ChatGPT tools, no auth required", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("tools/list"), deps);
    const tools = (out.body as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? [];
    assert.equal(tools.length, 3);
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["browse_marketplace", "build_workspace", "deploy_agent"],
    );
  });
});

// ─── tools/call: build_workspace ─────────────────────────────────────────────

describe("handleChatGptRpc — build_workspace", () => {
  test("routes to deps.buildWorkspace and returns the URL in text + structuredContent", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "build_workspace", arguments: { business_name: "Acme HVAC", description: "heating + cooling" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.built.length, 1);
    assert.equal((h.built[0] as { business_name?: string }).business_name, "Acme HVAC");

    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0].text, /acme\.app\.seldonframe\.com/);
    // structuredContent carries the raw machine-readable result for Apps-SDK clients.
    const structured = result.structuredContent as { url?: string; workspaceToken?: string };
    assert.equal(structured.url, "https://acme.app.seldonframe.com");
    assert.equal(structured.workspaceToken, "wst_fake_token");
  });

  test("_meta openai/subject + openai/session flow through to deps.buildWorkspace (per-user rate limiting)", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", {
        name: "build_workspace",
        arguments: { business_name: "Acme HVAC" },
        _meta: { "openai/subject": "sub_user_1", "openai/session": "sess_42" },
      }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.builtMeta.length, 1);
    assert.equal(h.builtMeta[0].subject, "sub_user_1");
    assert.equal(h.builtMeta[0].session, "sess_42");
  });

  test("no _meta (a non-ChatGPT MCP caller) → empty meta, build still works", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "build_workspace", arguments: { business_name: "Acme HVAC" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.builtMeta.length, 1);
    assert.equal(h.builtMeta[0].subject, undefined);
    assert.equal(h.builtMeta[0].session, undefined);
  });

  test("missing business_name → -32602 (validation), dep not called", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(rpc("tools/call", { name: "build_workspace", arguments: {} }), h.deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.built.length, 0);
  });

  test("a throwing buildWorkspace dep → isError text result, status 200 (not a 500)", async () => {
    const h = makeHarness({
      buildWorkspace: async () => {
        throw new Error("Anonymous workspace creation is limited to 3 per hour.");
      },
    });
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "build_workspace", arguments: { business_name: "Acme" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /limited to 3 per hour/);
  });
});

// ─── tools/call: browse_marketplace ──────────────────────────────────────────

describe("handleChatGptRpc — browse_marketplace", () => {
  test("formats rows + passes filters through, structuredContent carries the rows", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "browse_marketplace", arguments: { query: "review", niche: "reviews" } }),
      h.deps,
    );
    assert.deepEqual(h.browsed[0], { query: "review", niche: "reviews" });
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /Review Requester/);
    assert.match(content[0].text, /review-requester/);
    const structured = result.structuredContent as { agents?: Array<Record<string, unknown>> };
    assert.equal(structured.agents?.length, 1);
    // structuredContent mirrors the declared output schema — no price (or any
    // other undeclared MarketplaceAgentRow column) leaks onto the wire.
    assert.equal(structured.agents?.[0]?.slug, "review-requester");
    assert.ok(!("price" in (structured.agents?.[0] ?? {})), "browse structuredContent must not emit price");
  });

  test("empty args browse is allowed (no required fields)", async () => {
    const h = makeHarness({ browse: async () => [] });
    const out = await handleChatGptRpc(rpc("tools/call", { name: "browse_marketplace", arguments: {} }), h.deps);
    assert.equal(out.status, 200);
    const content = (out.body as { result?: { content?: Array<{ text: string }> } }).result?.content ?? [];
    assert.ok(content[0].text.length > 0);
  });
});

// ─── tools/call: deploy_agent ────────────────────────────────────────────────

describe("handleChatGptRpc — deploy_agent", () => {
  test("free deploy success → name + url in text and structuredContent", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "deploy_agent", arguments: { workspace_token: "wst_x", agent_slug: "review-requester" } }),
      h.deps,
    );
    assert.deepEqual(h.deployed[0], { workspaceToken: "wst_x", slug: "review-requester" });
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /Installed/);
    assert.match(content[0].text, /Review Requester/);
    assert.equal((result.structuredContent as { ok?: boolean }).ok, true);
  });

  test("paid/non-free slug → ok:false friendly message with NO purchase URL or price", async () => {
    const h = makeHarness({
      deploy: async () => ({
        ok: false,
        error:
          '"Booking Concierge" isn\'t available to install through ChatGPT — try one of the free agents from browse_marketplace instead.',
      }),
    });
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "deploy_agent", arguments: { workspace_token: "wst_x", agent_slug: "booking-concierge" } }),
      h.deps,
    );
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /isn't available to install through ChatGPT/);
    // Free-utility contract: nothing in the response may carry a link out,
    // a claim/purchase URL, or a price.
    assert.doesNotMatch(JSON.stringify(result), /claimUrl|https?:\/\//);
  });

  test("expired/invalid token → deploy returns ok:false → isError result", async () => {
    const h = makeHarness({
      deploy: async () => ({ ok: false, error: "That workspace link expired — build one first." }),
    });
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "deploy_agent", arguments: { workspace_token: "wst_bad", agent_slug: "review-requester" } }),
      h.deps,
    );
    assert.equal(out.status, 200);
    const result = (out.body as { result?: Record<string, unknown> }).result!;
    assert.equal(result.isError, true);
    const content = result.content as Array<{ text: string }>;
    assert.match(content[0].text, /expired/);
  });

  test("missing workspace_token → -32602, dep not called", async () => {
    const h = makeHarness();
    const out = await handleChatGptRpc(
      rpc("tools/call", { name: "deploy_agent", arguments: { agent_slug: "review-requester" } }),
      h.deps,
    );
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.deployed.length, 0);
  });
});

// ─── tools/call: bad tool name ───────────────────────────────────────────────

describe("handleChatGptRpc — bad tool name", () => {
  test("unknown tool → -32601", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("tools/call", { name: "frobnicate", arguments: {} }), deps);
    assert.equal((out.body as { error?: { code?: number } }).error?.code, JSONRPC_METHOD_NOT_FOUND);
  });

  test("missing tool name → -32602 or -32601 (a transport error, not a crash)", async () => {
    const { deps } = makeHarness();
    const out = await handleChatGptRpc(rpc("tools/call", { arguments: {} }), deps);
    const code = (out.body as { error?: { code?: number } }).error?.code;
    assert.ok(code === JSONRPC_METHOD_NOT_FOUND || code === JSONRPC_INVALID_PARAMS);
  });
});
