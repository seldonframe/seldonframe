// Unit tests for lib/acp/feed.ts — the PURE ACP/OpenAI product feed builder.
// Maps published marketplace agent rows onto the feed JSON ChatGPT ingests. No
// I/O (the route binds the DB query); this only tests the shape transform.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildProductFeed } from "../../../src/lib/acp/feed";
import type { MarketplaceAgentRow } from "../../../src/lib/marketplace/agent-listings";

function row(overrides: Partial<MarketplaceAgentRow> = {}): MarketplaceAgentRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "review-responder",
    name: "Review Responder",
    description: "Replies to every Google review in your voice.",
    niche: "reviews",
    tags: ["reviews", "reputation"],
    price: 2500,
    agentType: "web-chat",
    installCount: 12,
    rating: 4.8,
    reviewCount: 9,
    isFeatured: true,
    previewImageUrl: "https://cdn.seldonframe.com/agents/review-responder.png",
    ...overrides,
  };
}

describe("buildProductFeed", () => {
  test("maps a paid agent → enable_checkout true + price block", () => {
    const feed = buildProductFeed([row({ price: 2500 })]);
    assert.equal(feed.products.length, 1);
    const p = feed.products[0];
    assert.equal(p.id, "review-responder");
    assert.equal(p.title, "Review Responder");
    assert.equal(p.description, "Replies to every Google review in your voice.");
    assert.deepEqual(p.price, { amount: 2500, currency: "usd" });
    assert.equal(p.availability, "in_stock");
    assert.equal(p.link, "https://app.seldonframe.com/marketplace/review-responder");
    assert.equal(p.image_link, "https://cdn.seldonframe.com/agents/review-responder.png");
    assert.equal(p.product_category, "reviews");
    assert.equal(p.enable_search, true);
    assert.equal(p.enable_checkout, true);
  });

  test("free agent → enable_checkout false (install via the App, not ACP)", () => {
    const feed = buildProductFeed([row({ price: 0 })]);
    assert.equal(feed.products[0].enable_checkout, false);
    assert.deepEqual(feed.products[0].price, { amount: 0, currency: "usd" });
  });

  test("treats a non-positive / non-finite price as free (checkout disabled)", () => {
    const neg = buildProductFeed([row({ price: -5 })]);
    assert.equal(neg.products[0].enable_checkout, false);
    assert.equal(neg.products[0].price.amount, 0);
    const nan = buildProductFeed([row({ price: Number.NaN })]);
    assert.equal(nan.products[0].enable_checkout, false);
    assert.equal(nan.products[0].price.amount, 0);
  });

  test("omits image_link when previewImageUrl is null", () => {
    const feed = buildProductFeed([row({ previewImageUrl: null })]);
    assert.equal("image_link" in feed.products[0], false);
  });

  test("falls back to an empty-string description when null", () => {
    const feed = buildProductFeed([row({ description: null })]);
    assert.equal(feed.products[0].description, "");
  });

  test("maps many rows preserving order", () => {
    const feed = buildProductFeed([
      row({ slug: "a", name: "A" }),
      row({ slug: "b", name: "B", price: 0 }),
    ]);
    assert.deepEqual(
      feed.products.map((p) => [p.id, p.enable_checkout]),
      [
        ["a", true],
        ["b", false],
      ],
    );
  });

  test("empty input → empty products array", () => {
    assert.deepEqual(buildProductFeed([]), { products: [] });
  });
});
