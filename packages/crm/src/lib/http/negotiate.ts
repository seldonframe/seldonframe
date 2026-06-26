// Accept-header content negotiation for the HTML↔Markdown twins.
//
// This is the SAFETY-CRITICAL core of the agent-Markdown feature: the proxy
// calls negotiate(req.headers.get("accept")) on EVERY matched marketplace
// request, so the rule must be conservative — return "html" unless the client
// EXPLICITLY prefers Markdown. A bug that returned "markdown" too eagerly would
// serve raw Markdown to real browsers.
//
// The four non-negotiables (per the design doc):
//  1. COMPARE q-VALUES — never substring-match. `text/html, text/markdown;q=0.5`
//     prefers HTML (q=1.0 > 0.5) → "html".
//  2. Resolve a TIE to Markdown ONLY when `text/markdown` is EXPLICITLY named.
//     So `*/*` (browsers) and `text/*` resolve to "html", never "markdown".
//  3. Wildcards (`*/*`, `text/*`) match `text/markdown` for the 406 decision but
//     do NOT count as an explicit Markdown preference (no cloaking of browsers).
//  4. 406 is decided by `acceptsNeither()` — used by the `.md` route handlers,
//     not by the proxy (explicit `.md` URLs skip negotiation entirely).
//
// Pure — no Next, no I/O. Unit-tested exhaustively.

export type NegotiatedType = "html" | "markdown";

type MediaRange = {
  /** e.g. "text", "*". */
  type: string;
  /** e.g. "html", "markdown", "*". */
  subtype: string;
  /** Quality 0..1 (defaults to 1 when absent). */
  q: number;
};

const HTML = "text/html";
const MARKDOWN = "text/markdown";

/**
 * Parse an Accept header into media ranges with q-values. Malformed entries are
 * skipped (defensive — a junk Accept must never throw on the request path). An
 * absent/empty header yields an empty list, which the callers treat as "no
 * stated preference" → HTML.
 */
function parseAccept(header: string | null | undefined): MediaRange[] {
  if (!header) return [];
  const ranges: MediaRange[] = [];
  for (const part of header.split(",")) {
    const segments = part.trim().split(";");
    const token = segments[0]?.trim().toLowerCase();
    if (!token) continue;
    const slash = token.indexOf("/");
    if (slash <= 0) continue; // require "type/subtype"
    const type = token.slice(0, slash);
    const subtype = token.slice(slash + 1);
    if (!type || !subtype) continue;

    let q = 1;
    for (const param of segments.slice(1)) {
      const eq = param.indexOf("=");
      if (eq < 0) continue;
      const key = param.slice(0, eq).trim().toLowerCase();
      if (key !== "q") continue;
      const parsed = Number.parseFloat(param.slice(eq + 1).trim());
      // Clamp to [0,1]; ignore NaN (treat as the default 1).
      q = Number.isNaN(parsed) ? 1 : Math.min(1, Math.max(0, parsed));
    }
    ranges.push({ type, subtype, q });
  }
  return ranges;
}

/** Does a parsed range match a concrete `type/subtype` (wildcards allowed)? */
function rangeMatches(range: MediaRange, type: string, subtype: string): boolean {
  const typeOk = range.type === "*" || range.type === type;
  const subtypeOk = range.subtype === "*" || range.subtype === subtype;
  return typeOk && subtypeOk;
}

/**
 * The best (highest) q-value the Accept header grants a concrete media type,
 * including via wildcards. Returns -1 when the type is not acceptable at all
 * (no matching range, or matched only at q=0). When the header is empty, every
 * concrete type is implicitly acceptable at q=1 (RFC 7231 §5.3.2).
 */
function qualityFor(ranges: MediaRange[], type: string, subtype: string): number {
  if (ranges.length === 0) return 1;
  let best = -1;
  for (const range of ranges) {
    if (!rangeMatches(range, type, subtype)) continue;
    if (range.q > best) best = range.q;
  }
  // A match at q=0 means "explicitly not acceptable".
  return best <= 0 ? -1 : best;
}

/** Is `text/markdown` named EXPLICITLY (not just via a `*` wildcard) at q>0? */
function markdownExplicitlyNamed(ranges: MediaRange[]): boolean {
  return ranges.some(
    (r) => r.type === "text" && r.subtype === "markdown" && r.q > 0,
  );
}

/**
 * Decide which representation to serve for an HTML page that has a Markdown
 * twin. Conservative by construction: returns "markdown" ONLY when the client
 * explicitly named `text/markdown` AND its q-value is strictly greater than
 * HTML's — OR they tie AND Markdown was explicitly named. Otherwise "html".
 *
 *   text/html, text/markdown;q=0.5   → html      (1.0 > 0.5)
 *   text/markdown                    → markdown  (md=1, html=-1)
 *   text/markdown, text/html         → markdown  (tie 1.0, md explicit)
 *   text/markdown;q=0.9, text/html   → html      (1.0 > 0.9)
 *   * / *                            → html      (md only via wildcard)
 *   text/*                           → html      (md only via wildcard)
 *   (absent)                         → html      (no stated preference)
 */
export function negotiate(acceptHeader: string | null | undefined): NegotiatedType {
  const ranges = parseAccept(acceptHeader);

  const mdQuality = qualityFor(ranges, "text", "markdown");
  const htmlQuality = qualityFor(ranges, "text", "html");

  // Markdown must be acceptable AND explicitly named to ever win. A `*/*` that
  // makes md "acceptable" never flips a browser to Markdown.
  if (mdQuality < 0 || !markdownExplicitlyNamed(ranges)) {
    return "html";
  }

  // Strictly prefers Markdown.
  if (mdQuality > htmlQuality) return "markdown";

  // Tie — resolve to Markdown only because md is explicitly named (checked
  // above). (htmlQuality < 0 also lands here when html isn't acceptable.)
  if (mdQuality === htmlQuality) return "markdown";

  return "html";
}

/**
 * For the `.md` route handlers' 406 decision: true when the client accepts
 * NEITHER `text/markdown` NOR `text/html` (so the handler can return 406). An
 * empty/absent Accept accepts everything → false. Wildcards count here (a
 * wildcard `* / *` client DOES accept the Markdown the handler will serve).
 */
export function acceptsNeither(acceptHeader: string | null | undefined): boolean {
  const ranges = parseAccept(acceptHeader);
  if (ranges.length === 0) return false;
  const mdOk = qualityFor(ranges, "text", "markdown") >= 0;
  const htmlOk = qualityFor(ranges, "text", "html") >= 0;
  return !mdOk && !htmlOk;
}

/** The media types involved, exported so callers build consistent headers. */
export const MEDIA_TYPES = { HTML, MARKDOWN } as const;
