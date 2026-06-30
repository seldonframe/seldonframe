// discover — the unified catalog ranker (spec 1ff09dcb, P1 Task 1).
//
// SeldonFrame-for-Builders sells THREE rentable types through ONE Monid-shaped
// flow: discover → inspect → run. `discover` is a natural-language search over a
// UNIFIED catalog — agents (published marketplace_listings, kind='agent') and
// tools (Composio actions) live as the same `CatalogEntry` shape, are ranked by
// relevance, and each result carries its price (mirroring Monid's discover
// response: results[] with a price). P1 federates COMPOSIO-FIRST (no Monid).
//
// This module is PURE — no DB, no SDK, no network, no clock, no env, no
// "use server". The endpoint (app/api/v1/build/discover) builds the catalog from
// live sources, hands it to discoverCatalog, and serves the ranked slice. Keeping
// the ranker + the entry-mappers pure is what lets us pin them with plain string
// assertions and keep the route a thin guard + assembly.

import {
  COMPOSIO_TOOLKITS,
  defaultToolsForToolkits,
  COMPOSIO_TOOLKIT_SLUGS,
} from "@/lib/integrations/composio/catalog";
import { isPriceModel, isOutcomeType, type OutcomeType } from "@/lib/marketplace/pricing-model";

// ─── the unified catalog shape ────────────────────────────────────────────────

/** How a catalog entry is priced. Mirrors Monid's PER_CALL / PER_RESULT plus our
 *  outcome model. `amountCents` is what the renter would pay per unit (0 = free
 *  to run on this rail today). `outcomeType` is set only for per_outcome. */
export type CatalogPrice = {
  type: "per_call" | "per_result" | "per_outcome";
  amountCents: number;
  outcomeType?: OutcomeType;
  /** per_result only: a flat base fee added on top of amountCents × items.
   *  Omitted (treated as 0) for per_call / per_outcome. */
  baseCents?: number;
};

/** One sellable thing in the catalog — an agent or a single tool — in the shape
 *  discover/inspect/run all reason over. `provider` is the toolkit slug for tools
 *  (e.g. "gmail") and undefined for agents. */
export type CatalogEntry = {
  /** Stable id: the listing slug (agents) or the Composio action slug (tools). */
  id: string;
  type: "agent" | "tool";
  /** Federation provider for tools (the toolkit slug). Undefined for agents. */
  provider?: string;
  name: string;
  description: string;
  price: CatalogPrice;
};

/** A ranked discover result: the entry plus its relevance score (Monid surfaces
 *  results[] with price; we add the score for ranking transparency). */
export type DiscoverResult = CatalogEntry & { score: number };

// ─── the ranker ───────────────────────────────────────────────────────────────

