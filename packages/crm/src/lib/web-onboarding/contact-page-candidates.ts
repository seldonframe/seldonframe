// packages/crm/src/lib/web-onboarding/contact-page-candidates.ts
//
// Pure helper (no IO) used by markdown-extractor.ts's contact-page fallback
// (see docs/superpowers/specs/2026-07-14-extraction-failed-honesty-and-
// contact-fallback-design.md). When the homepage scrape is missing a
// required extraction field (most commonly `phone`, obfuscated by tools
// like CleanTalk and moved to a dedicated page), we harvest same-host
// "contact-shaped" links from the homepage Markdown so the extractor can
// retry against them.
//
// Same-host only: the base URL was already SSRF-vetted at the route
// boundary (validateCreateFromUrlInput), so a same-host path can't change
// the effective target — no additional vetting needed here.

const CONTACT_PATH_RE = /(contact|about|location|visit|find[-_]?us)/i;
const CONTACT_RANK_RE = /contact/i;
const ABOUT_RANK_RE = /about/i;

// [text](href) — the only markdown link shape Firecrawl emits.
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

function rankOf(pathname: string): number {
  if (CONTACT_RANK_RE.test(pathname)) return 0;
  if (ABOUT_RANK_RE.test(pathname)) return 1;
  return 2;
}

/**
 * Harvest same-host, contact-shaped page links from a scraped homepage's
 * Markdown, ranked contact > about > everything else, deduped on
 * origin+pathname, capped at 2. Falls back to `[origin + "/contact",
 * origin + "/contact-us"]` guesses when zero candidates are found in the
 * Markdown (the extractor's caller scrapes these gracefully — a 404 guess
 * is simply skipped, never fatal).
 */
export function findContactPageCandidates(markdown: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const baseKey = base.origin + base.pathname.replace(/\/+$/, "") || base.origin;

  type Candidate = { url: string; key: string; rank: number };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  MD_LINK_RE.lastIndex = 0;
  while ((match = MD_LINK_RE.exec(markdown)) !== null) {
    const href = match[1];
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.hostname !== base.hostname) continue;
    if (!CONTACT_PATH_RE.test(resolved.pathname)) continue;

    const normalizedPath = resolved.pathname.replace(/\/+$/, "") || "/";
    const key = resolved.origin + normalizedPath;
    const selfKey = baseKey.replace(/\/+$/, "") || base.origin;
    if (key === selfKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      url: resolved.origin + normalizedPath,
      key,
      rank: rankOf(resolved.pathname),
    });
  }

  candidates.sort((a, b) => a.rank - b.rank);
  const top = candidates.slice(0, 2).map((c) => c.url);
  if (top.length > 0) return top;

  return [`${base.origin}/contact`, `${base.origin}/contact-us`];
}
