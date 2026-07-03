import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleAgentRentalRpc,
  type AgentRentalRpcDeps,
  type TasteDeps,
} from "../../../../src/lib/marketplace/agent-mcp-handler";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const agent = {
  listingId: "l1",
  slug: "hvac",
  agentName: "HVAC Bot",
  capabilities: ["provide_faq_answer"],
  creatorOrgId: "seller-org",
  creatorOrgName: "Seller",
  creatorOrgSlug: "seller",
  soul: null,
  timezone: "UTC",
  blueprint: { faq: [{ q: "hours?", a: "9-5" }], quoteRanges: [] },
} as unknown as RentalAgent;

function baseDeps(overrides: Partial<AgentRentalRpcDeps> = {}): AgentRentalRpcDeps {
  return {
    resolveAgent: async () => agent,
    runTurn: async () => ({ ok: true, reply: "r", conversationId: "c" }),
    getSecret: () => "secret",
    logUsage: () => {},
    now: () => new Date("2026-07-03T12:00:00Z"),
    ...overrides,
  };
}

function rpc(method: string, params: Record<string, unknown> = {}, id = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function makeTaste(overrides: Partial<TasteDeps> = {}): { taste: TasteDeps; events: Array<[string, Record<string, unknown>]> } {
  const events: Array<[string, Record<string, unknown>]> = [];
  const taste: TasteDeps = {
    ipHash: "iphash1",
    policyFor: async () => ({ active: true, visitorLimit: 3, dailyCap: 50 }),
    checkLimit: async () => true,
    ground: async () => ({ ok: true, text: "grounded! taste_session: tst_abc" }),
    runTasteTurn: async () => ({ ok: true, reply: "taste reply", conversationId: "taste_1" }),
    doorsText: ({ reason }) => `DOORS(${reason})`,
    instructions: ({ visitorLimit }) => `INSTR(${visitorLimit})`,
    track: (event, props) => { events.push([event, props]); },
    ...overrides,
  };
  return { taste, events };
}

// ── The flag-off proof: with taste undefined, every method's outcome is
// deep-equal to today's literal envelopes. ─────────────────────────────────
describe("taste absent => byte-identical to today", () => {
  const CASES: Array<{ name: string; body: string; bearer: string | null; expected: unknown }> = [
    {
      name: "tools/list no bearer",
      body: rpc("tools/list"),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
    {
      name: "tools/call no bearer",
      body: rpc("tools/call", { name: "ask", arguments: { message: "hi" } }),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
    {
      name: "prompts/list no bearer",
      body: rpc("prompts/list"),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
  ];

  for (const c of CASES) {
    it(c.name, async () => {
      const out = await handleAgentRentalRpc("hvac", c.body, c.bearer, baseDeps());
      assert.deepEqual(out, c.expected);
    });
  }

  it("initialize result has NO instructions key without taste", async () => {
    const out = await handleAgentRentalRpc("hvac", rpc("initialize"), null, baseDeps());
    const result = (out.body as { result: Record<string, unknown> }).result;
    assert.equal("instructions" in result, false);
  });
});

// ── Taste active behavior. ──────────────────────────────────────────────────
describe("taste active (no bearer)", () => {
  it("initialize gains instructions", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("initialize"), null, { ...baseDeps(), taste });
    const result = (out.body as { result: Record<string, unknown> }).result;
    assert.equal(result.instructions, "INSTR(3)");
  });

  it("tools/list returns exactly the 4 allowlisted descriptors", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), null, { ...baseDeps(), taste });
    const tools = ((out.body as { result: { tools: Array<{ name: string }> } }).result).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ["ask", "get_quote_range", "ground_on_my_business", "provide_faq_answer"]);
  });

  it("prompts/list STAYS key-gated", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("prompts/list"), null, { ...baseDeps(), taste });
    assert.equal((out.body as { error: { code: number } }).error.code, -32000);
  });

  it("deterministic tool runs anonymously and emits taste_session_started once", async () => {
    const { taste, events } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "provide_faq_answer", arguments: { question: "hours?" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    assert.ok(JSON.stringify(out.body).includes("9-5"));
    assert.deepEqual(events.filter(([e]) => e === "taste_session_started").length, 1);
  });

  it("ground_on_my_business routes to ground and emits taste_grounded", async () => {
    const { taste, events } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ground_on_my_business", arguments: { url: "https://visitor.com" } }), null,
      { ...baseDeps(), taste },
    );
    assert.ok(JSON.stringify(out.body).includes("tst_abc"));
    assert.equal(events.some(([e]) => e === "taste_grounded"), true);
  });

  it("visitor cap exhausted => doors as a SUCCESSFUL text result + taste_limit_hit(visitor_cap)", async () => {
    const { taste, events } = makeTaste({ checkLimit: async (key) => !key.startsWith("taste:calls:") });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ask", arguments: { message: "hi" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    const body = out.body as { result?: unknown; error?: unknown };
    assert.ok(body.result, "doors must be a result, never an error envelope");
    assert.ok(JSON.stringify(body.result).includes("DOORS(visitor_cap)"));
    assert.equal(events.some(([e, p]) => e === "taste_limit_hit" && p.reason === "visitor_cap"), true);
  });

  it("non-allowlisted tool => doors(locked_tool), also a result", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "book_appointment", arguments: {} }), null,
      { ...baseDeps(), taste },
    );
    assert.ok(JSON.stringify((out.body as { result: unknown }).result).includes("DOORS(locked_tool)"));
  });

  it("policyFor inactive (opt-out / no key / unlisted) => today's -32000 exactly", async () => {
    const { taste } = makeTaste({ policyFor: async () => ({ active: false }) });
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), null, { ...baseDeps(), taste });
    assert.deepEqual(out.body, {
      jsonrpc: "2.0", id: 1,
      error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
    });
  });

  it("ANY presented bearer bypasses taste entirely (expired key message preserved)", async () => {
    const { taste } = makeTaste();
    // A structurally-invalid bearer hits the today-path "Invalid rental key.".
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), "rk_junk.junk", { ...baseDeps(), taste });
    assert.equal((out.body as { error: { message: string } }).error.message, "Invalid rental key.");
  });
});

