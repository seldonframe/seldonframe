// Storefront catalog loader — the ONE place that resolves "the agents the
// marketplace shows", so the HTML pages, the `.md` twins, and /llms.txt all read
// the identical set (live published listings, else the seed catalog).
//
// This mirrors the exact fallback the pages use (app/(public)/marketplace/
// page.tsx#loadStorefrontAgents and [slug]/page.tsx#loadCatalog): prefer live
// kind:'agent' listings via listMarketplaceAgentsFromDb; fall back to
// MARKETPLACE_SEED when the published set is empty or the DB is unavailable, so
// the surface never renders blank. NOT pure (touches the db dep) — the pure
// Markdown rendering lives in render-markdown.ts and is fed by this.

import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { MARKETPLACE_SEED } from "@/components/marketplace/marketplace-seed";
import { rowToStorefrontAgent, type StorefrontAgent } from "@/components/marketplace/marketplace-data";

/** Resolve the storefront catalog exactly as the browse/listing pages do. */
export async function loadStorefrontCatalog(): Promise<StorefrontAgent[]> {
  try {
    const rows = await listMarketplaceAgentsFromDb();
    if (rows.length > 0) return rows.map(rowToStorefrontAgent);
  } catch {
    // DB unavailable (e.g. preview without a database) — fall through to seed.
  }
  return MARKETPLACE_SEED;
}

/** Resolve ONE storefront agent by slug (live catalog, seed fallback), or null.
 *  Mirrors the listing page's loadAgent resolution. */
export async function loadStorefrontAgentBySlug(slug: string): Promise<StorefrontAgent | null> {
  const catalog = await loadStorefrontCatalog();
  const agent =
    catalog.find((a) => a.slug === slug) ?? MARKETPLACE_SEED.find((a) => a.slug === slug);
  return agent ?? null;
}
