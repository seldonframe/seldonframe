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

type LoggedUsage = {
  slug: string;
  renterOrgId: string;
  creatorOrgId: string;
  amountCents?: number;
  feeCents?: number;
  txRef?: string;
};

type Harness = {
  deps: AgentRentalRpcDeps;
  turns: Array<{ message: string; conversationId?: string }>;
  usage: LoggedUsage[];
};

function makeHarness(
  overrides: {
    agent?: RentalAgent | null;
    turn?: RentalTurnResult;
    getSecret?: () => string;
    runTurn?: (input: { agent: RentalAgent; message: string; conversationId?: string }) => Promise<RentalTurnResult>;
    // ── x402 metering wiring (optional — absent ⇒ today's free behavior). ──
    countRenterCallsThisMonth?: AgentRentalRpcDeps["countRenterCallsThisMonth"];
    settlementVerifier?: AgentRentalRpcDeps["settlementVerifier"];
    houseOrgId?: string;
    payTo?: string;
    resourceUrl?: AgentRentalRpcDeps["resourceUrl"];
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
    logUsage: (entry) =>
      usage.push({
        slug: entry.slug,
        renterOrgId: entry.renterOrgId,
        creatorOrgId: entry.creatorOrgId,
        amountCents: entry.amountCents,
        feeCents: entry.feeCents,
        txRef: entry.txRef,
      }),
    now: () => NOW,
    countRenterCallsThisMonth: overrides.countRenterCallsThisMonth,
    settlementVerifier: overrides.settlementVerifier,
    houseOrgId: overrides.houseOrgId,
    payTo: overrides.payTo,
    resourceUrl: overrides.resourceUrl,
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

  test("with a valid key → the deterministic tools + the optional `ask` tool", async () => {
    const h = makeHarness();
    const out = await handleAgentRentalRpc(SLUG, req("tools/list"), validKey(), h.deps);
    const body = out.body as { result: { tools: Array<{ name: string }> } };
    const names = body.result.tools.map((t) => t.name);
    // Deterministic, renter-driven tools (zero owner compute) + agent-as-a-service.
    assert.ok(names.includes(ASK_TOOL_NAME));
    assert.ok(names.includes("get_quote_range"));
    assert.ok(names.includes("provide_faq_answer"));
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

// ─── rental tools model (BUILD #1) — prompt + deterministic tools ─────────────

const SKILL_MD = "# Sunset Receptionist playbook\nQuote ranges, never firm prices.";

/** A richer agent whose blueprint carries the skill + deterministic data. */
const RENTAL_AGENT: RentalAgent = {
  ...FAKE_AGENT,
  capabilities: ["look_up_availability", "book_appointment", "get_quote_range", "provide_faq_answer"],
  blueprint: {
    capabilities: ["look_up_availability", "book_appointment", "get_quote_range", "provide_faq_answer"],
    customSkillMd: SKILL_MD,
    quoteRanges: [{ service: "Furnace repair", low: 150, high: 600 }],
    faq: [{ q: "What areas do you serve?", a: "All of the greater Phoenix metro." }],
  },
};

describe("prompts/list — gated, advertises the act-as skill prompt", () => {
  test("without a key → unauthorized", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(SLUG, req("prompts/list"), null, h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
  });

  test("with a valid key → one act_as_<slug> prompt", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(SLUG, req("prompts/list"), validKey(), h.deps);
    const body = out.body as { result: { prompts: Array<{ name: string }> } };
    assert.equal(body.result.prompts.length, 1);
    assert.equal(body.result.prompts[0].name, `act_as_${SLUG}`);
  });
});

describe("prompts/get — returns the agent's skill (customSkillMd)", () => {
  test("the known act_as_<slug> prompt returns the playbook as a message", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("prompts/get", { name: `act_as_${SLUG}` }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    const body = out.body as { result: { messages: Array<{ content: { text: string } }> } };
    assert.ok(body.result.messages[0].content.text.includes(SKILL_MD));
    // No agent turn ran — loading a prompt costs the owner nothing.
    assert.equal(h.turns.length, 0);
    assert.equal(h.usage.length, 0);
  });

  test("an unknown prompt name → invalid-params", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("prompts/get", { name: "act_as_someone_else" }),
      validKey(),
      h.deps,
    );
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_INVALID_PARAMS);
  });

  test("without a key → unauthorized", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(SLUG, req("prompts/get", { name: `act_as_${SLUG}` }), null, h.deps);
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
  });
});

