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

  // ── pricing MODEL (BUILD #2) — display only; the 5% fee math is unchanged. ──
  test("surfaces a price-model display label per listing (defaults to onetime)", () => {
    // No model fields → legacy one-time listing reads "$25 one-time".
    const a = computeListingEarnings([listing({ priceCents: 2500, installCount: 4 })]).listings[0];
    assert.equal(a.priceModel, "onetime");
    assert.equal(a.priceLabel, "$25 one-time");
    // Free.
    const b = computeListingEarnings([listing({ priceCents: 0 })]).listings[0];
    assert.equal(b.priceLabel, "Free");
  });

  test("monthly / per_usage / per_outcome surface their own label; gross stays price×installs", () => {
    const monthly = computeListingEarnings([
      listing({ priceModel: "monthly", monthlyPriceCents: 2900, priceCents: 0, installCount: 5 }),
    ]).listings[0];
    assert.equal(monthly.priceLabel, "$29/mo");
    // Non-onetime models carry price 0 today → gross/fee/net are 0 (metered
    // settlement is the x402/AP2 follow-on; nothing is summed into revenue).
    assert.equal(monthly.grossCents, 0);
    assert.equal(monthly.feeCents, 0);

    const perCall = computeListingEarnings([
      listing({ priceModel: "per_usage", perCallPriceCents: 200, priceCents: 0 }),
    ]).listings[0];
    assert.equal(perCall.priceLabel, "$2 per call");

    const perOutcome = computeListingEarnings([
      listing({
        priceModel: "per_outcome",
        perOutcomePriceCents: 1000,
        outcomeType: "booking",
        priceCents: 0,
      }),
    ]).listings[0];
    assert.equal(perOutcome.priceLabel, "$10 per booking");
  });

  test("the 5% fee is UNCHANGED for a one-time listing (model field is display-only)", () => {
    // Identical to the canonical paid case above — proves adding the model
    // fields did not perturb the money math for one-time listings.
    const row = computeListingEarnings([
      listing({ priceModel: "onetime", priceCents: 5000, installCount: 3 }),
    ]).listings[0];
    assert.equal(row.grossCents, 15000);
    assert.equal(row.feeCents, 750);
    assert.equal(row.netCents, 14250);
  });

  // ── x402 metered RENTAL revenue (now that the rail settles paid calls). ──
  test("paid rental revenue adds to gross/fee/net alongside installs", () => {
    // $50 install × 2 = $100 install gross (fee $5). Plus metered rentals that
    // settled to $12.00 gross with $0.60 fee accrued. Both roll into the totals.
    const row = computeListingEarnings([
      listing({
        priceCents: 5000,
        installCount: 2,
        rentalCount: 40,
        rentalRevenueCents: 1200,
        rentalFeeCents: 60,
      }),
    ]).listings[0];
    // Install side unchanged.
    assert.equal(row.installGrossCents, 10000);
    // Rental side surfaced.
    assert.equal(row.rentalRevenueCents, 1200);
    assert.equal(row.rentalFeeCents, 60);
    // Combined gross = installs + rentals; fee + net follow.
    assert.equal(row.grossCents, 11200);
    assert.equal(row.feeCents, 560); // 500 install + 60 rental
    assert.equal(row.netCents, 10640);
    // Net + fee === gross still holds.
    assert.equal(row.netCents + row.feeCents, row.grossCents);
  });

  test("rental revenue with zero installs still surfaces (per_usage agents)", () => {
    const row = computeListingEarnings([
      listing({
        priceModel: "per_usage",
        perCallPriceCents: 200,
        priceCents: 0,
        installCount: 0,
        rentalCount: 6,
        rentalRevenueCents: 1200, // 6 × $2.00
        rentalFeeCents: 60,
      }),
    ]).listings[0];
    assert.equal(row.installGrossCents, 0);
    assert.equal(row.grossCents, 1200);
    assert.equal(row.feeCents, 60);
    assert.equal(row.netCents, 1140);
    assert.equal(row.priceLabel, "$2 per call");
  });

  test("rental revenue is summed into the summary across listings", () => {
    const { summary } = computeListingEarnings([
      listing({ id: "a", slug: "a", priceCents: 0, rentalRevenueCents: 500, rentalFeeCents: 25 }),
      listing({ id: "b", slug: "b", priceCents: 0, rentalRevenueCents: 300, rentalFeeCents: 15 }),
    ]);
    assert.equal(summary.rentalRevenueCents, 800);
    assert.equal(summary.grossCents, 800);
    assert.equal(summary.feeCents, 40);
    assert.equal(summary.netCents, 760);
  });

  test("defensive: negative / non-finite rental amounts clamp to 0", () => {
    const row = computeListingEarnings([
      listing({ rentalRevenueCents: -100, rentalFeeCents: Number.NaN }),
    ]).listings[0];
    assert.equal(row.rentalRevenueCents, 0);
    assert.equal(row.rentalFeeCents, 0);
    assert.equal(row.grossCents, 0);
  });

  test("legacy rows without rental amounts default cleanly to 0 (no behavior change)", () => {
    // The canonical paid case must be byte-for-byte unchanged when no rental
    // fields are supplied.
    const row = computeListingEarnings([listing({ priceCents: 5000, installCount: 3 })]).listings[0];
    assert.equal(row.rentalRevenueCents, 0);
    assert.equal(row.grossCents, 15000);
    assert.equal(row.feeCents, 750);
    assert.equal(row.netCents, 14250);
  });
});
