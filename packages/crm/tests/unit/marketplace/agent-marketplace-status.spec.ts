// ICP-3 — per-template MARKETPLACE STATUS for the "Your agents" roster (pure).
//
// The DB query (loadAgentMarketplaceStatusForOrg) is a thin two-read wrapper
// over computeListingEarnings (already TDD'd in earnings.spec.ts), so these specs
// pin the PURE seams it depends on — the same seams the table cell renders:
//   • marketplacePriceLabel — the compact price label off a listing's pricing
//     columns (monthly $29 → "$29/mo"; per_usage → "$5 per call"; onetime → "$50
//     one-time"; free → "Free"). Mirrors the storefront so the roster never
//     disagrees with the listing page.
//   • marketplaceStatusFor — a listed template surfaces price+revenue; an
//     unlisted template (absent from the map, incl. the fail-soft empty-map case)
//     reads listed:false / revenue 0.
//   • marketplaceCellState — the presentational projection: "$120 earned" vs "—".
//
// Run:
//   node --import tsx --test tests/unit/marketplace/agent-marketplace-status.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  marketplacePriceLabel,
  marketplaceCellState,
  marketplaceStatusFor,
  type AgentMarketplaceStatus,
} from "../../../src/lib/marketplace/agent-marketplace-status";

describe("marketplacePriceLabel", () => {
  test("monthly $29 → \"$29/mo\"", () => {
    assert.equal(
      marketplacePriceLabel({ priceModel: "monthly", monthlyPriceCents: 2900, price: 0 }),
      "$29/mo",
    );
  });

  test("per_usage $5 → \"$5 per call\"", () => {
    assert.equal(
      marketplacePriceLabel({ priceModel: "per_usage", perCallPriceCents: 500, price: 0 }),
      "$5 per call",
    );
  });

  test("onetime $50 → \"$50 one-time\"", () => {
    assert.equal(
      marketplacePriceLabel({ priceModel: "onetime", price: 5000 }),
      "$50 one-time",
    );
  });

  test("free (onetime, price 0) → \"Free\"", () => {
    assert.equal(marketplacePriceLabel({ priceModel: "onetime", price: 0 }), "Free");
  });

  test("per_outcome $10 / booking → \"$10 per booking\"", () => {
    assert.equal(
      marketplacePriceLabel({
        priceModel: "per_outcome",
        perOutcomePriceCents: 1000,
        outcomeType: "booking",
        price: 0,
      }),
      "$10 per booking",
    );
  });

  test("a monthly model with no amount set reads \"Free\" (never \"$0/mo\")", () => {
    assert.equal(
      marketplacePriceLabel({ priceModel: "monthly", monthlyPriceCents: null, price: 0 }),
      "Free",
    );
  });

  test("legacy / unknown model coerces to onetime (reads price)", () => {
    assert.equal(marketplacePriceLabel({ priceModel: null, price: 4900 }), "$49 one-time");
  });
});

describe("marketplaceStatusFor", () => {
  function listed(over: Partial<AgentMarketplaceStatus> = {}): AgentMarketplaceStatus {
    return {
      listed: true,
      slug: "front-desk",
      published: true,
      priceLabel: "$29/mo",
      priceModel: "monthly",
      revenueCents: 12000,
      ...over,
    };
  }

  test("a listed template surfaces its price + revenue", () => {
    const map = new Map<string, AgentMarketplaceStatus>([["tmpl-1", listed()]]);
    const status = marketplaceStatusFor(map, "tmpl-1");
    assert.equal(status.listed, true);
    assert.equal(status.slug, "front-desk");
    assert.equal(status.priceLabel, "$29/mo");
    assert.equal(status.revenueCents, 12000);
    assert.equal(status.published, true);
  });

  test("an unlisted template (absent from the map) → listed:false, revenue 0", () => {
    const map = new Map<string, AgentMarketplaceStatus>([["tmpl-1", listed()]]);
    const status = marketplaceStatusFor(map, "tmpl-UNKNOWN");
    assert.equal(status.listed, false);
    assert.equal(status.published, false);
    assert.equal(status.revenueCents, 0);
    assert.equal(status.slug, undefined);
    assert.equal(status.priceLabel, "Free");
  });

  test("fail-soft: an EMPTY map (the DB-error degrade) reads every template NOT listed", () => {
    // loadAgentMarketplaceStatusForOrg returns an empty map on any read error;
    // every template must then resolve to NOT listed with no revenue.
    const empty = new Map<string, AgentMarketplaceStatus>();
    const status = marketplaceStatusFor(empty, "any-template");
    assert.equal(status.listed, false);
    assert.equal(status.revenueCents, 0);
  });

  test("a listed-but-unpublished (draft) template still surfaces, marked not published", () => {
    const map = new Map<string, AgentMarketplaceStatus>([
      ["tmpl-2", listed({ published: false, revenueCents: 0, priceLabel: "$50 one-time" })],
    ]);
    const status = marketplaceStatusFor(map, "tmpl-2");
    assert.equal(status.listed, true);
    assert.equal(status.published, false);
    assert.equal(status.priceLabel, "$50 one-time");
  });
});

describe("marketplaceCellState", () => {
  function status(over: Partial<AgentMarketplaceStatus> = {}): AgentMarketplaceStatus {
    return {
      listed: true,
      slug: "front-desk",
      published: true,
      priceLabel: "$29/mo",
      priceModel: "monthly",
      revenueCents: 12000,
      ...over,
    };
  }

  test("listed with revenue → shows price + \"$120 earned\"", () => {
    const cell = marketplaceCellState(status({ revenueCents: 12000 }));
    assert.equal(cell.listed, true);
    assert.equal(cell.priceLabel, "$29/mo");
    assert.equal(cell.showRevenue, true);
    assert.equal(cell.revenueLabel, "$120 earned");
  });

  test("listed with zero revenue → \"—\" (never \"$0 earned\")", () => {
    const cell = marketplaceCellState(status({ revenueCents: 0 }));
    assert.equal(cell.showRevenue, false);
    assert.equal(cell.revenueLabel, "—");
  });

  test("revenue is formatted as a compact whole-dollar figure with thousands sep", () => {
    const cell = marketplaceCellState(status({ revenueCents: 150000 }));
    assert.equal(cell.revenueLabel, "$1,500 earned");
  });

  test("not-listed status → not listed, no revenue", () => {
    const cell = marketplaceCellState({
      listed: false,
      published: false,
      priceLabel: "Free",
      priceModel: "onetime",
      revenueCents: 0,
    });
    assert.equal(cell.listed, false);
    assert.equal(cell.showRevenue, false);
    assert.equal(cell.revenueLabel, "—");
  });

  test("defensive: negative / non-finite revenue clamps to no-revenue", () => {
    assert.equal(marketplaceCellState(status({ revenueCents: -500 })).showRevenue, false);
    assert.equal(
      marketplaceCellState(status({ revenueCents: Number.NaN })).showRevenue,
      false,
    );
  });

  test("a missing priceLabel falls back to \"Free\" (never empty)", () => {
    const cell = marketplaceCellState(status({ priceLabel: "" }));
    assert.equal(cell.priceLabel, "Free");
  });
});
