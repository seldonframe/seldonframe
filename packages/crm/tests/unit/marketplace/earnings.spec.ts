// Agent marketplace — seller EARNINGS math (pure, no DB).
//
// The earnings dashboard is the ONLY surface in the app that shows the 5%
// marketplace fee to a user ("you keep 95%"). This math MUST be exact and reuse
// the SAME marketplace fee primitive the checkout path uses
// (computeMarketplaceFeeCents / MARKETPLACE_FEE_PERCENT, lib/billing/gmv.ts) so
// the number a seller sees matches the number Stripe actually withholds.
//
// Revenue model: a paid agent listing is a ONE-TIME install price. Gross for a
// listing = price (cents) × installCount. Net = gross − 5% fee. Free listings
// (price 0) contribute 0 to both gross and fee but still report installs +
// rentals. Rentals (agent_rental_call events) are a usage/engagement signal we
// surface alongside installs; they do not themselves carry a dollar amount in
// the event payload, so they are NOT summed into revenue here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeListingEarnings,
  type SellerListingEarningsInput,
} from "../../../src/lib/marketplace/earnings";
import {
  MARKETPLACE_FEE_PERCENT,
  computeMarketplaceFeeCents,
} from "../../../src/lib/billing/gmv";

function listing(over: Partial<SellerListingEarningsInput> = {}): SellerListingEarningsInput {
  return {
    id: "list-1",
    slug: "front-desk",
    name: "Front Desk",
    priceCents: 0,
    installCount: 0,
    rentalCount: 0,
    isPublished: true,
    ...over,
  };
}

describe("computeListingEarnings", () => {
  test("empty input → zeroed summary, fee percent surfaced, no rows", () => {
    const result = computeListingEarnings([]);
    assert.equal(result.summary.grossCents, 0);
    assert.equal(result.summary.feeCents, 0);
    assert.equal(result.summary.netCents, 0);
    assert.equal(result.summary.installCount, 0);
    assert.equal(result.summary.rentalCount, 0);
    assert.equal(result.summary.listingCount, 0);
    assert.equal(result.summary.publishedCount, 0);
    assert.equal(result.summary.feePercent, MARKETPLACE_FEE_PERCENT);
    assert.deepEqual(result.listings, []);
  });

  test("free listing → installs/rentals counted, zero money", () => {
    const result = computeListingEarnings([
      listing({ priceCents: 0, installCount: 12, rentalCount: 40 }),
    ]);
    const row = result.listings[0];
    assert.equal(row.grossCents, 0);
    assert.equal(row.feeCents, 0);
    assert.equal(row.netCents, 0);
    assert.equal(row.installCount, 12);
    assert.equal(row.rentalCount, 40);
    assert.equal(result.summary.grossCents, 0);
    assert.equal(result.summary.netCents, 0);
    assert.equal(result.summary.installCount, 12);
    assert.equal(result.summary.rentalCount, 40);
  });

  test("paid listing → gross = price × installs, net = gross − 5% fee (exact)", () => {
    // $50.00 install × 3 = $150.00 gross. 5% fee = $7.50. Net = $142.50.
    const result = computeListingEarnings([
      listing({ priceCents: 5000, installCount: 3, rentalCount: 7 }),
    ]);
    const row = result.listings[0];
    assert.equal(row.grossCents, 15000);
    // Fee computed off the SAME primitive as checkout — not a re-derived 5%.
    assert.equal(row.feeCents, computeMarketplaceFeeCents(15000));
    assert.equal(row.feeCents, 750);
    assert.equal(row.netCents, 14250);
    // 95% identity holds: net + fee === gross.
    assert.equal(row.netCents + row.feeCents, row.grossCents);
  });

  test("summary aggregates across listings; fee summed PER listing (no rounding drift)", () => {
    // Two listings, per-listing fee summed (not fee-on-combined-total): 199c×1
    // = 199c (fee round(199*0.05)=round(9.95)=10), twice → 20. We assert the
    // per-listing model explicitly so the seller's line items always add up to
    // the summary (no fee-on-total rounding drift).
    const result = computeListingEarnings([
      listing({ id: "a", slug: "a", priceCents: 199, installCount: 1 }),
      listing({ id: "b", slug: "b", priceCents: 199, installCount: 1 }),
    ]);
    const sumGross = result.listings.reduce((n, r) => n + r.grossCents, 0);
    const sumFee = result.listings.reduce((n, r) => n + r.feeCents, 0);
    const sumNet = result.listings.reduce((n, r) => n + r.netCents, 0);
    assert.equal(result.summary.grossCents, sumGross);
    assert.equal(result.summary.feeCents, sumFee);
    assert.equal(result.summary.netCents, sumNet);
    // Invariant: summary net + summary fee === summary gross.
    assert.equal(result.summary.netCents + result.summary.feeCents, result.summary.grossCents);
  });

  test("publishedCount counts only published listings; listingCount counts all", () => {
    const result = computeListingEarnings([
      listing({ id: "a", slug: "a", isPublished: true }),
      listing({ id: "b", slug: "b", isPublished: false }),
      listing({ id: "c", slug: "c", isPublished: true }),
    ]);
    assert.equal(result.summary.listingCount, 3);
    assert.equal(result.summary.publishedCount, 2);
  });

  test("defensive: negative / non-finite inputs are clamped to 0", () => {
    const result = computeListingEarnings([
      listing({ priceCents: -100, installCount: -5, rentalCount: Number.NaN }),
    ]);
    const row = result.listings[0];
    assert.equal(row.grossCents, 0);
    assert.equal(row.feeCents, 0);
    assert.equal(row.netCents, 0);
    assert.equal(row.installCount, 0);
    assert.equal(row.rentalCount, 0);
  });

  test("preserves listing identity fields for rendering", () => {
    const result = computeListingEarnings([
      listing({ id: "x1", slug: "plumber-bot", name: "Plumber Bot", priceCents: 2500, installCount: 2 }),
    ]);
    const row = result.listings[0];
    assert.equal(row.id, "x1");
    assert.equal(row.slug, "plumber-bot");
    assert.equal(row.name, "Plumber Bot");
    assert.equal(row.priceCents, 2500);
  });
});
