// Agent marketplace — seller EARNINGS math (pure, no DB, no React).
//
// The Studio earnings dashboard is the ONLY surface in the whole app that shows
// the platform fee to a user ("SeldonFrame fee 2% · you keep 98%"). To keep that
// number honest it reuses the SAME GMV fee primitive the marketplace checkout
// uses — computeInvoiceApplicationFeeCents / GMV_FEE_PERCENT (lib/billing/gmv.ts)
// — so what the seller sees is exactly what Stripe withholds as the application
// fee on a paid install.
//
// Revenue model: a paid agent listing is a ONE-TIME install price. A listing's
// gross = priceCents × installCount. Fee = the 2% application fee on that gross,
// summed PER listing (so line items always add up to the summary — no
// fee-on-total rounding drift). Net = gross − fee.
//
// Rentals (agent_rental_call events attributed to the creator org) are surfaced
// as a usage signal next to installs, but the rental event payload carries no
// dollar amount, so rentals are NOT summed into revenue.

import { GMV_FEE_PERCENT, computeInvoiceApplicationFeeCents } from "@/lib/billing/gmv";

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
  isPublished: boolean;
};

/** A listing row with its money computed. Extends the input with cents fields. */
export type SellerListingEarnings = SellerListingEarningsInput & {
  /** priceCents × installCount, clamped to ≥ 0. */
  grossCents: number;
  /** The 2% SeldonFrame application fee on grossCents. */
  feeCents: number;
  /** What the seller keeps: grossCents − feeCents. */
  netCents: number;
};

export type SellerEarningsSummary = {
  grossCents: number;
  feeCents: number;
  netCents: number;
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
 * checkout path so "you keep 98%" is exact, and summed per listing so the
 * seller's line items always reconcile to the summary.
 */
export function computeListingEarnings(
  rows: SellerListingEarningsInput[],
): SellerEarnings {
  const listings: SellerListingEarnings[] = rows.map((row) => {
    const priceCents = nonNegInt(row.priceCents);
    const installCount = nonNegInt(row.installCount);
    const rentalCount = nonNegInt(row.rentalCount);
    const grossCents = priceCents * installCount;
    const feeCents = computeInvoiceApplicationFeeCents(grossCents);
    const netCents = grossCents - feeCents;
    return {
      ...row,
      priceCents,
      installCount,
      rentalCount,
      grossCents,
      feeCents,
      netCents,
    };
  });

  const summary = listings.reduce<SellerEarningsSummary>(
    (acc, row) => {
      acc.grossCents += row.grossCents;
      acc.feeCents += row.feeCents;
      acc.netCents += row.netCents;
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
      installCount: 0,
      rentalCount: 0,
      listingCount: 0,
      publishedCount: 0,
      feePercent: GMV_FEE_PERCENT,
    },
  );

  return { listings, summary };
}
