// find_blocks — the in-prompt registry search endpoint (virality pack, Task 4).
//
// scoreBlockMatch is a PURE term-overlap scorer over name+description+niche —
// no DB, no I/O. searchBlocks({ q, limit }) is the thin async wrapper that
// calls listMarketplaceAgentsFromDb and ranks/limits the rows with the pure
// scorer, so it is DI'd via a fake loader here (never touches Postgres).
//
// Same convention as fork-listing.spec.ts / share-card.spec.ts: node:test +
// node:assert/strict, relative import, no framework.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  scoreBlockMatch,
  searchBlocks,
  type BlockSearchRow,
} from "../../../src/lib/marketplace/blocks-search";

// ─── fixtures ─────────────────────────────────────────────────────────────

const RECEPTIONIST: BlockSearchRow = {
  slug: "voice-receptionist",
  name: "Voice Receptionist",
  description: "Answers every call, books appointments, and never misses a lead.",
  niche: "Receptionist",
  agentType: "voice_receptionist",
  installCount: 500,
  isFeatured: true,
};

const REVIEW_REQUESTER: BlockSearchRow = {
  slug: "review-requester",
  name: "Review Requester",
  description: "Follows up after every job to collect 5-star Google reviews.",
  niche: "Reviews",
  agentType: "chat_assistant",
  installCount: 250,
  isFeatured: false,
};

const QUOTE_BOT: BlockSearchRow = {
  slug: "quote-bot",
  name: "Quote Bot",
  description: "Turns inbound leads into instant, accurate quotes.",
  niche: "Quote",
  agentType: "chat_assistant",
  installCount: 900,
  isFeatured: false,
};

const REACTIVATION_AGENT: BlockSearchRow = {
  slug: "reactivation-agent",
  name: "Reactivation Agent",
  description: "Wins back dormant customers with a friendly nudge.",
  niche: "Reactivation",
  agentType: "chat_assistant",
  installCount: 10,
  isFeatured: false,
};

const ALL_ROWS = [RECEPTIONIST, REVIEW_REQUESTER, QUOTE_BOT, REACTIVATION_AGENT];

// ─── scoreBlockMatch — term overlap ──────────────────────────────────────────

describe("scoreBlockMatch — term overlap over name+description+niche", () => {
  test("a query matching the name scores higher than zero", () => {
    const score = scoreBlockMatch("voice receptionist", RECEPTIONIST);
    assert.ok(score > 0, "expected a positive score for a name match");
  });

  test("a query with no overlapping terms scores zero", () => {
    const score = scoreBlockMatch("skydiving instructor", RECEPTIONIST);
    assert.equal(score, 0);
  });

  test("more overlapping terms score higher than fewer", () => {
    // "review requester google" overlaps name(2) + description("google") = 3 terms.
    const strong = scoreBlockMatch("review requester google", REVIEW_REQUESTER);
    // "review" alone overlaps 1 term.
    const weak = scoreBlockMatch("review", REVIEW_REQUESTER);
    assert.ok(strong > weak, `expected stronger overlap (${strong}) > weaker overlap (${weak})`);
  });

  test("matching in the niche field contributes to the score", () => {
    const score = scoreBlockMatch("reactivation", REACTIVATION_AGENT);
    assert.ok(score > 0);
  });

  test("matching in the description field contributes to the score", () => {
    const score = scoreBlockMatch("dormant customers nudge", REACTIVATION_AGENT);
    assert.ok(score > 0);
  });

  test("is case-insensitive", () => {
    const lower = scoreBlockMatch("voice receptionist", RECEPTIONIST);
    const upper = scoreBlockMatch("VOICE RECEPTIONIST", RECEPTIONIST);
    const mixed = scoreBlockMatch("VoIcE ReCePtIoNiSt", RECEPTIONIST);
    assert.equal(lower, upper);
    assert.equal(lower, mixed);
    assert.ok(lower > 0);
  });

  test("is case-insensitive against mixed-case row fields too", () => {
    const shoutyRow: BlockSearchRow = { ...RECEPTIONIST, name: "VOICE RECEPTIONIST" };
    const score = scoreBlockMatch("voice receptionist", shoutyRow);
    assert.ok(score > 0);
  });

  test("an empty query scores zero (ranking falls back to featured/installCount)", () => {
    assert.equal(scoreBlockMatch("", RECEPTIONIST), 0);
    assert.equal(scoreBlockMatch("   ", RECEPTIONIST), 0);
  });

  test("punctuation in the query does not prevent a match", () => {
    const score = scoreBlockMatch("receptionist, please!", RECEPTIONIST);
    assert.ok(score > 0);
  });

  test("a null description does not throw and simply contributes no match", () => {
    const row: BlockSearchRow = { ...RECEPTIONIST, description: null };
    assert.doesNotThrow(() => scoreBlockMatch("book appointments", row));
    const score = scoreBlockMatch("voice receptionist", row);
    assert.ok(score > 0, "name+niche still match even with a null description");
  });
});

