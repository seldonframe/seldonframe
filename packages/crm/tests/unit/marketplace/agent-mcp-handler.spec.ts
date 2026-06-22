// Agent-marketplace MCP rental — tests for the DI'd request handler.
//
// Drives the full JSON-RPC method dispatch + the rental-key auth gate + the
// usage-log hook end-to-end with FAKE deps (no DB, no LLM, no network). Uses
// the REAL mintRentalKey/verifyRentalKey so the auth path is exercised for
// real. Pattern: dependency injection (the repo prefers DI over mock.module —
// see missed-call-textback.spec.ts).
//
// Covers the live gate the spec calls out: add the MCP server with a valid key
// → call `ask` → the agent responds → usage is logged. Plus every guard:
// missing/expired/wrong-agent/invalid key, initialize-without-auth,
// agent-not-found, unknown method, notification ack, degraded turn.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  handleAgentRentalRpc,
  JSONRPC_UNAUTHORIZED,
  type AgentRentalRpcDeps,
} from "../../../src/lib/marketplace/agent-mcp-handler";
import { mintRentalKey } from "../../../src/lib/marketplace/rental-token";
import {
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  ASK_TOOL_NAME,
  MCP_PROTOCOL_VERSION,
} from "../../../src/lib/marketplace/agent-mcp-rpc";
import type { RentalAgent, RentalTurnResult } from "../../../src/lib/marketplace/agent-rental-run";

const FAKE_SECRET = "FAKE_RENTAL_SECRET_NOT_A_REAL_HMAC_KEY";
const SLUG = "sunset-receptionist";
const RENTER_ORG = "renter-org-1";
const NOW = new Date("2026-06-22T12:00:00Z");

const FAKE_AGENT: RentalAgent = {
  listingId: "listing-1",
  slug: SLUG,
  agentName: "Sunset Receptionist",
  capabilities: ["look_up_availability", "book_appointment"],
  creatorOrgId: "creator-org-1",
  creatorOrgName: "Sunset Plumbing",
  creatorOrgSlug: "sunset-plumbing",
  soul: null,
  timezone: "America/New_York",
  blueprint: { capabilities: ["look_up_availability", "book_appointment"] },
};

type Harness = {
  deps: AgentRentalRpcDeps;
  turns: Array<{ message: string; conversationId?: string }>;
  usage: Array<{ slug: string; renterOrgId: string; creatorOrgId: string }>;
};

function makeHarness(
  overrides: {
    agent?: RentalAgent | null;
    turn?: RentalTurnResult;
    getSecret?: () => string;
    runTurn?: (input: { agent: RentalAgent; message: string; conversationId?: string }) => Promise<RentalTurnResult>;
  } = {},
): Harness {
  const turns: Harness["turns"] = [];
  const usage: Harness["usage"] = [];
  const agent = overrides.agent === undefined ? FAKE_AGENT : overrides.agent;
  const defaultTurn: RentalTurnResult = overrides.turn ?? {
    ok: true,
    reply: "We have 2pm Friday open — shall I book it?",
    conversationId: "rental_conv_1",
  };
  const deps: AgentRentalRpcDeps = {
    resolveAgent: async () => agent,
    runTurn:
      overrides.runTurn ??
      (async (input) => {
        turns.push({ message: input.message, conversationId: input.conversationId });
        return defaultTurn;
      }),
    getSecret: overrides.getSecret ?? (() => FAKE_SECRET),
    logUsage: (entry) => usage.push({ slug: entry.slug, renterOrgId: entry.renterOrgId, creatorOrgId: entry.creatorOrgId }),
    now: () => NOW,
  };
  return { deps, turns, usage };
}

function validKey(slug = SLUG, org = RENTER_ORG): string {
  return mintRentalKey({ slug, renterOrgId: org, secret: FAKE_SECRET, now: NOW });
}

const req = (method: string, params?: unknown, id: number | string | null = 1) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) });

describe("initialize — no auth required", () => {
  test("returns server info named for the agent without a bearer key", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("initialize"), null, h.deps);
    assert.equal(out.status, 200);
    const body = out.body as { result: { protocolVersion: string; serverInfo: { name: string } } };
    assert.equal(body.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.equal(body.result.serverInfo.name, "Sunset Receptionist");
  });
});

describe("notifications — acked with 202 + no body", () => {
  test("notifications/initialized returns 202 and null body", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), null, h.deps);
    assert.equal(out.status, 202);
    assert.equal(out.body, null);
  });
});

describe("agent resolution", () => {
  test("unknown slug → method-not-found", async () => {
    const h = makeHarness({ agent: null });
    const out = await handleAgentRentalRpc("nope", req("initialize"), null, h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_METHOD_NOT_FOUND);
  });
});

