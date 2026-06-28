// ACP product FEED — the pure builder that maps published marketplace agent
// rows onto the OpenAI/ACP product-feed JSON ChatGPT ingests.
//
// The feed is HARMLESS DATA: a catalog. It moves no money and needs no
// migration — it just reads the existing published marketplace listings. The
// route (app/api/acp/feed) binds listMarketplaceAgentsFromDb({}) and calls this.
//
// PRICE: every listing shows its REAL price for the SELECTED pricing model, via
// storefrontPriceFromRow — NOT the legacy `price` column, which is 0 for a
// monthly/per_usage/per_outcome listing (their amount lives in the *_cents
// columns). So a $29/mo agent shows 2900, not $0.
//
// CHECKOUT GATING: ACP checkout is ONE-TIME fiat (no recurring/interval), so
// `enable_checkout` is true ONLY when the listing's pricing model is `onetime`
// AND its price > 0 — the only shape ACP can honestly transact. Free agents and
// recurring/metered models (monthly / per_usage / per_outcome) are still LISTED
// at their real price (discoverable + searchable in ChatGPT) but with
// enable_checkout:false, so ACP never offers a one-time buy that misrepresents a
// subscription or a metered plan. Free → install via the ChatGPT App / marketplace.
//
// Product id = the agent SLUG (the same id checkout resolves back to a listing).

import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";
import { storefrontPriceFromRow } from "@/lib/marketplace/pricing-model";

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
  /** Buyable through ACP only when the model is ONE-TIME and price > 0 (the only
   *  shape ACP's one-time fiat checkout can honestly transact). Free + recurring
   *  / metered models list at their real price but are not checkout-able here. */
  enable_checkout: boolean;
};

/** The top-level feed document. */
export type AcpProductFeed = {
  products: AcpFeedProduct[];
};

/** Coerce a price (cents) to a non-negative integer (0 for null/negative/NaN).
 *  storefrontPriceFromRow already clamps, but the feed re-clamps defensively so
 *  the wire `amount` is always a clean non-negative integer. */
function normalizePriceCents(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price);
}

/**
 * Build the ACP product feed from published marketplace agent rows. Pure — the
 * same rows always produce the same feed. Every listing shows its REAL
 * selected-model price; enable_checkout is true ONLY for one-time priced agents
 * (the model ACP's one-time checkout can honestly transact). Free + recurring /
 * metered models are searchable and listed at their real price, but not
 * checkout-able here.
 */
export function buildProductFeed(rows: MarketplaceAgentRow[]): AcpProductFeed {
  const products = rows.map((row): AcpFeedProduct => {
    const priced = storefrontPriceFromRow(row);
    const amount = normalizePriceCents(priced.priceCents);
    const priceModel = row.priceModel ?? "onetime";
    const product: AcpFeedProduct = {
      id: row.slug,
      title: row.name,
      description: row.description ?? "",
      price: { amount, currency: "usd" },
      availability: "in_stock",
      link: `${MARKETPLACE_BASE}/${row.slug}`,
      product_category: row.niche,
      enable_search: true,
      // ONE-TIME priced agents only: ACP checkout is one-time fiat, so a
      // monthly/per_usage/per_outcome (or free) listing is discoverable at its
      // real price but never offered as a one-time ChatGPT buy.
      enable_checkout: priceModel === "onetime" && amount > 0,
    };
    if (row.previewImageUrl) product.image_link = row.previewImageUrl;
    return product;
  });
  return { products };
}