// ── Security follow-up: the per-listing DAILY cap must only be charged
// against LLM-bearing calls (ask, ground_on_my_business), never against
// zero-cost deterministic tools — otherwise an attacker spamming
// get_quote_range for free burns the seller's whole day's funnel budget and
// serves `doors` to real visitors all day. ─────────────────────────────────
describe("taste daily cap — charged only on LLM-bearing calls", () => {
  /** checkLimit stub that counts calls per key PREFIX (mirrors the real
   *  rate-limit key shape `taste:daily:<listingId>` / `taste:calls:...`) so
   *  a spec can assert exactly which counters advance. */
  function countingCheckLimit() {
    const counts: Record<string, number> = {};
    const checkLimit = async (key: string) => {
      const prefix = key.startsWith("taste:daily:") ? "daily" : key.startsWith("taste:calls:") ? "visitor" : "other";
      counts[prefix] = (counts[prefix] ?? 0) + 1;
      return true;
    };
    return { checkLimit, counts };
  }

  it("N deterministic calls do NOT advance the daily counter", async () => {
    const { checkLimit, counts } = countingCheckLimit();
    const { taste } = makeTaste({ checkLimit });
    for (let i = 0; i < 5; i++) {
      const out = await handleAgentRentalRpc(
        "hvac", rpc("tools/call", { name: "provide_faq_answer", arguments: { question: "hours?" } }), null,
        { ...baseDeps(), taste },
      );
      assert.equal(out.status, 200);
    }
    assert.equal(counts.daily ?? 0, 0, "daily cap must never be checked for deterministic tools");
    assert.equal(counts.visitor, 5, "per-visitor cap still applies to every call");
  });

  it("an `ask` call DOES advance the daily counter", async () => {
    const { checkLimit, counts } = countingCheckLimit();
    const { taste } = makeTaste({ checkLimit });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ask", arguments: { message: "hi" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    assert.equal(counts.daily, 1, "ask is LLM-bearing and must charge the daily cap");
  });

  it("a `ground_on_my_business` call DOES advance the daily counter", async () => {
    const { checkLimit, counts } = countingCheckLimit();
    const { taste } = makeTaste({ checkLimit });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ground_on_my_business", arguments: { url: "https://visitor.com" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    assert.equal(counts.daily, 1, "ground_on_my_business is LLM-bearing and must charge the daily cap");
  });

  it("a listing AT its daily cap still serves deterministic taste calls (they were never the cost)", async () => {
    const { taste } = makeTaste({
      checkLimit: async (key) => !key.startsWith("taste:daily:"), // daily cap exhausted, everything else open
    });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "provide_faq_answer", arguments: { question: "hours?" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    assert.ok(JSON.stringify(out.body).includes("9-5"), "deterministic tool must still answer despite daily cap exhaustion");
  });

  it("a listing AT its daily cap refuses `ask` with doors(daily_cap)", async () => {
    const { taste, events } = makeTaste({
      checkLimit: async (key) => !key.startsWith("taste:daily:"),
    });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ask", arguments: { message: "hi" } }), null,
      { ...baseDeps(), taste },
    );
    assert.ok(JSON.stringify((out.body as { result: unknown }).result).includes("DOORS(daily_cap)"));
    assert.equal(events.some(([e, p]) => e === "taste_limit_hit" && p.reason === "daily_cap"), true);
  });
});