/** Lowercase + split a string into word tokens (letters/digits runs). */
function tokenize(s: string): string[] {
  return (typeof s === "string" ? s.toLowerCase() : "")
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

/** The searchable text for an entry: name + description + id + provider, lowered.
 *  The id (e.g. GMAIL_SEND_EMAIL) and provider (gmail) make tool-slug queries
 *  hit even when the human name is phrased differently. */
function haystack(entry: CatalogEntry): string {
  return [entry.name, entry.description, entry.id, entry.provider ?? ""]
    .join(" ")
    .toLowerCase();
}

/**
 * Score one entry against the query. Pure + deterministic:
 *   +5  the full query phrase appears in the name (strongest signal),
 *   +3  the full query phrase appears anywhere in the haystack,
 *   +2  per query token found in the NAME,
 *   +1  per query token found in the description/id/provider.
 * 0 means "no signal" → the caller drops it. A single incidental description
 * token (score 1) can never outrank a name phrase (score ≥ 5).
 */
function scoreEntry(entry: CatalogEntry, queryRaw: string, queryTokens: string[]): number {
  const name = entry.name.toLowerCase();
  const hay = haystack(entry);
  const phrase = queryRaw.trim().toLowerCase();

  let score = 0;
  if (phrase.length > 0) {
    if (name.includes(phrase)) score += 5;
    else if (hay.includes(phrase)) score += 3;
  }

  for (const tok of queryTokens) {
    if (name.includes(tok)) score += 2;
    else if (hay.includes(tok)) score += 1;
  }
  return score;
}

/** The default page size for discover (top-N). */
export const DEFAULT_DISCOVER_LIMIT = 10;

/**
 * Rank a unified catalog against a natural-language query and return the top-N,
 * each with its price + relevance score (the Monid discover response).
 *
 * - Empty/whitespace/non-string query → the catalog itself (capped at limit), so
 *   a bare `discover` lists what's available rather than erroring.
 * - A scored search drops every 0-score entry (no spurious hits) and sorts by
 *   score desc, then by name asc for a STABLE, deterministic order on ties.
 * Pure; never throws.
 */
export function discoverCatalog(
  query: string,
  catalog: CatalogEntry[],
  limit: number = DEFAULT_DISCOVER_LIMIT,
): DiscoverResult[] {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_DISCOVER_LIMIT;
  const list = Array.isArray(catalog) ? catalog : [];

  const raw = typeof query === "string" ? query : "";
  const tokens = tokenize(raw);

  // No query → list the catalog (capped). A bare discover is a browse.
  if (tokens.length === 0) {
    return list.slice(0, cap).map((e) => ({ ...e, score: 0 }));
  }

  const scored = list
    .map((e) => ({ ...e, score: scoreEntry(e, raw, tokens) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));

  return scored.slice(0, cap);
}

// ─── catalog-entry builders (one per source) ──────────────────────────────────

/** The marketplace_listings projection discover needs to make an agent entry. */
export type AgentListingRow = {
  slug: string;
  name: string;
  description: string | null;
  priceModel: string | null;
  price: number | null;
  perCallPriceCents: number | null;
  perOutcomePriceCents: number | null;
  outcomeType: string | null;
};

/** Clamp to a finite, non-negative integer (cents); junk → 0. */
function nonNegIntCents(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v);
}

/**
 * Map a published kind:'agent' listing row to a unified CatalogEntry. The
 * listing's pricing MENU model collapses onto the catalog's run-time price:
 *   per_usage   → per_call   (perCallPriceCents)
 *   per_outcome → per_outcome (perOutcomePriceCents + outcomeType)
 *   onetime/monthly/unknown → per_call @ 0  (free to RUN on the per-call rental
 *     rail; onetime/monthly settle off this rail, so a run implies no charge).
 * Pure.
 */
export function agentListingToCatalogEntry(row: AgentListingRow): CatalogEntry {
  const model = isPriceModel(row.priceModel) ? row.priceModel : "onetime";

  let price: CatalogPrice;
  if (model === "per_usage") {
    price = { type: "per_call", amountCents: nonNegIntCents(row.perCallPriceCents) };
  } else if (model === "per_outcome") {
    price = {
      type: "per_outcome",
      amountCents: nonNegIntCents(row.perOutcomePriceCents),
      ...(isOutcomeType(row.outcomeType) ? { outcomeType: row.outcomeType } : {}),
    };
  } else {
    price = { type: "per_call", amountCents: 0 };
  }

  return {
    id: row.slug,
    type: "agent",
    name: row.name,
    description: typeof row.description === "string" ? row.description : "",
    price,
  };
}

/** Title-case a Composio action slug for a human label:
 *  "GMAIL_SEND_EMAIL" → "Gmail — Send Email". */
function humanizeToolName(toolkitSlug: string, actionSlug: string): string {
  const toolkit = COMPOSIO_TOOLKITS.find((t) => t.slug === toolkitSlug);
  const toolkitLabel = toolkit?.label ?? titleCaseWords(toolkitSlug);
  // Drop the leading TOOLKIT_ prefix from the action, then title-case the rest.
  const prefix = `${toolkitSlug.toUpperCase()}_`;
  const action = actionSlug.toUpperCase().startsWith(prefix)
    ? actionSlug.slice(prefix.length)
    : actionSlug;
  return `${toolkitLabel} — ${titleCaseWords(action)}`;
}

/** "SEND_EMAIL" / "send email" → "Send Email". */
function titleCaseWords(s: string): string {
  return s
    .replace(/[_\-]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Map a Composio (toolkit, action) pair to a unified tool CatalogEntry. The
 * description is a generic one-liner ("Run the {name} action via {toolkit}.")
 * since the action's rich schema is fetched lazily at INSPECT time, not here.
 * `provider` is the toolkit slug. Price is per_call @ 0 — P1 records cost but
 * NEVER charges, so a tool discover result must imply no fee. Pure.
 */
export function composioToolToCatalogEntry(toolkitSlug: string, actionSlug: string): CatalogEntry {
  const name = humanizeToolName(toolkitSlug, actionSlug);
  const toolkit = COMPOSIO_TOOLKITS.find((t) => t.slug === toolkitSlug);
  const toolkitLabel = toolkit?.label ?? titleCaseWords(toolkitSlug);
  return {
    id: actionSlug,
    type: "tool",
    provider: toolkitSlug,
    name,
    description: `Run the ${titleCaseWords(actionSlug)} action via ${toolkitLabel}.`,
    price: { type: "per_call", amountCents: 0 },
  };
}

/**
 * Build the TOOL half of the unified catalog from the curated Composio catalog:
 * every default action of every catalog toolkit, as tool CatalogEntries. Pure —
 * derives from COMPOSIO_TOOLKITS + DEFAULT_TOOLS_BY_TOOLKIT (the same curated
 * allowlist the agent runtime binds), so discover never surfaces an action the
 * platform can't actually run.
 */
export function buildComposioCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const slug of COMPOSIO_TOOLKIT_SLUGS) {
    for (const action of defaultToolsForToolkits([slug])) {
      out.push(composioToolToCatalogEntry(slug, action));
    }
  }
  return out;
}
