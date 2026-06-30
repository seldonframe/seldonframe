// discover — the unified catalog ranker (spec 1ff09dcb, P1 Task 1).
//
// `discoverCatalog(query, catalog)` is a natural-language search over a UNIFIED
// CatalogEntry list (agents = published marketplace listings, tools = Composio
// actions). It ranks by relevance and returns the top-N, each with its price —
// the Monid `discover` shape. These tests pin the PURE ranker + the pure
// catalog-entry builders (no DB, no SDK): the route is a thin guard + assembly
// over these.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  discoverCatalog,
  agentListingToCatalogEntry,
  composioToolToCatalogEntry,
  type CatalogEntry,
} from "../../../src/lib/build/discover";

// A small fixed catalog the ranker tests reason over.
const CATALOG: CatalogEntry[] = [
  {
    id: "ace-receptionist",
    type: "agent",
    name: "24/7 AI Receptionist",
    description: "Answers calls, qualifies the lead, and books the job.",
    price: { type: "per_call", amountCents: 10 },
  },
  {
    id: "review-requester",
    type: "agent",
    name: "Review Requester",
    description: "Texts happy customers a Google review link after a booking.",
    price: { type: "per_outcome", amountCents: 50, outcomeType: "review" },
  },
  {
    id: "GMAIL_SEND_EMAIL",
    type: "tool",
    provider: "gmail",
    name: "Gmail — Send Email",
    description: "Send an email from the connected Gmail account.",
    price: { type: "per_call", amountCents: 0 },
  },
  {
    id: "SLACK_SEND_MESSAGE",
    type: "tool",
    provider: "slack",
    name: "Slack — Send Message",
    description: "Post a message to a Slack channel.",
    price: { type: "per_call", amountCents: 0 },
  },
];

describe("discoverCatalog", () => {
  test("returns results[] each carrying a price (Monid discover shape)", () => {
    const results = discoverCatalog("send email", CATALOG);
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.ok(r.id);
      assert.ok(r.price);
      assert.ok(typeof r.price.amountCents === "number");
      // relevance score is surfaced for ranking transparency.
      assert.ok(typeof r.score === "number");
    }
  });

  test("ranks the most relevant entry first (gmail for 'send an email')", () => {
    const results = discoverCatalog("send an email to a customer", CATALOG);
    assert.equal(results[0].id, "GMAIL_SEND_EMAIL");
  });

  test("matches an agent by name + description tokens", () => {
    const results = discoverCatalog("book the job receptionist", CATALOG);
    assert.equal(results[0].id, "ace-receptionist");
  });

  test("respects the limit (top-N)", () => {
    // A broad query that touches several entries; limit caps the slice.
    const results = discoverCatalog("send", CATALOG, 1);
    assert.equal(results.length, 1);
  });

  test("an empty / whitespace query returns the catalog (capped), not a crash", () => {
    const results = discoverCatalog("   ", CATALOG, 2);
    assert.equal(results.length, 2);
  });

  test("a no-hit query returns [] (every entry scored 0 is dropped)", () => {
    const results = discoverCatalog("quantum chromodynamics zzzz", CATALOG);
    assert.equal(results.length, 0);
  });

  test("never throws on a non-string query", () => {
    const results = discoverCatalog(undefined as unknown as string, CATALOG, 3);
    // Treated as empty → catalog slice.
    assert.equal(results.length, 3);
  });

  test("a phrase in the name outranks a single incidental description token", () => {
    const results = discoverCatalog("review requester", CATALOG);
    assert.equal(results[0].id, "review-requester");
  });
});

describe("agentListingToCatalogEntry", () => {
  test("maps a per_usage listing to a per_call price", () => {
    const e = agentListingToCatalogEntry({
      slug: "ace",
      name: "Ace",
      description: "An agent.",
      priceModel: "per_usage",
      price: 0,
      perCallPriceCents: 10,
      perOutcomePriceCents: null,
      outcomeType: null,
    });
    assert.equal(e.type, "agent");
    assert.equal(e.id, "ace");
    assert.equal(e.price.type, "per_call");
    assert.equal(e.price.amountCents, 10);
  });

  test("maps a per_outcome listing to a per_outcome price + outcomeType", () => {
    const e = agentListingToCatalogEntry({
      slug: "rev",
      name: "Rev",
      description: null,
      priceModel: "per_outcome",
      price: 0,
      perCallPriceCents: null,
      perOutcomePriceCents: 1000,
      outcomeType: "booking",
    });
    assert.equal(e.price.type, "per_outcome");
    assert.equal(e.price.amountCents, 1000);
    assert.equal(e.price.outcomeType, "booking");
    // a null description never lands as the literal "null".
    assert.equal(e.description, "");
  });

  test("a onetime/free listing maps to a per_call price of 0 (free to run on the rail)", () => {
    const e = agentListingToCatalogEntry({
      slug: "free",
      name: "Free",
      description: "x",
      priceModel: "onetime",
      price: 0,
      perCallPriceCents: null,
      perOutcomePriceCents: null,
      outcomeType: null,
    });
    assert.equal(e.price.type, "per_call");
    assert.equal(e.price.amountCents, 0);
  });
});

describe("composioToolToCatalogEntry", () => {
  test("maps a toolkit action to a tool entry with provider = toolkit slug", () => {
    const e = composioToolToCatalogEntry("gmail", "GMAIL_SEND_EMAIL");
    assert.equal(e.type, "tool");
    assert.equal(e.id, "GMAIL_SEND_EMAIL");
    assert.equal(e.provider, "gmail");
    // tool price is per_call, 0 by default (P1 charges nothing; the rate is a P2
    // wallet concern) — so a discover result never implies a charge.
    assert.equal(e.price.type, "per_call");
    assert.equal(e.price.amountCents, 0);
    // the name is humanized from the action slug.
    assert.match(e.name, /Gmail/i);
  });
});
