// ACP product FEED endpoint — GET /api/acp/feed
//
// The catalog ChatGPT (OpenAI Instant Checkout) ingests: our PUBLISHED
// marketplace agents, mapped onto the ACP/OpenAI product-feed JSON. This is the
// "submit your feed URL" target Max gives OpenAI at go-live.
//
// Money-safety: a feed is harmless DATA — it reads published listings and emits
// a catalog. It charges nothing and needs no migration. Paid agents come back
// with enable_checkout:true; free agents are searchable but install via the App
// (enable_checkout:false). The actual purchase happens through the checkout
// endpoints (and even there the processor is a no-charge stub in v1).
//
// Thin wrapper: bind the real listing query + the pure buildProductFeed.

import { NextResponse } from "next/server";
import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { buildProductFeed } from "@/lib/acp/feed";

// Read-only catalog; safe to cache at the edge for 5 minutes (matches the
// rental rail's tolerance for slightly-stale listing data).
const CACHE_HEADERS = { "Cache-Control": "public, max-age=300" } as const;

export async function GET() {
  try {
    const rows = await listMarketplaceAgentsFromDb({});
    const feed = buildProductFeed(rows);
    return NextResponse.json(feed, { status: 200, headers: CACHE_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[acp] feed_error: ${message}`);
    // Never 500 the catalog into ChatGPT's ingester — return an empty (but
    // well-shaped) feed so a transient DB hiccup degrades to "no products"
    // rather than a broken feed URL.
    return NextResponse.json({ products: [] }, { status: 200, headers: CACHE_HEADERS });
  }
}
