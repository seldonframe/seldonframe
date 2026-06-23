// Public agent marketplace — the world-class browse storefront.
//
// Server component: fetches PUBLISHED kind:'agent' listings via the Task-2
// engine (listMarketplaceAgentsFromDb), promotes each onto the storefront
// view-model, and falls back to the seed catalog when nothing is published yet
// so the page always renders. The hero search + category filter + live grid run
// in one client island (BrowseClient); everything else is server-rendered.
//
// Matches the Claude Design output (sf-mkt-design/SeldonFrame Marketplace.dc.html
// + screens/01-browse-mid.png): real SeldonFrame logo, editorial spotlight hero,
// six category tiles with accent tints, Featured row, agent-card grid, dark
// footer. NO buyer-facing marketplace fee anywhere (the design's "2% flat fee"
// footer line is intentionally removed).

import type { Metadata } from "next";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { BrowseClient } from "@/components/marketplace/browse-client";
import { MarketplaceIndustryDirectory } from "@/components/marketplace/marketplace-industry-directory";
import { listMarketplaceAgentsFromDb } from "@/lib/marketplace/agent-listings";
import { MARKETPLACE_SEED } from "@/components/marketplace/marketplace-seed";
import {
  MKT,
  nicheToCategory,
  rowToStorefrontAgent,
  type CategoryKey,
  type StorefrontAgent,
} from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Agent Marketplace — Hire an AI agent that works 24/7 | SeldonFrame",
  description:
    "Vetted AI agents that answer calls, book jobs, chase reviews, and win back customers — built by operators who run businesses like yours. Install into your workspace in under a minute.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "Hire an agent. It works 24/7, for pennies. | SeldonFrame Marketplace",
    description:
      "Vetted AI agents — receptionists, review-chasers, reactivation, quoting, support, social — built by real operators. Install or rent via MCP.",
    url: "/marketplace",
    type: "website",
  },
};

type BrowsePageProps = {
  searchParams: Promise<{ niche?: string; q?: string; kind?: string }>;
};

/** Load live published agent listings; fall back to the seed catalog when the
 *  published set is empty so the storefront never renders blank. */
async function loadStorefrontAgents(): Promise<StorefrontAgent[]> {
  try {
    const rows = await listMarketplaceAgentsFromDb();
    if (rows.length > 0) {
      return rows.map(rowToStorefrontAgent);
    }
  } catch {
    // DB unavailable (e.g. preview without a database) — fall through to seed.
  }
  return MARKETPLACE_SEED;
}

/**
 * The REAL "businesses on SeldonFrame" count — 1 workspace = 1 business.
 *
 * Transparency over fabricated social proof: we count live workspace
 * `organizations` (non-archived, not a proposal-pitch preview shell). This is
 * the same definition of a real client/builder workspace used by the billing
 * workspace-count helpers (lib/billing/orgs.ts + owned-workspace-count.ts both
 * exclude `archivedAt`); we additionally exclude `previewMode` rows, which are
 * un-activated pitch shells gated from billing until a prospect accepts.
 *
 * Returns 0 on any DB failure (preview without a database) so the hero simply
 * omits the stat rather than crashing or guessing.
 */
async function countLiveBusinesses(): Promise<number> {
  try {
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { and, eq, isNull, sql } = await import("drizzle-orm");
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizations)
      .where(and(isNull(organizations.archivedAt), eq(organizations.previewMode, false)));
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export default async function MarketplaceBrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const [agents, businessCount] = await Promise.all([loadStorefrontAgents(), countLiveBusinesses()]);

  const initialQuery = String(params.q ?? "").trim();
  const initialCategory: CategoryKey | null = params.niche
    ? nicheToCategory(String(params.niche))
    : null;

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      <MarketplaceNav active="browse" defaultQuery={initialQuery} />
      <BrowseClient
        agents={agents}
        businessCount={businessCount}
        initialCategory={initialCategory}
        initialQuery={initialQuery}
      />
      <MarketplaceIndustryDirectory />
      <MarketplaceFooter />
    </div>
  );
}
