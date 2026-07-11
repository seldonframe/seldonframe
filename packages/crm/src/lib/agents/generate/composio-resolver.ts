// Agent Loop — World-Class Author (P5.2) — the LIVE Composio toolkit resolver.
//
// The author (P5.1) emits `neededCapabilities: string[]` — plain-English asks
// that aren't in the featured tool menu (e.g. "read this business's Google
// reviews", "create a Trello card"). This module turns each of those phrases
// into a REAL, bindable Composio toolkit:
//
//   capability phrase  ──listComposioToolkits──▶  Composio's LIVE catalog
//                      ──resolveCapabilitiesToToolkits──▶  best toolkit slug
//                      ──bindComposioToolkits──▶  a composio ConnectorBinding
//
// So the long tail — including Google Business Profile the day Composio lists
// it — becomes bindable with ZERO further pipeline change: the binding shape is
// identical to a hand-bound composio connector, so the rest of the generate
// path (compose → persist → runtime MCP) already knows what to do with it.
//
// PLAIN MODULE — NOT "use server". It exports types + sync pure helpers (which
// Server Actions forbid). A Server Action that needs the live list calls
// `listComposioToolkits()` from its own "use server" file.
//
// I/O IS DEPENDENCY-INJECTED. `listComposioToolkits` takes an optional
// `deps.fetchToolkits` so tests never touch the network. The real fetch path is
// gated on the platform `COMPOSIO_API_KEY` (the catalog is platform-wide, not
// per-workspace) and is constructed exactly like `composioForOrg` —
// `new Composio({ apiKey })` then `composio.toolkits.get({})`, which returns the
// full toolkit array. Composio's SDK list method (`toolkits.get`) transforms the
// REST `GET /api/v3/toolkits` response to camelCase; the human description lives
// at `meta.description`.
//
// FAIL-SOFT EVERYWHERE: no key / any SDK error → `[]` (the agent simply binds
// nothing extra + the caller surfaces a warning). None of these functions throw.

