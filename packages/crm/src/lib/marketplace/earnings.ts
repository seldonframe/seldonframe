// Agent marketplace — seller EARNINGS math (pure, no DB, no React).
//
// The Studio earnings dashboard is the ONLY surface in the whole app that shows
// the platform fee to a user ("SeldonFrame fee 5% · you keep 95%"). To keep that
// number honest it reuses the SAME marketplace fee primitive the marketplace
// checkout uses — computeMarketplaceFeeCents / MARKETPLACE_FEE_PERCENT (gmv.ts)
// — so what the seller sees is exactly what Stripe withholds as the application
// fee on a paid install.
//
// Revenue model: a listing earns from TWO streams.
//   1. INSTALLS — a one-time install price: installGross = priceCents ×
//      installCount; the 5% fee is taken on that gross.
//   2. METERED RENTALS (x402) — paid agent_rental_call events now carry an
//      amount_cents + fee_cents on their property bag (the rail accrues them).
//      We sum those into rentalRevenueCents + rentalFeeCents per listing.
// A listing's combined gross = installGross + rentalRevenue; combined fee =
// installFee + rentalFee (each computed/accrued separately so no rounding drift);
// net = gross − fee. Fees are summed PER listing so line items always reconcile
// to the summary. (rentalCount remains a usage signal; rentalRevenueCents is the
// settled dollars.)

import { MARKETPLACE_FEE_PERCENT, computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import {
  isPriceModel,
  priceModelLabel,
  type OutcomeType,
  type PriceModel,
} from "@/lib/marketplace/pricing-model";

/** One published/draft listing the seller owns, plus its lifetime counts. */
export type SellerListingEarningsInput = {
  id: string;
  slug: string;
  name: string;
  /** One-time install price in cents (0 = free). */
  priceCents: number;
  /** Lifetime install count (marketplace_listings.install_count). */
  installCount: number;
  /** Lifetime agent_rental_call events attributed to this seller's org. */
  rentalCount: number;
  /** Sum of amount_cents across SETTLED paid rental calls for this listing (the
   *  x402 metered revenue). Optional — legacy/free listings default to 0. */
  rentalRevenueCents?: number | null;
  /** Sum of fee_cents (SF's 5% cut) across those paid rental calls. Optional. */
  rentalFeeCents?: number | null;
  isPublished: boolean;
  // ── pricing MODEL (BUILD #2) — DISPLAY ONLY. ──
  // The seller's chosen model + its amounts, so the dashboard can show "$29/mo"
  // / "$2 per call" / "$10 per booking" instead of assuming one-time. These do
  // NOT change the money math: gross is still priceCents × installCount, and
  // non-onetime models carry priceCents 0 today (their metered settlement is the
  // x402/AP2 follow-on — nothing is summed into revenue here yet). Optional so
  // legacy callers (and pre-migration rows) default cleanly to onetime.
  priceModel?: PriceModel;
  monthlyPriceCents?: number | null;
  perCallPriceCents?: number | null;
  perOutcomePriceCents?: number | null;
  outcomeType?: OutcomeType | null;
};

/** A listing row with its money computed. Extends the input with cents fields. */
export type SellerListingEarnings = SellerListingEarningsInput & {
  /** Install-only gross: priceCents × installCount, clamped to ≥ 0. */
  installGrossCents: number;
  /** Settled metered-rental revenue (sum of paid amount_cents), clamped ≥ 0. */
  rentalRevenueCents: number;
  /** SF's 5% cut accrued on those paid rentals, clamped ≥ 0. */
  rentalFeeCents: number;
  /** Combined gross: installGrossCents + rentalRevenueCents. */
  grossCents: number;
  /** Combined fee: the 5% install fee + the accrued rental fee. */
  feeCents: number;
  /** What the seller keeps: grossCents − feeCents. */
  netCents: number;
  /** The resolved pricing model (defaults to 'onetime' for legacy rows). */
  priceModel: PriceModel;
  /** Human price label for display ("$29/mo", "$2 per call", "Free", …). */
  priceLabel: string;
};

export type SellerEarningsSummary = {
  grossCents: number;
  feeCents: number;
  netCents: number;
  /** Settled metered-rental revenue across all listings. */
  rentalRevenueCents: number;
  installCount: number;
  rentalCount: number;
  listingCount: number;
  publishedCount: number;
  /** The platform fee percentage (so the UI never hardcodes "2"). */
  feePercent: number;
};

export type SellerEarnings = {
  listings: SellerListingEarnings[];
  summary: SellerEarningsSummary;
};

/** Clamp to a finite, non-negative integer (defensive against bad rows). */
function nonNegInt(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Compute per-listing + summary earnings for a seller. Pure: same input →
 * same output, no IO. The fee is computed off the SAME primitive as the
 * checkout path so "you keep 95%" is exact, and summed per listing so the
 * seller's line items always reconcile to the summary.
 */
export function computeListingEarnings(
  rows: SellerListingEarningsInput[],
): SellerEarnings {
  const listings: SellerListingEarnings[] = rows.map((row) => {
    const priceCents = nonNegInt(row.priceCents);
    const installCount = nonNegInt(row.installCount);
    const rentalCount = nonNegInt(row.rentalCount);
    // INSTALL stream: gross = one-time price × installs, fee = the checkout
    // primitive (so "you keep 95%" is exact for installs).
    const installGrossCents = priceCents * installCount;
    const installFeeCents = computeMarketplaceFeeCents(installGrossCents);
    // RENTAL stream (x402): the dollars + SF cut the rail ALREADY accrued onto
    // the paid agent_rental_call events. We sum them as-is — the 5% was computed
    // per call at settlement (computeMarketplaceFeeCents on the builder lane), so
    // re-deriving here would risk rounding drift. Clamp defensively.
    const rentalRevenueCents = nonNegInt(row.rentalRevenueCents ?? 0);
    const rentalFeeCents = nonNegInt(row.rentalFeeCents ?? 0);
    // COMBINED.
    const grossCents = installGrossCents + rentalRevenueCents;
    const feeCents = installFeeCents + rentalFeeCents;
    const netCents = grossCents - feeCents;
    // DISPLAY: resolve the model + its human label off the shared pure helper.
    const priceModel: PriceModel = isPriceModel(row.priceModel) ? row.priceModel : "onetime";
    const priceLabel = priceModelLabel({
      priceModel,
      priceCents,
      monthlyPriceCents: row.monthlyPriceCents ?? null,
      perCallPriceCents: row.perCallPriceCents ?? null,
      perOutcomePriceCents: row.perOutcomePriceCents ?? null,
      outcomeType: row.outcomeType ?? null,
    });
    return {
      ...row,
      priceCents,
      installCount,
      rentalCount,
      installGrossCents,
      rentalRevenueCents,
      rentalFeeCents,
      grossCents,
      feeCents,
      netCents,
      priceModel,
      priceLabel,
    };
  });

  const summary = listings.reduce<SellerEarningsSummary>(
    (acc, row) => {
      acc.grossCents += row.grossCents;
      acc.feeCents += row.feeCents;
      acc.netCents += row.netCents;
      acc.rentalRevenueCents += row.rentalRevenueCents;
      acc.installCount += row.installCount;
      acc.rentalCount += row.rentalCount;
      acc.listingCount += 1;
      if (row.isPublished) acc.publishedCount += 1;
      return acc;
    },
    {
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
      rentalRevenueCents: 0,
      installCount: 0,
      rentalCount: 0,
      listingCount: 0,
      publishedCount: 0,
      feePercent: MARKETPLACE_FEE_PERCENT,
    },
  );

  return { listings, summary };
}
