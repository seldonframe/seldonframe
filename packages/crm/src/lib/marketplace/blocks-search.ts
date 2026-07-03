// find_blocks — the in-prompt registry search engine (virality pack, Task 4).
//
// An IDE agent (or any MCP-connected builder) mid-conversation can ask "is
// there already a block for X?" before generating one from scratch. This is
// the pure ranking engine behind that: scoreBlockMatch is a simple
// term-overlap scorer over name+description+niche (no embeddings, no DB —
// good enough to surface an obviously-relevant existing block, not a
// full-text-search replacement). searchBlocks wraps it with the real
// catalog loader (listMarketplaceAgentsFromDb) so the route stays a thin
// HTTP binding.
//
// Everything here is pure or DI'd (repo convention — see fork-listing.ts /
// discover.ts) so it unit-tests with fakes, no Postgres.

import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";
import { listingUrl } from "@/lib/marketplace/render-markdown";

// ─── scoreBlockMatch — pure term-overlap scorer ──────────────────────────────

/** The trust signal the improve build's `trust_stats` column will carry.
 *  Optional/local — that column does not exist on this branch's schema, so
 *  it is read defensively (see toResult below) and is simply absent (never
 *  throws) until the improve build's migration lands. */
export type BlockTrustStats = { evalPassRate: number; scenarioCount: number };

/** The subset of a marketplace agent listing row the search engine needs. A
 *  plain structural type (not `MarketplaceAgentRow` itself) so the scorer,
 *  the ranker, and their tests never depend on the full DB row shape —
 *  anything with these fields searches/scores/ranks. `trustStats` is
 *  optional (see BlockTrustStats) so this reads cleanly whether the improve
 *  build's column exists yet or not. */
export type BlockSearchRow = {
  slug: string;
  name: string;
  description: string | null;
  niche: string;
  agentType: string | null;
  installCount: number;
  isFeatured: boolean;
  trustStats?: BlockTrustStats | null;
};

/** Split a string into lowercase, punctuation-stripped word terms. Empty/
 *  whitespace-only input yields an empty term list. */
function termsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Score how well a free-text query `q` matches a block row, by counting how
 * many of the query's distinct terms appear anywhere in the row's
 * name+description+niche (case-insensitive, punctuation-insensitive). Pure —
 * no I/O. Higher is better; 0 means no overlap at all (including for an
 * empty/whitespace-only query, which never matches anything — callers fall
 * back to featured/installCount ordering for that case, see searchBlocks).
 */
export function scoreBlockMatch(q: string, row: BlockSearchRow): number {
  const queryTerms = new Set(termsOf(q));
  if (queryTerms.size === 0) return 0;

  const haystack = termsOf(
    `${row.name} ${row.description ?? ""} ${row.niche}`,
  );
  const haystackSet = new Set(haystack);

  let score = 0;
  for (const term of queryTerms) {
    if (haystackSet.has(term)) score += 1;
  }
  return score;
}

// ─── searchBlocks — rank the real catalog ────────────────────────────────────

/** One ranked search result — the exact public shape the route returns. */
export type BlockSearchResult = {
  slug: string;
  name: string;
  description: string;
  niche: string;
  kind: "agent";
  url: string;
  trust: BlockTrustStats | null;
};

export type SearchBlocksArgs = {
  q: string;
  limit: number;
};

export type SearchBlocksDeps = {
  /** Load the full published-agent catalog. DI'd so tests never touch
   *  Postgres; the real binding is listMarketplaceAgentsFromDb (adapted to
   *  this shape by searchBlocksFromDb below). */
  listAgents: () => Promise<BlockSearchRow[]>;
};

/** The canonical public listing URL for a block — delegates to the SAME
 *  helper every other emitted marketplace URL uses (render-markdown's
 *  listingUrl on MARKETPLACE_BASE_URL). One canonical host, no drift; the
 *  plan's literal www. host was the drift (both hosts serve 200 today, but
 *  the codebase canon is the app host). */
function blockUrl(slug: string): string {
  return listingUrl(slug);
}

function toResult(row: BlockSearchRow): BlockSearchResult {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    niche: row.niche,
    kind: "agent",
    url: blockUrl(row.slug),
    trust: row.trustStats ?? null,
  };
}

/** Sort comparator for the empty-query fallback: featured first, then
 *  descending installCount. Mirrors listMarketplaceAgents' own sort so
 *  find_blocks with no query reads the same "best of the catalog" order the
 *  storefront itself shows. */
function byFeaturedThenInstalls(a: BlockSearchRow, b: BlockSearchRow): number {
  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
  return (b.installCount ?? 0) - (a.installCount ?? 0);
}

/**
 * Rank the real published-agent catalog for a free-text `q` and return the
 * top `limit` results in the route's public shape.
 *
 * - Non-empty `q`: score every row via scoreBlockMatch, drop zero-score rows
 *   (an irrelevant block is worse than no suggestion), sort by descending
 *   score.
 * - Empty/whitespace-only `q`: skip scoring entirely (score is always 0 for
 *   an empty query, which would incorrectly drop every row) and fall back to
 *   featured-then-installCount — "what's good in the catalog" when the
 *   caller has no specific need yet.
 *
 * DI'd over `listAgents` so this is unit-testable with fakes; the route
 * binds it to listMarketplaceAgentsFromDb.
 */
export async function searchBlocks(
  args: SearchBlocksArgs,
  deps: SearchBlocksDeps,
): Promise<BlockSearchResult[]> {
  const rows = await deps.listAgents();
  const isEmptyQuery = termsOf(args.q).length === 0;

  let ordered: BlockSearchRow[];
  if (isEmptyQuery) {
    ordered = [...rows].sort(byFeaturedThenInstalls);
  } else {
    ordered = rows
      .map((row) => ({ row, score: scoreBlockMatch(args.q, row) }))
      .filter((scored) => scored.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((scored) => scored.row);
  }

  return ordered.slice(0, Math.max(0, args.limit)).map(toResult);
}

// ─── default DB-backed dep (lazy — never imported in unit tests) ────────────

/**
 * Adapt a real `MarketplaceAgentRow` (agent-listings.ts) onto the engine's
 * minimal `BlockSearchRow`. This is the ONE place that touches the actual DB
 * row type, and therefore the right place for the defensive `trustStats`
 * read: the `trust_stats` column is added by ANOTHER branch (the "improve"
 * build) and does not exist in `MarketplaceAgentRow` on this branch's schema
 * today. Reading it via a locally-widened optional field means this adapter
 * works identically before AND after that column lands — it never throws
 * either way.
 */
function fromDbRow(row: MarketplaceAgentRow): BlockSearchRow {
  const widened = row as MarketplaceAgentRow & { trustStats?: BlockTrustStats | null };
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    niche: row.niche,
    agentType: row.agentType,
    installCount: row.installCount,
    isFeatured: row.isFeatured,
    trustStats: widened.trustStats ?? null,
  };
}

/**
 * Search the real live catalog. Thin wrapper over searchBlocks with the
 * default listMarketplaceAgentsFromDb dep (adapted via fromDbRow) so the
 * route needn't wire the DI itself. Lazy-imports so unit tests of
 * searchBlocks never touch Postgres.
 */
export async function searchBlocksFromDb(args: SearchBlocksArgs): Promise<BlockSearchResult[]> {
  const { listMarketplaceAgentsFromDb } = await import("@/lib/marketplace/agent-listings");
  return searchBlocks(args, {
    listAgents: async () => (await listMarketplaceAgentsFromDb()).map(fromDbRow),
  });
}
