// ICP-3 — per-template MARKETPLACE STATUS for the "Your agents" roster.
//
// The Agents Studio table shows, per template, whether it is DEPLOYED (to
// no-login SMB clients — the `deployments` count). This module adds the other
// half of the builder's lifecycle: whether the template is LISTED on the public
// marketplace, at what price, and what it has EARNED — distinct from deployment.
//
// Template ↔ listing link: marketplace_listings has NO templateId column (no
// migration was added); a kind:'agent' listing is linked back to its source
// agent_templates row by the reserved `tmpl:<templateId>` tag in its `tags`
// jsonb (see listing-tags.ts splitListingTags / buildListingTags). So we read
// the seller org's agent listings, recover each one's templateId from its tags,
// and index by it.
//
// Per-listing REVENUE reuses the SAME math the Revenue dashboard
// (studio/earnings) shows — computeListingEarnings: net = gross − 5%
// MARKETPLACE_FEE_PERCENT, where gross = one-time install gross (price ×
// installs) + settled x402 metered-rental revenue (agent_rental_call events
// grouped by properties.listing_id). The fee is the SAME primitive checkout uses
// (computeMarketplaceFeeCents) so "earned" is the seller's true take-home.
//
// Fail-soft by contract: any DB error (or a missing earnings input) degrades a
// template to NOT listed with revenue 0, so the roster never breaks because of
// a marketplace read. The PURE helpers (marketplacePriceLabel /
// marketplaceCellState) are exported separately and TDD'd with no DB.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { seldonframeEvents } from "@/db/schema/seldonframe-events";
import { splitListingTags } from "@/lib/marketplace/listing-tags";
import {
  storefrontPriceFromRow,
  type StorefrontPricingRow,
} from "@/lib/marketplace/pricing-model";
import {
  computeListingEarnings,
  type SellerListingEarningsInput,
} from "@/lib/marketplace/earnings";

// ─── types ───────────────────────────────────────────────────────────────────

/** The marketplace facet of one template row in the "Your agents" table. */
export type AgentMarketplaceStatus = {
  /** True when this template has a kind:'agent' marketplace listing at all. */
  listed: boolean;
  /** The listing's storefront slug (for a `/marketplace/<slug>` link). */
  slug?: string;
  /** True when that listing is currently live on the storefront. */
  published: boolean;
  /** Compact price label: "$29/mo" · "$5 per call" · "$50 one-time" · "Free". */
  priceLabel: string;
  /** The resolved pricing model (onetime | monthly | per_usage | per_outcome). */
  priceModel: string;
  /** The seller's earned NET for this listing, in cents (gross − 5% fee). */
  revenueCents: number;
};

/** A NOT-listed status (the default + the fail-soft result). */
const NOT_LISTED: AgentMarketplaceStatus = {
  listed: false,
  published: false,
  priceLabel: "Free",
  priceModel: "onetime",
  revenueCents: 0,
};

// ─── PURE helpers (no DB — TDD'd) ──────────────────────────────────────────────

/**
 * The compact price label for a listing row, read off its persisted pricing
 * columns. Pure mirror of the storefront's `storefrontPriceFromRow` so the
 * roster and the storefront always agree:
 *   onetime $50 → "$50 one-time" · monthly $29 → "$29/mo"
 *   per_usage $5 → "$5 per call" · per_outcome $10/booking → "$10 per booking"
 *   any model whose amount is unset / free → "Free".
 * A non-onetime model carries its label in `labelOverride`; onetime/free is
 * expressed by `price` so we derive its label from `storefrontPriceFromRow`'s
 * own `label`.
 */
export function marketplacePriceLabel(row: StorefrontPricingRow): string {
  const priced = storefrontPriceFromRow(row);
  // labelOverride is set only for the non-onetime paid models; for onetime/free
  // `label` already reads "$50 one-time" / "Free".
  return priced.labelOverride ?? priced.label;
}

/**
 * The presentational state the Agents-table Marketplace cell renders, derived
 * purely from a resolved status. Keeps the JSX dumb: it just reads these.
 *   - `listed`    → show the price chip + the revenue sub-line;
 *   - `showRevenue` → false when revenueCents ≤ 0 (render "—" instead of "$0");
 *   - `revenueLabel` → "$120 earned" (compact whole-dollar) or "—".
 */
export function marketplaceCellState(status: AgentMarketplaceStatus): {
  listed: boolean;
  published: boolean;
  slug: string | undefined;
  priceLabel: string;
  showRevenue: boolean;
  revenueLabel: string;
} {
  const revenueCents =
    Number.isFinite(status.revenueCents) && status.revenueCents > 0
      ? Math.floor(status.revenueCents)
      : 0;
  const showRevenue = revenueCents > 0;
  return {
    listed: status.listed === true,
    published: status.published === true,
    slug: status.slug,
    priceLabel: status.priceLabel || "Free",
    showRevenue,
    revenueLabel: showRevenue ? `${formatWholeDollars(revenueCents)} earned` : "—",
  };
}

/** Cents → compact whole-dollar string for the revenue sub-line: 12000 → "$120",
 *  150000 → "$1,500". Drops cents (the roster wants a glanceable figure; the
 *  Revenue dashboard carries the exact two-decimal number). */