describe("tools/list — gated by a valid key", () => {
  test("without a key → unauthorized (-32000)", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), null, h.deps);
    const body = out.body as { error: { code: number; message: string } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
    assert.match(body.error.message, /Missing rental key/);
  });

  test("with a valid key → the one `ask` tool", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), validKey(), h.deps);
    const body = out.body as { result: { tools: Array<{ name: string }> } };
    assert.equal(body.result.tools.length, 1);
    assert.equal(body.result.tools[0].name, ASK_TOOL_NAME);
  });
});

describe("tools/call — THE LIVE GATE: ask → agent responds → usage logged", () => {
  test("valid key + ask reaches runTurn and returns the reply as MCP content", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "Got 2pm Friday?" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    // The agent ran with our message.
    assert.equal(h.turns.length, 1);
    assert.equal(h.turns[0].message, "Got 2pm Friday?");
    // The reply came back as MCP tool content.
    const body = out.body as { result: { content: Array<{ type: string; text: string }>; conversationId: string } };
    assert.equal(body.result.content[0].type, "text");
    assert.match(body.result.content[0].text, /2pm Friday/);
    assert.equal(body.result.conversationId, "rental_conv_1");
    // And usage was logged with the renter + creator orgs (the 2% hook).
    assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].renterOrgId, RENTER_ORG);
    assert.equal(h.usage[0].creatorOrgId, "creator-org-1");
    assert.equal(h.usage[0].slug, SLUG);
  });

  test("conversation_id is threaded into the turn", async () => {
    const h = makeHarness();
    await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "yes", conversation_id: "c-99" } }),
      validKey(),
      h.deps,
    );
    assert.equal(h.turns[0].conversationId, "c-99");
  });

  test("without a key → unauthorized, runTurn NOT called", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/call", { name: "ask", arguments: { message: "x" } }), null, h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
    assert.equal(h.turns.length, 0);
    assert.equal(h.usage.length, 0);
  });

  test("unknown tool name → method-not-found, no turn", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/call", { name: "wipe_db", arguments: { message: "x" } }), validKey(), h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_METHOD_NOT_FOUND);
    assert.equal(h.turns.length, 0);
  });

  test("blank message → invalid-params, no turn", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/call", { name: "ask", arguments: { message: "  " } }), validKey(), h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.turns.length, 0);
  });

  test("degraded turn → MCP tool error result (isError), no usage logged", async () => {
    const h = makeHarness({ turn: { ok: false, reason: "llm_not_configured", message: "Not available right now." } });
    const out = await handleAgentRentalRpc(SLUG, req("tools/call", { name: "ask", arguments: { message: "x" } }), validKey(), h.deps);
    const body = out.body as { result: { content: Array<{ text: string }>; isError: boolean } };
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /Not available/);
    assert.equal(h.usage.length, 0);
  });

  test("runTurn throwing → internal error envelope (no crash)", async () => {
    const h = makeHarness({
      runTurn: async () => {
        throw new Error("boom");
      },
    });
    const out = await handleAgentRentalRpc(SLUG, req("tools/call", { name: "ask", arguments: { message: "x" } }), validKey(), h.deps);
    const body = out.body as { error: { code: number; message: string } };
    assert.equal(body.error.code, -32603);
    assert.match(body.error.message, /failed to respond/);
  });
});

describe("auth verdicts are distinct + precise", () => {
  test("expired key → unauthorized with an expiry hint", async () => {
    const h = makeHarness();
    const expiredKey = mintRentalKey({ slug: SLUG, renterOrgId: RENTER_ORG, secret: FAKE_SECRET, now: NOW, ttlSeconds: 60 });
    // now() is 2 minutes after issue → expired.
    const deps = { ...h.deps, now: () => new Date(NOW.getTime() + 120 * 1000) };
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), expiredKey, deps);
    const body = out.body as { error: { code: number; message: string } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
    assert.match(body.error.message, /expired/i);
  });

  test("a key minted for another agent → unauthorized (wrong agent)", async () => {
    const h = makeHarness();
    const otherKey = validKey("a-different-agent");
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), otherKey, h.deps);
    const body = out.body as { error: { code: number; message: string } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
    assert.match(body.error.message, /different agent/i);
  });

  test("garbage key → unauthorized (invalid)", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), "rk_garbage.signature", h.deps);
    const body = out.body as { error: { code: number; message: string } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
    assert.match(body.error.message, /invalid/i);
  });

  test("secret unavailable → internal error (verification temporarily down)", async () => {
    const h = makeHarness({
      getSecret: () => {
        throw new Error("no secret");
      },
    });
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), validKey(), h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, -32603);
  });
});

describe("unknown method", () => {
  test("→ method-not-found", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("resources/list"), validKey(), h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_METHOD_NOT_FOUND);
  });
});