// ─── searchBlocks — ranking + ordering + limit ───────────────────────────────

describe("searchBlocks — non-empty query ranks by overlap score", () => {
  test("returns rows ordered by descending overlap score", async () => {
    const results = await searchBlocks(
      { q: "reviews google", limit: 10 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.ok(results.length > 0);
    assert.equal(results[0].slug, "review-requester", "the review-matching row should rank first");
  });

  test("rows with zero score are excluded from a non-empty query", async () => {
    const results = await searchBlocks(
      { q: "voice receptionist calls", limit: 10 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.ok(results.every((r) => r.slug !== "reactivation-agent"));
  });
});

describe("searchBlocks — empty query falls back to featured then installCount", () => {
  test("featured rows come first, then by descending installCount", async () => {
    const results = await searchBlocks(
      { q: "", limit: 10 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.equal(results[0].slug, "voice-receptionist", "the only featured row leads");
    // Remaining rows (not featured) ordered by installCount desc: quote-bot(900) >
    // review-requester(250) > reactivation-agent(10).
    assert.deepEqual(
      results.slice(1).map((r) => r.slug),
      ["quote-bot", "review-requester", "reactivation-agent"],
    );
  });

  test("whitespace-only query is treated as empty (featured/installCount fallback)", async () => {
    const results = await searchBlocks(
      { q: "   ", limit: 10 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.equal(results[0].slug, "voice-receptionist");
  });
});

describe("searchBlocks — limit is respected", () => {
  test("caps the result count at limit for a non-empty query", async () => {
    const results = await searchBlocks(
      { q: "agent bot receptionist quote review reactivation customers leads", limit: 2 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.equal(results.length, 2);
  });

  test("caps the result count at limit for an empty query", async () => {
    const results = await searchBlocks(
      { q: "", limit: 1 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, "voice-receptionist");
  });

  test("limit larger than the row count returns all rows, no throw", async () => {
    const results = await searchBlocks(
      { q: "", limit: 999 },
      { listAgents: async () => ALL_ROWS },
    );
    assert.equal(results.length, ALL_ROWS.length);
  });
});

describe("searchBlocks — output shape", () => {
  test("each result carries slug/name/description/niche/kind/url/trust", async () => {
    const results = await searchBlocks(
      { q: "", limit: 1 },
      { listAgents: async () => ALL_ROWS },
    );
    const [r] = results;
    assert.equal(r.slug, "voice-receptionist");
    assert.equal(r.name, "Voice Receptionist");
    assert.equal(typeof r.description, "string");
    assert.equal(r.niche, "Receptionist");
    assert.equal(r.kind, "agent");
    assert.equal(r.url, "https://www.seldonframe.com/marketplace/voice-receptionist");
    assert.equal(r.trust, null, "trust is null when the row carries no trustStats");
  });

  test("trust is read defensively from an optional trustStats field (improve-build forward compat)", async () => {
    const rowWithTrust = {
      ...RECEPTIONIST,
      trustStats: { evalPassRate: 0.97, scenarioCount: 42 },
    };
    const results = await searchBlocks(
      { q: "", limit: 1 },
      { listAgents: async () => [rowWithTrust] },
    );
    assert.deepEqual(results[0].trust, { evalPassRate: 0.97, scenarioCount: 42 });
  });

  test("a description of null renders as an empty string, never null, in the output", async () => {
    const rowNoDescription = { ...RECEPTIONIST, description: null };
    const results = await searchBlocks(
      { q: "", limit: 1 },
      { listAgents: async () => [rowNoDescription] },
    );
    assert.equal(results[0].description, "");
  });
});

describe("searchBlocks — empty catalog", () => {
  test("returns an empty array, never throws", async () => {
    const results = await searchBlocks({ q: "anything", limit: 5 }, { listAgents: async () => [] });
    assert.deepEqual(results, []);
  });
});