describe("tools/call — deterministic tools run with ZERO owner compute", () => {
  test("get_quote_range returns the blueprint range; runTurn NOT called, no usage logged", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    const body = out.body as { result: { content: Array<{ type: string; text: string }> } };
    assert.equal(body.result.content[0].type, "text");
    // The structured result is serialized into the text content.
    assert.match(body.result.content[0].text, /150/);
    assert.match(body.result.content[0].text, /600/);
    // The whole point: no agent loop, no owner LLM spend, nothing to bill.
    assert.equal(h.turns.length, 0);
    assert.equal(h.usage.length, 0);
  });

  test("provide_faq_answer returns a grounded match without running the agent", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "provide_faq_answer", arguments: { question: "what areas do you serve?" } }),
      validKey(),
      h.deps,
    );
    const body = out.body as { result: { content: Array<{ text: string }> } };
    assert.match(body.result.content[0].text, /Phoenix metro/);
    assert.equal(h.turns.length, 0);
  });

  test("get_quote_range with a blank service → invalid-params, no turn", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: " " } }),
      validKey(),
      h.deps,
    );
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_INVALID_PARAMS);
    assert.equal(h.turns.length, 0);
  });

  test("a deterministic tool still requires a valid key", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      null,
      h.deps,
    );
    const body = out.body as { error: { code: number } };
    assert.equal(body.error.code, JSONRPC_UNAUTHORIZED);
  });

  test("ask STILL routes to the live agent (owner's compute) and logs usage", async () => {
    const h = makeHarness({ agent: RENTAL_AGENT });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "Got 2pm Friday?" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    // The agent-as-a-service path is unchanged — it ran and logged usage.
    assert.equal(h.turns.length, 1);
    assert.equal(h.usage.length, 1);
  });
});

// ─── x402 metering (BUILD: x402-native rail) ─────────────────────────────────
//
// When the metering deps are injected, the rail enforces the three lanes:
// discovery stays free; a billable tools/call returns HTTP 402 + the x402
// payment-requirements when payment is due; a valid X-PAYMENT is verified
// (DI'd verifier — dev stub moves NO money) before the tool runs; paid calls
// accrue amount/fee/txRef onto the usage log (no migration). When the deps are
// ABSENT the rail behaves exactly as the tests above (free — backward-compat).

import { devStubVerifier, parseXPaymentHeader, type XPayment } from "../../../src/lib/marketplace/x402";

const HOUSE_ORG = "sf-house-org";

/** A builder's PER-CALL paid agent (per_usage, $2.00/call), creator ≠ house. */
const BUILDER_PAID_AGENT: RentalAgent = {
  ...RENTAL_AGENT,
  creatorOrgId: "builder-org-9",
  priceModel: "per_usage",
  perCallPriceCents: 200,
};

/** A SeldonFrame FIRST-PARTY agent (creator === house org). Free model, but the
 *  SF free/floor lane applies because it's first-party. */
const FIRST_PARTY_AGENT: RentalAgent = {
  ...RENTAL_AGENT,
  creatorOrgId: HOUSE_ORG,
  priceModel: "onetime",
};

/** Base64-encode a payment object as an X-PAYMENT header value would be. */
function xPaymentHeader(baseUnits: string, over: Partial<XPayment> = {}): string {
  const payment = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: { authorization: { value: baseUnits } },
    ...over,
  };
  return Buffer.from(JSON.stringify(payment), "utf8").toString("base64");
}

/** Metering deps preset: counter returns a fixed number, real dev-stub verifier. */
function meteringOverrides(callsThisMonth: number, extra: Parameters<typeof makeHarness>[0] = {}) {
  return {
    houseOrgId: HOUSE_ORG,
    payTo: "0xPayToAddr",
    resourceUrl: (slug: string) => `https://app.seldonframe.com/api/v1/agents/${slug}/mcp`,
    settlementVerifier: devStubVerifier,
    countRenterCallsThisMonth: async () => callsThisMonth,
    ...extra,
  };
}

describe("x402 — discovery is NEVER billable", () => {
  for (const method of ["initialize", "ping", "tools/list", "prompts/list"]) {
    test(`${method} never returns 402 even with a paid agent`, async () => {
      const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(999) });
      const out = await handleAgentRentalRpc(SLUG, req(method), validKey(), h.deps);
      assert.notEqual(out.status, 402);
    });
  }

  test("prompts/get is free to inspect (no 402, no usage)", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(999) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("prompts/get", { name: `act_as_${SLUG}` }),
      validKey(),
      h.deps,
    );
    assert.notEqual(out.status, 402);
    assert.equal(h.usage.length, 0);
  });
});

