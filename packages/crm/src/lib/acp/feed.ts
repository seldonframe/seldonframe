// ACP product FEED — the pure builder that maps published marketplace agent
// rows onto the OpenAI/ACP product-feed JSON ChatGPT ingests.
//
// The feed is HARMLESS DATA: a catalog. It moves no money and needs no
// migration — it just reads the existing published marketplace listings. The
// route (app/api/acp/feed) binds listMarketplaceAgentsFromDb({}) and calls this.
//
// CHECKOUT GATING: `enable_checkout` is true ONLY for PAID agents (price > 0).
// Free agents are listed (so they're discoverable + searchable in ChatGPT) but
// with enable_checkout:false — a free agent is installed via the ChatGPT App /
// marketplace, not bought through ACP. So ACP only ever transacts paid items.
//
// Product id = the agent SLUG (the same id checkout resolves back to a listing).

import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";

/** The marketplace base every feed `link` points at. */
const MARKETPLACE_BASE = "https://app.seldonframe.com/marketplace";

/** One product in the ACP/OpenAI product feed. */
export type AcpFeedProduct = {
  /** Product id = the marketplace agent slug. */
  id: string;
  title: string;
  description: string;
  price: { amount: number; currency: "usd" };
  availability: "in_stock";
  /** Canonical marketplace listing page for the agent. */
  link: string;
  /** Optional preview image (omitted entirely when the listing has none). */
  image_link?: string;
  /** Storefront category (the listing's niche). */
  product_category: string;
  /** Always searchable in ChatGPT. */
  enable_search: true;
  /** Buyable through ACP only when priced ( > 0 ). Free agents install via the
   *  App, so checkout is disabled for them. */
  enable_checkout: boolean;
};

/** The top-level feed document. */
export type AcpProductFeed = {
  products: AcpFeedProduct[];
};

/** Coerce a price column to a non-negative integer cents value (0 for
 *  null/negative/NaN). Mirrors the defensive clamps elsewhere in billing. */
function normalizePriceCents(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price);
}

/**
 * Build the ACP product feed from published marketplace agent rows. Pure — the
 * same rows always produce the same feed. Paid agents (price > 0) get
 * enable_checkout:true; free agents are searchable but not checkout-able.
 */
export function buildProductFeed(rows: MarketplaceAgentRow[]): AcpProductFeed {
  const products = rows.map((row): AcpFeedProduct => {
    const amount = normalizePriceCents(row.price);
    const product: AcpFeedProduct = {
      id: row.slug,
      title: row.name,
      description: row.description ?? "",
      price: { amount, currency: "usd" },
      availability: "in_stock",
      link: `${MARKETPLACE_BASE}/${row.slug}`,
      product_category: row.niche,
      enable_search: true,
      // Only PAID agents transact through ACP; free → install via the App.
      enable_checkout: amount > 0,
    };
    if (row.previewImageUrl) product.image_link = row.previewImageUrl;
    return product;
  });
  return { products };
}
