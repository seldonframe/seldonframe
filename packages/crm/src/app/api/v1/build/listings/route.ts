// /api/v1/build/listings — builder marketplace gap tools (spec 1ff09dcb, P0 Task 4).
//
// Wraps the two actions the SeldonFrame MCP build/sell surface was missing, as a
// single op-dispatch POST (same shape as /api/v1/agents). Auth is the workspace
// bearer via guardApiRequest, so every op is org-scoped to the seller — a
// builder can only touch their OWN listings.
//
//   op: "set_usage_price"  { listingId, model: "per_call"|"per_outcome",
//                            amountCents, outcomeType? }
//        → writes the ADDITIVE marketplace_listings pricing columns. DISPLAY/
//          INTENT only — it sets the price, it does NOT charge anyone (metered
//          settlement is the later x402/AP2 rail). Money-safe by construction.
//   op: "list_my_listings"
//        → the seller's listings + net earnings via computeListingEarnings
//          (the 5%-fee-disclosed read; reuses the Studio earnings math).
//
// Both reuse pure, separately-tested logic (resolveUsagePriceUpdate /
// computeListingEarnings) so this route is a thin guard + DB layer.

import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { seldonframeEvents } from "@/db/schema/seldonframe-events";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { resolveUsagePriceUpdate } from "@/lib/build/usage-price";
import {
  computeListingEarnings,
  type SellerListingEarningsInput,
} from "@/lib/marketplace/earnings";

type Body = {
  op?: unknown;
  listingId?: unknown;
  listing_id?: unknown;
  model?: unknown;
  amountCents?: unknown;
  amount_cents?: unknown;
  outcomeType?: unknown;
  outcome_type?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  // guardApiRequest enforces demo-readonly for writes, resolves the workspace
  // bearer to an orgId, and rate-limits. The orgId is the seller's org.
  const guard = await guardApiRequest(request);
  if (guard.error) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = guard.orgId;

  const body = (await request.json().catch(() => ({}))) as Body;
  const op = str(body.op);

  if (op === "set_usage_price") {
    return setUsagePrice(request, orgId, body);
  }
  if (op === "list_my_listings") {
    return listMyListings(orgId);
  }

  return NextResponse.json(
    { error: 'Unknown op. Use "set_usage_price" or "list_my_listings".' },
    { status: 400 },
  );
}

// ── set_usage_price ─────────────────────────────────────────────────────────
async function setUsagePrice(request: Request, orgId: string, body: Body): Promise<Response> {
  const listingId = str(body.listingId) || str(body.listing_id);
  if (!listingId) {
    return NextResponse.json({ error: "listingId is required." }, { status: 400 });
  }

  const resolution = resolveUsagePriceUpdate({
    model: str(body.model) as "per_call" | "per_outcome",
    amountCents: Number(body.amountCents ?? body.amount_cents),
    outcomeType: (str(body.outcomeType) || str(body.outcome_type)) as string | null,
  });
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: 400 });
  }

  // Org-scope the update to the seller's own listing. updated returns the row id
  // only when (id, creatorOrgId) match — a foreign listing simply updates 0 rows.
  const { persist } = resolution;
  const updated = await db
    .update(marketplaceListings)
    .set({
      price: persist.price,
      priceModel: persist.priceModel,
      monthlyPriceCents: persist.monthlyPriceCents,
      perCallPriceCents: persist.perCallPriceCents,
      perOutcomePriceCents: persist.perOutcomePriceCents,
      outcomeType: persist.outcomeType,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceListings.id, listingId),
        eq(marketplaceListings.creatorOrgId, orgId),
      ),
    )
    .returning({ id: marketplaceListings.id, slug: marketplaceListings.slug });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Listing not found, or you don't own it." },
      { status: 404 },
    );
  }

  logEvent(
    "build_set_usage_price",
    { listing_id: listingId, price_model: persist.priceModel },
    { request, orgId, status: 200 },
  );

  // Money-safety is explicit in the response: this set a price, it charged no one.
  return NextResponse.json({
    ok: true,
    listingId: updated[0].id,
    slug: updated[0].slug,
    priceModel: persist.priceModel,
    label: resolution.label,
    charged: false,
    note: "Price set. Listing stays free to list — you earn only on successful runs (you keep 95%).",
  });
}

// ── list_my_listings ────────────────────────────────────────────────────────
async function listMyListings(orgId: string): Promise<Response> {
  const rows = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
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
    .where(eq(marketplaceListings.creatorOrgId, orgId));

  // Per-listing settled rental dollars (x402): agent_rental_call events logged
  // with orgId = the seller + properties.listing_id, summing amount_cents/fee_cents.
  // Mirrors the Studio earnings page aggregation.
  const rentalRows = await db
    .select({
      listingId: sql<string>`${seldonframeEvents.properties} ->> 'listing_id'`,
      n: sql<number>`count(*)::int`,
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

  const rentalByListing = new Map(
    rentalRows
      .filter((r) => r.listingId)
      .map((r) => [r.listingId, { count: Number(r.n) || 0, revenueCents: Number(r.revenueCents) || 0, feeCents: Number(r.feeCents) || 0 }]),
  );

  const earningsInput: SellerListingEarningsInput[] = rows.map((row) => {
    const rental = rentalByListing.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      priceCents: row.price ?? 0,
      installCount: row.installCount ?? 0,
      rentalCount: rental?.count ?? 0,
      rentalRevenueCents: rental?.revenueCents ?? 0,
      rentalFeeCents: rental?.feeCents ?? 0,
      isPublished: row.isPublished,
      priceModel: row.priceModel as SellerListingEarningsInput["priceModel"],
      monthlyPriceCents: row.monthlyPriceCents,
      perCallPriceCents: row.perCallPriceCents,
      perOutcomePriceCents: row.perOutcomePriceCents,
      outcomeType: row.outcomeType as SellerListingEarningsInput["outcomeType"],
    };
  });

  const earnings = computeListingEarnings(earningsInput);

  return NextResponse.json({
    listings: earnings.listings.map((l) => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      priceLabel: l.priceLabel,
      priceModel: l.priceModel,
      isPublished: l.isPublished,
      installCount: l.installCount,
      rentalCount: l.rentalCount,
      grossCents: l.grossCents,
      feeCents: l.feeCents,
      netCents: l.netCents,
    })),
    summary: earnings.summary,
  });
}
