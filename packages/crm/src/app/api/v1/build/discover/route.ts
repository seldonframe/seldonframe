// POST /api/v1/build/discover — the unified marketplace search (spec 1ff09dcb, P1
// Task 1). The Monid-shaped `discover` step: a natural-language query over ONE
// catalog of agents (published marketplace_listings, kind='agent') + tools
// (Composio actions) → ranked results, each with its price.
//
// MCP-callable: an IDE agent connected to the SeldonFrame MCP (or any bearer
// holder) POSTs { query, limit } and gets back { results: [...] } where every
// result is { id, type, provider?, name, description, price, score } — Monid's
// results[]-with-price shape. P1 federates Composio-FIRST.
//
// Auth is the workspace bearer via guardApiRequest (rate-limit + identity); the
// PUBLISHED listings + the curated Composio catalog are global, so discover is a
// read over the whole marketplace (not org-scoped data) — the guard is for
// auth/rate-limit, not row filtering. No money moves here (discover is read-only).

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  discoverCatalog,
  agentListingToCatalogEntry,
  buildComposioCatalog,
  DEFAULT_DISCOVER_LIMIT,
  type CatalogEntry,
} from "@/lib/build/discover";

type Body = { query?: unknown; limit?: unknown };

/** Build the AGENT half of the catalog: every published kind:'agent' listing. */
async function loadAgentCatalog(): Promise<CatalogEntry[]> {
  const rows = await db
    .select({
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      priceModel: marketplaceListings.priceModel,
      price: marketplaceListings.price,
      perCallPriceCents: marketplaceListings.perCallPriceCents,
      perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
      outcomeType: marketplaceListings.outcomeType,
      kind: marketplaceListings.kind,
      isPublished: marketplaceListings.isPublished,
    })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.isPublished, true));

  return rows
    .filter((r) => r.kind === "agent")
    .map((r) =>
      agentListingToCatalogEntry({
        slug: r.slug,
        name: r.name,
        description: r.description,
        priceModel: r.priceModel,
        price: r.price,
        perCallPriceCents: r.perCallPriceCents,
        perOutcomePriceCents: r.perOutcomePriceCents,
        outcomeType: r.outcomeType,
      }),
    );
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardApiRequest(request);
  if (guard.error) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = guard.orgId;

  const body = (await request.json().catch(() => ({}))) as Body;
  const query = typeof body.query === "string" ? body.query : "";
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : DEFAULT_DISCOVER_LIMIT;

  // The unified catalog: published agents (DB) + the curated Composio tools (pure).
  const [agents, tools] = await Promise.all([
    loadAgentCatalog(),
    Promise.resolve(buildComposioCatalog()),
  ]);
  const catalog = [...agents, ...tools];

  const results = discoverCatalog(query, catalog, limit);

  logEvent(
    "build_discover",
    { query_len: query.length, n_results: results.length, catalog_size: catalog.length },
    { request, orgId, status: 200 },
  );

  // Monid's discover shape: results[] each with id/type/name/description/price.
  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      type: r.type,
      ...(r.provider ? { provider: r.provider } : {}),
      name: r.name,
      description: r.description,
      price: r.price,
      score: r.score,
    })),
    count: results.length,
  });
}
