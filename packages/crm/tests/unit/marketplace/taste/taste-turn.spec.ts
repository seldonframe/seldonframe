import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTasteTurn, type TasteTurnDeps } from "../../../../src/lib/marketplace/taste/taste-turn";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const agent = {
  listingId: "l1",
  slug: "hvac",
  agentName: "HVAC Bot",
  capabilities: ["provide_faq_answer", "get_quote_range", "book_appointment", "take_message"],
  creatorOrgId: "seller-org",
  creatorOrgName: "Seller Co",
  creatorOrgSlug: "seller",
  soul: null,
  timezone: "UTC",
  blueprint: { capabilities: ["provide_faq_answer", "get_quote_range", "book_appointment"] },
} as unknown as RentalAgent;

function makeDeps(overrides: Partial<TasteTurnDeps> = {}) {
  const seen: { turnInputs: unknown[]; getClientCalls: number } = { turnInputs: [], getClientCalls: 0 };
  const deps: TasteTurnDeps = {
    getClient: async () => {
      seen.getClientCalls += 1;
      return { client: { fake: true } as never, provider: "anthropic" };
    },
    runTurn: async (input) => {
      seen.turnInputs.push(input);
      return { ok: true, reply: "grounded reply", toolCalls: [] };
    },
    flagshipOrgIds: new Set<string>(),
    ...overrides,
  };
  return { deps, seen };
}

describe("runTasteTurn — money invariant", () => {
  it("REFUSES when the seller resolves to the platform key and is not flagship — and never runs the turn", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: { fake: true } as never, provider: "platform" }),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_taste_key");
    assert.equal(seen.turnInputs.length, 0, "turn runner must NOT be invoked on the refusal branch");
  });

  it("ALLOWS platform key for a flagship org", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: { fake: true } as never, provider: "platform" }),
      flagshipOrgIds: new Set(["seller-org"]),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, true);
    assert.equal(seen.turnInputs.length, 1);
  });

  it("refuses cleanly when no client resolves at all", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: null, provider: "platform" }),
      flagshipOrgIds: new Set(["seller-org"]),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, false);
    assert.equal(seen.turnInputs.length, 0);
  });
});

describe("runTasteTurn — pinning and fencing", () => {
  it("pins haiku + 400 tokens + testMode:true + intersected capabilities", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.modelOverride, "claude-3-5-haiku-20241022");
    assert.equal(input.maxTokensOverride, 400);
    assert.equal(input.testMode, true);
    const bp = input.blueprint as { capabilities: string[] };
    assert.deepEqual([...bp.capabilities].sort(), ["get_quote_range", "provide_faq_answer"]);
  });

  it("wears the visitor's business when grounding is present", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn(
      {
        agent,
        message: "hi",
        grounding: { businessName: "Visitor Plumbing", sourceDomain: "visitor.com", industry: "plumbing" },
      },
      deps,
    );
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.orgName, "Visitor Plumbing");
  });

  it("falls back to the seller's identity ungrounded", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.orgName, "Seller Co");
  });
});
