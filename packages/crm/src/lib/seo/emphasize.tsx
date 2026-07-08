// Pure skimmability helper shared by the comparison/alternative/best SEO page
// templates and their Markdown twins. Wraps high-signal tokens (dollar
// amounts, percentages, pricing-model phrases) in <strong> (React) or
// **bold** (Markdown) so readers can scan a page like a 12-year-old could —
// per CLAUDE.md's "Delight First" + the never-lies rule, this NEVER
// paraphrases or invents text: it only wraps substrings that are already
// present, verbatim.

import type { ReactNode } from "react";

/** Dollar amounts: $29, $29/mo, $97–$497/mo, $0.30/min, $3,000, $1.5k, etc.
 *  Supports plain hyphen and en-dash ranges, optional per-unit suffix. */
const MONEY_RE =
  /\$\d[\d,]*(?:\.\d+)?(?:k)?(?:\s?[-–—]\s?\$?\d[\d,]*(?:\.\d+)?(?:k)?)?(?:\/(?:mo|month|yr|year|min|credit|contact|user|seat|location|call))?/gi;

/** Percentages: 5%, 2.5%, 5–3–2%, etc. */
const PERCENT_RE = /\d+(?:\.\d+)?%/g;

/** High-signal pricing-model / positioning phrases, case-insensitive.
 *  Longer/more-specific phrases are listed first so overlapping matches
 *  prefer the longest one (e.g. "per location" before a bare "per"). */
const PHRASES = [
  "quote-gated",
  "free forever",
  "unlimited workspaces",
  "per minute",
  "per credit",
  "per contact",
  "per location",
  "per user",
  "per seat",
  "per call",
  "add-on",
  "flat",
];

// Build one combined regex: money OR percent OR phrase, longest-first so the
// regex engine's inherent left-to-right/first-alternative-wins behavior can't
// pick a shorter phrase where a longer one also matches at the same spot.
const PHRASE_ALTERNATION = PHRASES.slice()
  .sort((a, b) => b.length - a.length)
  .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const TOKEN_RE = new RegExp(`(${MONEY_RE.source})|(${PERCENT_RE.source})|(${PHRASE_ALTERNATION})`, "gi");

type Match = { start: number; end: number; text: string };

/** Find all non-overlapping high-signal matches in `text`, longest-match-wins
 *  at any given start position, scanning left to right. */
function findMatches(text: string): Match[] {
  const matches: Match[] = [];
  let lastEnd = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[0].length === 0) {
      // Guard against zero-length matches causing an infinite loop.
      TOKEN_RE.lastIndex++;
      continue;
    }
    if (start < lastEnd) {
      // Overlaps the previous match — skip (never double-wrap).
      continue;
    }
    matches.push({ start, end, text: m[0] });
    lastEnd = end;
  }
  return matches;
}

/** Wrap high-signal tokens (dollar amounts, percentages, and pricing-model
 *  phrases like "flat", "per minute", "free forever") in <strong>. Returns an
 *  array of strings and <strong> elements suitable for JSX children. Never
 *  double-wraps overlapping matches; passes through text with no matches
 *  unchanged. */
export function emphasize(text: string): ReactNode {
  if (!text) return text;
  const matches = findMatches(text);
  if (matches.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start));
    }
    nodes.push(
      // eslint-disable-next-line react/no-array-index-key -- stable within this single render of `text`
      <strong key={`em-${i}-${match.start}`}>{match.text}</strong>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

/** Markdown twin of `emphasize`: wraps the same tokens in **bold**. Idempotent
 *  — running it again on already-bolded text never produces `****` (matches
 *  inside an existing `**...**` span are skipped because the token regex
 *  never matches literal `*` characters, and we additionally guard against
 *  re-wrapping a token that's already surrounded by `**`). */
export function emphasizeMd(text: string): string {
  if (!text) return text;
  const matches = findMatches(text);
  if (matches.length === 0) return text;

  let out = "";
  let cursor = 0;
  for (const match of matches) {
    const before = text.slice(cursor, match.start);
    out += before;
    const alreadyBolded =
      out.endsWith("**") && text.slice(match.end, match.end + 2) === "**";
    if (alreadyBolded) {
      out += match.text;
    } else {
      out += `**${match.text}**`;
    }
    cursor = match.end;
  }
  out += text.slice(cursor);
  return out;
}