describe("x402 — builder paid agent: 402 then settle", () => {
  test("a deterministic tools/call WITHOUT X-PAYMENT → HTTP 402 + x402 body, tool NOT run", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 402);
    const body = out.body as { error: { data: { x402Version: number; accepts: Array<{ maxAmountRequired: string; payTo: string; scheme: string }> } } };
    // x402 payment-requirements are carried in the JSON-RPC error envelope's data.
    assert.equal(body.error.data.x402Version, 1);
    assert.equal(body.error.data.accepts[0].scheme, "exact");
    // $2.00 → 2_000_000 USDC base units.
    assert.equal(body.error.data.accepts[0].maxAmountRequired, "2000000");
    assert.equal(body.error.data.accepts[0].payTo, "0xPayToAddr");
    // Nothing was executed or accrued.
    assert.equal(h.usage.length, 0);
  });

  test("ask WITHOUT X-PAYMENT → 402, the agent turn is NOT run", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "Got 2pm?" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 402);
    assert.equal(h.turns.length, 0);
    assert.equal(h.usage.length, 0);
  });

  test("WITH a sufficient X-PAYMENT → tool runs + paid call accrues amount/fee/txRef", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "Got 2pm?" } }),
      validKey(),
      h.deps,
      { "x-payment": xPaymentHeader("2000000") },
    );
    assert.equal(out.status, 200);
    assert.equal(h.turns.length, 1);
    // Accrual via event properties (NO migration): amount + 5% fee + dev txRef.
    assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].amountCents, 200);
    assert.equal(h.usage[0].feeCents, 10); // 5% of $2.00
    assert.match(String(h.usage[0].txRef), /^dev-/);
  });

  test("WITH an underpaying X-PAYMENT → 402 again, tool NOT run", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
      { "x-payment": xPaymentHeader("1000000") }, // only $1.00, need $2.00
    );
    assert.equal(out.status, 402);
    assert.equal(h.usage.length, 0);
  });

  test("a deterministic tools/call THAT IS PAID runs the deterministic lookup (not the agent loop)", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
      { "x-payment": xPaymentHeader("2000000") },
    );
    assert.equal(out.status, 200);
    const body = out.body as { result: { content: Array<{ text: string }> } };
    assert.match(body.result.content[0].text, /150/);
    // Deterministic path → no agent turn, but DID accrue (the renter paid).
    assert.equal(h.turns.length, 0);
    assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].amountCents, 200);
  });
});

describe("x402 — SeldonFrame first-party free/floor lane", () => {
  test("under the free allowance → served free, no 402, accrues amount 0", async () => {
    const h = makeHarness({ agent: FIRST_PARTY_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].amountCents, 0);
  });

  test("over the allowance → 402 for the SF floor (2c → 20000 base units)", async () => {
    const h = makeHarness({ agent: FIRST_PARTY_AGENT, ...meteringOverrides(100) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 402);
    const body = out.body as { error: { data: { accepts: Array<{ maxAmountRequired: string }> } } };
    assert.equal(body.error.data.accepts[0].maxAmountRequired, "20000");
  });

  test("over the allowance + paid → floor accrues, SF keeps 100% (fee == amount)", async () => {
    const h = makeHarness({ agent: FIRST_PARTY_AGENT, ...meteringOverrides(100) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "get_quote_range", arguments: { service: "furnace repair" } }),
      validKey(),
      h.deps,
      { "x-payment": xPaymentHeader("20000") },
    );
    assert.equal(out.status, 200);
    assert.equal(h.usage[0].amountCents, 2);
    assert.equal(h.usage[0].feeCents, 2); // SF keeps the whole floor
  });
});

describe("x402 — free builder agent (no metered price) stays free", () => {
  test("an unpriced builder agent never 402s and accrues amount 0", async () => {
    // RENTAL_AGENT default priceModel is undefined → free lane.
    const h = makeHarness({ agent: RENTAL_AGENT, ...meteringOverrides(9999) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "hi" } }),
      validKey(),
      h.deps,
    );
    assert.equal(out.status, 200);
    assert.equal(h.turns.length, 1);
    assert.equal(h.usage.length, 1);
    assert.equal(h.usage[0].amountCents, 0);
  });
});

describe("x402 — the counter is scoped to renter + listing", () => {
  test("countRenterCallsThisMonth is called with the renter, listing, creator", async () => {
    const seen: Array<{ renterOrgId: string; listingId: string; creatorOrgId: string }> = [];
    const h = makeHarness({
      agent: BUILDER_PAID_AGENT,
      ...meteringOverrides(0, {
        countRenterCallsThisMonth: async (input) => {
          seen.push({ renterOrgId: input.renterOrgId, listingId: input.listingId, creatorOrgId: input.creatorOrgId });
          return 0;
        },
      }),
    });
    await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "hi" } }),
      validKey(),
      h.deps,
      { "x-payment": xPaymentHeader("2000000") },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].renterOrgId, RENTER_ORG);
    assert.equal(seen[0].listingId, "listing-1");
    assert.equal(seen[0].creatorOrgId, "builder-org-9");
  });
});

describe("x402 — header parse is robust", () => {
  test("a garbage X-PAYMENT header on a billable call → 402 (treated as unpaid)", async () => {
    const h = makeHarness({ agent: BUILDER_PAID_AGENT, ...meteringOverrides(0) });
    const out = await handleAgentRentalRpc(
      SLUG,
      req("tools/call", { name: "ask", arguments: { message: "hi" } }),
      validKey(),
      h.deps,
      { "x-payment": "!!!notbase64!!!" },
    );
    assert.equal(out.status, 402);
    // sanity: the same garbage parses to ok:false at the unit level.
    assert.equal(parseXPaymentHeader("!!!notbase64!!!").ok, false);
  });
});
