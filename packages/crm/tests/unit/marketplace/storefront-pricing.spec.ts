// Agent marketplace — storefront PRICING read decision (pure, TDD).
//
// Root-cause regression guard for the "$29/mo listing shows 'Free to install &
// run'" bug: the storefront read used to carry ONLY the legacy `price` column,
// so a `monthly` / `per_usage` / `per_outcome` listing (whose `price` column is
// correctly 0) rendered "Free". These tests lock two pure decisions:
//
//   1. storefrontPriceFromRow  — given a listing's pricing columns, what price
//      label + effective cents the card/detail/sidebar should show. A monthly
//      $29 listing must read "$29/mo" (NOT "Free").
//   2. resolveListingPublishState — the publish/edit gate: paid + Stripe-ready →
//      published with price; paid + no Stripe → free-to-install fallback;
//      free → published at 0.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  storefrontPriceFromRow,
  resolveListingPublishState,
  sellingBannerState,
  type StorefrontPricingRow,
} from "../../../src/lib/marketplace/pricing-model";
import { rowToStorefrontAgent } from "../../../src/components/marketplace/marketplace-data";
import { priceLabel } from "../../../src/components/marketplace/marketplace-data";
import type { MarketplaceAgentRow } from "../../../src/lib/marketplace/agent-listings";

// ---------------------------------------------------------------------
// storefrontPriceFromRow — the read decision that was broken
// ---------------------------------------------------------------------

function row(over: Partial<StorefrontPricingRow> = {}): StorefrontPricingRow {
  return {
    price: 0,
    priceModel: "onetime",
    monthlyPriceCents: null,
    perCallPriceCents: null,
    perOutcomePriceCents: null,
    outcomeType: null,
    ...over,
  };
}

describe("storefrontPriceFromRow", () => {
  test("THE BUG: a monthly $29 listing reads '$29/mo' (price column is 0)", () => {
    // This is exactly the Seldon Studio listing: priceModel='monthly',
    // monthlyPriceCents=2900, price=0 (normalizePricingForPersist zeroes price
    // for non-onetime models). The storefront must NOT show "Free".
    const out = storefrontPriceFromRow(row({ priceModel: "monthly", monthlyPriceCents: 2900, price: 0 }));
    assert.equal(out.label, "$29/mo");
    assert.notEqual(out.label, "Free");
    // priceCents reflects the chargeable amount so the sidebar "$29 / per month"
    // and the JSON-LD offers.price are correct (not 0).
    assert.equal(out.priceCents, 2900);
    assert.equal(out.isPaid, true);
  });

  test("onetime free → 'Free', 0 cents (the safe default, unchanged)", () => {
    const out = storefrontPriceFromRow(row({ priceModel: "onetime", price: 0 }));
    assert.equal(out.label, "Free");
    assert.equal(out.priceCents, 0);
    assert.equal(out.isPaid, false);
  });

  test("onetime paid → '$49 one-time', carries the price cents", () => {
    const out = storefrontPriceFromRow(row({ priceModel: "onetime", price: 4900 }));
    assert.equal(out.label, "$49 one-time");
    assert.equal(out.priceCents, 4900);
    assert.equal(out.isPaid, true);
  });

  test("per_usage → '$2 per call', carries the per-call cents", () => {
    const out = storefrontPriceFromRow(row({ priceModel: "per_usage", perCallPriceCents: 200 }));
    assert.equal(out.label, "$2 per call");
    assert.equal(out.priceCents, 200);
    assert.equal(out.isPaid, true);
  });

  test("per_outcome → '$10 per booking', carries the per-outcome cents", () => {
    const out = storefrontPriceFromRow(
      row({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "booking" }),
    );
    assert.equal(out.label, "$10 per booking");
    assert.equal(out.priceCents, 1000);
    assert.equal(out.isPaid, true);
  });

  test("legacy row with no priceModel falls back to onetime (reads `price`)", () => {
    // Pre-pricing-menu rows (or a NULL price_model) must keep their original
    // meaning: the `price` column IS the one-time price. Backward compatible.
    const out = storefrontPriceFromRow(row({ priceModel: undefined as never, price: 1500 }));
    assert.equal(out.label, "$15 one-time");
    assert.equal(out.priceCents, 1500);
    assert.equal(out.isPaid, true);
  });

  test("a model selected but amount unset → 'Free', 0 (draft safety, never '$0/mo')", () => {
    const out = storefrontPriceFromRow(row({ priceModel: "monthly", monthlyPriceCents: null }));
    assert.equal(out.label, "Free");
    assert.equal(out.priceCents, 0);
    assert.equal(out.isPaid, false);
  });

  test("priceLabelOverride is omitted for one-time/free so the card keeps deriving it", () => {
    // For onetime/free the card's existing priceLabel(priceCents) is already
    // correct, so we return undefined override to avoid double-formatting.
    assert.equal(storefrontPriceFromRow(row({ priceModel: "onetime", price: 0 })).labelOverride, undefined);
    assert.equal(storefrontPriceFromRow(row({ priceModel: "onetime", price: 4900 })).labelOverride, undefined);
    // For the non-one-time models the override carries the real label.
    assert.equal(
      storefrontPriceFromRow(row({ priceModel: "monthly", monthlyPriceCents: 2900 })).labelOverride,
      "$29/mo",
    );
  });
});