import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import { defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";

/** A live Composio toolkit, flattened to the fields the matcher needs. This is
 *  intentionally a self-contained shape (slug + name + optional description) —
 *  the curated `integrations/composio/catalog.ts` `ComposioToolkitInfo` is a
 *  different (UI-oriented) type; we don't reuse it so the two never clash. */
export type ComposioToolkitInfo = {
  /** Composio toolkit slug (lowercase, e.g. "googlebusiness"). */
  slug: string;
  /** Human label (e.g. "Google Business Profile"). */
  name: string;
  /** One-line description used as extra matcher signal. */
  description?: string;
};

/** One resolved capability → toolkit mapping. */
export type ResolvedToolkit = {
  /** The original plain-English capability phrase. */
  capability: string;
  /** The matched Composio toolkit slug. */
  slug: string;
  /** The matched toolkit's human label (for warnings / UX). */
  label: string;
};

// ─── live catalog listing (DI'd, cached, fail-soft) ──────────────────────────

/** Process-level cache of the live list. Resolved once per process: the catalog
 *  is large and effectively static for the lifetime of a server instance.
 *  `undefined` = not yet resolved; an array (incl. `[]`) = resolved. */
let cachedToolkits: ComposioToolkitInfo[] | undefined;

/**
 * The real Composio fetch: construct the SDK client with the PLATFORM key and
 * list every toolkit. Returns `[]` (never throws) when the key is unset or the
 * SDK errors — the catalog is platform-wide so we use `COMPOSIO_API_KEY`
 * directly (no per-workspace BYO key, no org session).
 *
 * `@composio/core` is a Node-runtime SDK; this is only ever reached on the
 * server. The import is dynamic so this module stays free of a top-level
 * `@composio/core` dependency (keeping it importable from any runtime — the
 * pure helpers below have no SDK dependency at all).
 */
async function fetchToolkitsLive(): Promise<ComposioToolkitInfo[]> {
  const apiKey = clean(process.env.COMPOSIO_API_KEY);
  if (!apiKey) return [];
  try {
    const { Composio } = await import("@composio/core");
    const composio = new Composio({ apiKey });
    // `toolkits.get({})` → the full toolkit array (camelCased). Each item is
    // `{ slug, name, meta: { description?, logo?, ... }, ... }`.
    const items = (await composio.toolkits.get({})) as Array<{
      slug?: unknown;
      name?: unknown;
      meta?: { description?: unknown } | null;
    }>;
    return normalizeToolkitItems(items);
  } catch {
    // Network / auth / shape error → fail soft to the empty catalog.
    return [];
  }
}

/**
 * List Composio's LIVE toolkit catalog (hundreds of toolkits), resolved once
 * per process and cached in a module-level variable.
 *
 * - `deps.fetchToolkits` (tests) is used verbatim when provided.
 * - Otherwise the real SDK list runs, gated on `COMPOSIO_API_KEY`.
 * - On the SECOND+ call the cached value is returned WITHOUT re-invoking the
 *   fetch (so an injected fetch fn is called exactly once).
 * - Any rejection from the fetch fn fails soft to `[]` (and that `[]` is cached,
 *   so we don't hammer a failing endpoint). Never throws.
 */
export async function listComposioToolkits(deps?: {
  fetchToolkits?: () => Promise<ComposioToolkitInfo[]>;
}): Promise<ComposioToolkitInfo[]> {
  if (cachedToolkits !== undefined) return cachedToolkits;

  const fetchFn = deps?.fetchToolkits ?? fetchToolkitsLive;
  let resolved: ComposioToolkitInfo[];
  try {
    resolved = await fetchFn();
  } catch {
    resolved = [];
  }
  cachedToolkits = Array.isArray(resolved) ? resolved : [];
  return cachedToolkits;
}

/** Test-only: clear the process-level cache so each test starts cold. */
export function __resetComposioToolkitCacheForTests(): void {
  cachedToolkits = undefined;
}

// ─── capability → toolkit matching (PURE) ────────────────────────────────────

/** Minimum overlap score for a match. A score of 1 (a single shared word like
 *  "create") is too weak and yields false positives, so we require at least 2
 *  shared meaningful tokens. This is the guard that makes an unmatchable
 *  capability resolve to nothing rather than to a random toolkit. */
const MIN_MATCH_SCORE = 2;

/** Tokens that carry no discriminating signal — dropped before scoring so they
 *  can't inflate a match. Kept small + generic (stopwords + verbs/nouns that
 *  appear in almost every capability phrase). */
const STOPWORDS = new Set<string>([
  "a", "an", "the", "this", "that", "these", "those", "to", "of", "for", "in",
  "on", "at", "by", "with", "and", "or", "from", "into", "via", "as", "is",
  "are", "be", "it", "its", "our", "your", "their", "his", "her", "my", "me",
  "we", "us", "you", "they", "them", "i",
  // ultra-generic capability verbs/nouns
  "read", "get", "fetch", "list", "create", "make", "add", "update", "send",
  "post", "new", "use", "using", "do", "manage", "business", "business's",
  "businesss", "account", "data", "info", "information", "app", "tool", "via",
]);

/** Light singular-ization so "cards"↔"card", "reviews"↔"review",
 *  "posts"↔"post" align across a capability phrase and a toolkit description.
 *  Deliberately crude (strip a trailing plural "s"/"es", never below 3 chars) —
 *  it only needs to fold the common plural the matcher would otherwise miss, not
 *  be a real stemmer. */
function singularize(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Split a string into lowercased, de-noised, singularized tokens (alphanumerics,
 *  length ≥ 2, not a stopword). Possessive `'s` is stripped so "business's" →
 *  "business" (then dropped as a stopword) and "google's" → "google". Plural
 *  folding (`singularize`) runs AFTER stopword filtering so "review" matches
 *  "reviews" and "card" matches "cards". */
function tokenize(text: string): string[] {
  if (typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "") // drop possessive 's
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(singularize);
}

/** The set of meaningful tokens for a toolkit = its name + description tokens. */
function toolkitTokens(tk: ComposioToolkitInfo): Set<string> {
  const name = typeof tk.name === "string" ? tk.name : "";
  const desc = typeof tk.description === "string" ? tk.description : "";
  // The slug is often a smashed-together word (e.g. "googlebusiness") that
  // tokenizes to one useless token, so we lean on name + description. We DO add
  // the raw slug as a token so an exact-slug mention can still contribute.
  const tokens = new Set<string>([...tokenize(name), ...tokenize(desc)]);
  if (typeof tk.slug === "string" && tk.slug.length >= 2) {
    tokens.add(tk.slug.toLowerCase());
  }
  return tokens;
}

/** Score one capability phrase against one toolkit = count of shared tokens. */
function scoreCapabilityAgainstToolkit(
  capTokens: string[],
  tkTokens: Set<string>,
): number {
  let score = 0;
  const counted = new Set<string>();
  for (const t of capTokens) {
    if (counted.has(t)) continue; // a capability token counts at most once
    if (tkTokens.has(t)) {
      score += 1;
      counted.add(t);
    }
  }
  return score;
}

/**
 * PURE. For each capability phrase, pick the single best-matching toolkit by
 * lowercased-token overlap against the toolkit's name + description (+ slug).
 * A capability whose best score is below `MIN_MATCH_SCORE` resolves to nothing
 * (skipped). The result is de-duplicated by slug (first capability that claims
 * a slug wins) and order-stable. Never throws — bad inputs yield `[]`.
 */
export function resolveCapabilitiesToToolkits(
  capabilities: string[],
  toolkits: ComposioToolkitInfo[],
): ResolvedToolkit[] {
  if (!Array.isArray(capabilities) || !Array.isArray(toolkits)) return [];
  if (capabilities.length === 0 || toolkits.length === 0) return [];

  // Precompute each toolkit's token set once.
  const prepared = toolkits
    .filter(
      (tk): tk is ComposioToolkitInfo =>
        !!tk && typeof tk.slug === "string" && tk.slug.trim().length > 0,
    )
    .map((tk) => ({ tk, tokens: toolkitTokens(tk) }));

  const out: ResolvedToolkit[] = [];
  const claimedSlugs = new Set<string>();

  for (const capability of capabilities) {
    if (typeof capability !== "string" || capability.trim().length === 0) {
      continue;
    }
    const capTokens = tokenize(capability);
    if (capTokens.length === 0) continue;

    let best: { tk: ComposioToolkitInfo; score: number } | null = null;
    for (const { tk, tokens } of prepared) {
      const score = scoreCapabilityAgainstToolkit(capTokens, tokens);
      if (score < MIN_MATCH_SCORE) continue;
      // Strictly-greater keeps the FIRST toolkit on a tie (order-stable).
      if (!best || score > best.score) {
        best = { tk, score };
      }
    }

    if (!best) continue;
    const slug = best.tk.slug.trim().toLowerCase();
    if (claimedSlugs.has(slug)) continue; // dedupe by slug
    claimedSlugs.add(slug);
    out.push({
      capability,
      slug,
      label: typeof best.tk.name === "string" && best.tk.name.trim().length > 0
        ? best.tk.name
        : slug,
    });
  }

  return out;
}

// ─── slug → ConnectorBinding (PURE) ──────────────────────────────────────────

/**
 * PURE. Map each toolkit slug onto a real composio `ConnectorBinding`
 * (`{ id, kind:"composio", enabledToolkits:[slug], enabledTools }`) — the
 * exact shape a hand-bound composio connector produces, so every binding parses
 * through `connectorBindingSchema`. `enabledTools` is SEEDED with the
 * toolkit's curated catalog defaults (T6 parity — the same bug class fixed in
 * bind-tools.ts's bindingForEntry and compile-agent.ts's bindingForToolkit):
 * a catalog slug (gmail, slack, …) gets its default tool list; a non-catalog
 * slug (the long-tail case this module exists for — youtube, synthflow_ai)
 * still yields `[]` here and stays `[]` until the persist-time live-discovery
 * fill (lib/integrations/composio/discover-tools.ts, 2026-07-11 slice) widens
 * it. De-duplicated by id, order-stable. Empty/invalid slugs are dropped.
 * Never throws.
 */
export function bindComposioToolkits(slugs: string[]): ConnectorBinding[] {
  if (!Array.isArray(slugs)) return [];
  const out: ConnectorBinding[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase();
    if (slug.length === 0) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      id: slug,
      kind: "composio",
      enabledToolkits: [slug],
      enabledTools: defaultToolsForToolkits([slug]),
    });
  }
  return out;
}

// ─── internal helpers ────────────────────────────────────────────────────────

/** Empty/whitespace-only → null. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Map raw Composio SDK toolkit items → our flat `ComposioToolkitInfo[]`. Drops
 *  items without a usable slug; reads the description from `meta.description`. */
function normalizeToolkitItems(
  items: Array<{
    slug?: unknown;
    name?: unknown;
    meta?: { description?: unknown } | null;
  }>,
): ComposioToolkitInfo[] {
  if (!Array.isArray(items)) return [];
  const out: ComposioToolkitInfo[] = [];
  for (const it of items) {
    const slug = clean(typeof it?.slug === "string" ? it.slug : null);
    if (!slug) continue;
    const name =
      clean(typeof it?.name === "string" ? it.name : null) ?? slug;
    const description = clean(
      typeof it?.meta?.description === "string" ? it.meta.description : null,
    );
    const info: ComposioToolkitInfo = { slug: slug.toLowerCase(), name };
    if (description) info.description = description;
    out.push(info);
  }
  return out;
}