function formatWholeDollars(cents: number): string {
  const dollars = Math.round((Number.isFinite(cents) ? cents : 0) / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

// ─── the store query (one DB round-trip for listings + one for rentals) ────────

type RentalAgg = { revenueCents: number; feeCents: number };

/**
 * Build a `templateId → AgentMarketplaceStatus` map for every one of the org's
 * templates that has a kind:'agent' marketplace listing. Templates with no
 * listing simply don't appear in the map (the caller defaults them to NOT
 * listed via `marketplaceStatusFor`).
 *
 * Two grouped reads: the seller's agent listings, and their settled rental
 * revenue per listing (agent_rental_call events). Revenue is then computed with
 * the SAME `computeListingEarnings` the Revenue dashboard uses, so the "earned"
 * figure on the roster equals the per-listing "You keep" on /studio/earnings.
 *
 * Fail-soft: ANY error → an empty map (every template reads NOT listed). The
 * roster must never break because the marketplace read failed.
 */
export async function loadAgentMarketplaceStatusForOrg(
  orgId: string,
): Promise<Map<string, AgentMarketplaceStatus>> {
  const out = new Map<string, AgentMarketplaceStatus>();
  if (!orgId) return out;

  try {
    const [listings, rentals] = await Promise.all([
      db
        .select({
          id: marketplaceListings.id,
          slug: marketplaceListings.slug,
          name: marketplaceListings.name,
          tags: marketplaceListings.tags,
          price: marketplaceListings.price,
          priceModel: marketplaceListings.priceModel,
          monthlyPriceCents: marketplaceListings.monthlyPriceCents,
          perCallPriceCents: marketplaceListings.perCallPriceCents,
          perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
          outcomeType: marketplaceListings.outcomeType,
          installCount: marketplaceListings.installCount,
          isPublished: marketplaceListings.isPublished,
        })
        .from(marketplaceListings)
        .where(
          and(
            eq(marketplaceListings.creatorOrgId, orgId),
            eq(marketplaceListings.kind, "agent"),
          ),
        ),
      rentalRevenueByListing(orgId),
    ]);

    if (!listings.length) return out;

    // Compute per-listing earnings with the canonical engine (so revenue == the
    // dashboard's "You keep"). Carry the listing id + recovered templateId so we
    // can re-key the result back onto templates.
    const earningsInputs: Array<
      SellerListingEarningsInput & { templateId: string | null }
    > = listings.map((l) => {
      const { templateId } = splitListingTags(l.tags ?? []);
      const rental = rentals.get(l.id);
      return {
        id: l.id,
        slug: l.slug,
        name: l.name,
        priceCents: l.price ?? 0,
        installCount: l.installCount ?? 0,
        rentalCount: 0, // unused for revenue; the events table carries the dollars
        rentalRevenueCents: rental?.revenueCents ?? 0,
        rentalFeeCents: rental?.feeCents ?? 0,
        isPublished: l.isPublished === true,
        priceModel: l.priceModel as never,
        monthlyPriceCents: l.monthlyPriceCents,
        perCallPriceCents: l.perCallPriceCents,
        perOutcomePriceCents: l.perOutcomePriceCents,
        outcomeType: l.outcomeType as never,
        templateId,
      };
    });

    const { listings: computed } = computeListingEarnings(earningsInputs);
    // computeListingEarnings preserves input order + identity, so zip by index.
    listings.forEach((l, i) => {
      const { templateId } = splitListingTags(l.tags ?? []);
      if (!templateId) return; // listing not linked to a template — skip
      const earned = computed[i];
      out.set(templateId, {
        listed: true,
        slug: l.slug,
        published: l.isPublished === true,
        priceLabel: marketplacePriceLabel({
          price: l.price,
          priceModel: l.priceModel,
          monthlyPriceCents: l.monthlyPriceCents,
          perCallPriceCents: l.perCallPriceCents,
          perOutcomePriceCents: l.perOutcomePriceCents,
          outcomeType: l.outcomeType,
        }),
        priceModel: earned?.priceModel ?? "onetime",
        revenueCents: earned?.netCents ?? 0,
      });
    });

    return out;
  } catch {
    // Fail-soft: a marketplace read error must not break the roster.
    return new Map<string, AgentMarketplaceStatus>();
  }
}

/** Resolve the status for ONE template from the map, defaulting to NOT listed. */
export function marketplaceStatusFor(
  map: Map<string, AgentMarketplaceStatus>,
  templateId: string,
): AgentMarketplaceStatus {
  return map.get(templateId) ?? NOT_LISTED;
}

/** Per-listing settled rental revenue for this seller: agent_rental_call events
 *  are logged with orgId = the creator (seller) org + properties.listing_id, and
 *  (x402) properties.amount_cents / fee_cents for SETTLED paid calls. Mirrors the
 *  Revenue dashboard's `rentalsByListing` but keeps only the money (revenue/fee),
 *  since this roster doesn't show the rental-call count. */
async function rentalRevenueByListing(orgId: string): Promise<Map<string, RentalAgg>> {
  const rows = await db
    .select({
      listingId: sql<string>`${seldonframeEvents.properties} ->> 'listing_id'`,
      revenueCents: sql<number>`coalesce(sum((${seldonframeEvents.properties} ->> 'amount_cents')::int), 0)::int`,
      feeCents: sql<number>`coalesce(sum((${seldonframeEvents.properties} ->> 'fee_cents')::int), 0)::int`,
    })
    .from(seldonframeEvents)
    .where(
      and(
        eq(seldonframeEvents.event, "agent_rental_call"),
        eq(seldonframeEvents.orgId, orgId),
      ),
    )
    .groupBy(sql`${seldonframeEvents.properties} ->> 'listing_id'`);

  const map = new Map<string, RentalAgg>();
  for (const row of rows) {
    if (row.listingId) {
      map.set(row.listingId, {
        revenueCents: Number(row.revenueCents) || 0,
        feeCents: Number(row.feeCents) || 0,
      });
    }
  }
  return map;
}