// ---------------------------------------------------------------------
// resolveListingPublishState — the publish/edit gate decision
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// rowToStorefrontAgent — the full mapping carries the persisted price
// ---------------------------------------------------------------------

describe("rowToStorefrontAgent — carries the persisted (model) price", () => {
  function dbRow(over: Partial<MarketplaceAgentRow> = {}): MarketplaceAgentRow {
    return {
      id: "l1",
      slug: "247-phone-receptionist",
      name: "24/7 Phone Receptionist",
      description: "Answers every call and books the job.",
      niche: "receptionist",
      tags: [],
      price: 0,
      priceModel: "onetime",
      monthlyPriceCents: null,
      perCallPriceCents: null,
      perOutcomePriceCents: null,
      outcomeType: null,
      agentType: "voice_receptionist",
      installCount: 0,
      rating: 0,
      reviewCount: 0,
      isFeatured: false,
      previewImageUrl: null,
      ...over,
    };
  }

  test("THE BUG end-to-end: a published monthly $29 row maps to a '$29/mo' card", () => {
    // The exact Seldon Studio row: monthly model, $29 in monthly_price_cents,
    // price column 0. Before the fix this mapped to priceCents 0 → "Free".
    const agent = rowToStorefrontAgent(
      dbRow({ priceModel: "monthly", monthlyPriceCents: 2900, price: 0 }),
    );
    assert.equal(agent.priceLabelOverride, "$29/mo", "card renders the monthly label, not Free");
    assert.equal(agent.priceCents, 2900, "sidebar/JSON-LD see the real chargeable amount");
  });

  test("a one-time paid row keeps deriving its label (no override) and carries price", () => {
    const agent = rowToStorefrontAgent(dbRow({ priceModel: "onetime", price: 4900 }));
    assert.equal(agent.priceLabelOverride, undefined);
    assert.equal(agent.priceCents, 4900);
    assert.equal(priceLabel(agent.priceCents), "$49/mo");
  });

  test("a free row stays free (price 0, no override)", () => {
    const agent = rowToStorefrontAgent(dbRow({ priceModel: "onetime", price: 0 }));
    assert.equal(agent.priceLabelOverride, undefined);
    assert.equal(agent.priceCents, 0);
    assert.equal(priceLabel(agent.priceCents), "Free");
  });

  test("a legacy row missing the pricing-menu columns reads its `price` as one-time", () => {
    // Simulate a pre-migration / partial row: only `price` present.
    const partial = {
      id: "l2",
      slug: "x",
      name: "X",
      description: null,
      niche: "support",
      tags: [],
      price: 1500,
      agentType: "chat_assistant",
      installCount: 0,
      rating: 0,
      reviewCount: 0,
      isFeatured: false,
      previewImageUrl: null,
    } as MarketplaceAgentRow;
    const agent = rowToStorefrontAgent(partial);
    assert.equal(agent.priceCents, 1500);
    assert.equal(agent.priceLabelOverride, undefined, "onetime → card derives the label");
  });
});

describe("resolveListingPublishState", () => {
  test("free listing → published at price 0, no Connect needed", () => {
    const out = resolveListingPublishState({ isPaid: false, connectReady: false });
    assert.deepEqual(out, { isPublished: true, needsConnect: false });
  });

  test("paid + Stripe ready → published (the listing goes Live with its price)", () => {
    const out = resolveListingPublishState({ isPaid: true, connectReady: true });
    assert.deepEqual(out, { isPublished: true, needsConnect: false });
  });

  test("paid + NO Stripe → NOT published, needsConnect (the safe free fallback)", () => {
    const out = resolveListingPublishState({ isPaid: true, connectReady: false });
    assert.deepEqual(out, { isPublished: false, needsConnect: true });
  });
});

// ---------------------------------------------------------------------
// sellingBannerState — the listing editor's "how selling works" explainer
// ---------------------------------------------------------------------

describe("sellingBannerState", () => {
  test("free selected → 'free' (no Stripe needed, no warning) regardless of connect", () => {
    assert.equal(sellingBannerState({ isPaidSelected: false, connectReady: false }), "free");
    assert.equal(sellingBannerState({ isPaidSelected: false, connectReady: true }), "free");
  });

  test("paid + Stripe connected → 'active' (paid pricing is on — Max's case)", () => {
    assert.equal(sellingBannerState({ isPaidSelected: true, connectReady: true }), "active");
  });

  test("paid + NOT connected → 'needs_connect' (warn + lists Free until connected)", () => {
    assert.equal(sellingBannerState({ isPaidSelected: true, connectReady: false }), "needs_connect");
  });

  test("fail-soft: unknown connect status (treated as false) on a paid price never reads 'active'", () => {
    // The editor coerces an unknown/failed connect read to connectReady:false,
    // so the worst case is the neutral 'needs_connect' prompt — never a false
    // 'active' that would imply payouts are wired when they aren't.
    assert.equal(sellingBannerState({ isPaidSelected: true, connectReady: false }), "needs_connect");
  });

  test("parity with the publish gate: 'active' ⇔ the gate would publish a paid listing", () => {
    for (const connectReady of [true, false]) {
      const banner = sellingBannerState({ isPaidSelected: true, connectReady });
      const gate = resolveListingPublishState({ isPaid: true, connectReady });
      // active exactly when the paid listing goes Live; needs_connect exactly
      // when it falls back to the free draft.
      assert.equal(banner === "active", gate.isPublished);
      assert.equal(banner === "needs_connect", gate.needsConnect);
    }
  });
});
