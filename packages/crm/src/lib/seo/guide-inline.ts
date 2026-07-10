// markdown-lite: **bold**, *italic*, [label](/internal-path) — the ONLY
// inline markup guides are allowed to use (see guides/types.ts). Pure module
// (no React, no next/link) so it can be unit-tested and imported from
// guide-page.tsx, guide-markdown.ts, and the test suite alike without
// dragging React/Next component dependencies into a plain node:test run.

export const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

/** One parsed markdown-lite token: plain text, bold, italic, or an internal link. */
export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; label: string; href: string; internal: boolean };

/** Tokenize markdown-lite text into a flat list of typed tokens. Callers
 *  (React renderer, markdown twin) turn each token into their own output —
 *  this module has no rendering opinion. */
export function tokenizeInlineMarkup(text: string): InlineToken[] {
  const parts = text.split(INLINE_TOKEN);
  const tokens: InlineToken[] = [];
  for (const part of parts) {
    if (!part) continue;
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      tokens.push({ kind: "bold", text: boldMatch[1] });
      continue;
    }
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      tokens.push({ kind: "link", label, href, internal: href.startsWith("/") });
      continue;
    }
    const italicMatch = /^\*([^*]+)\*$/.exec(part);
    if (italicMatch) {
      tokens.push({ kind: "italic", text: italicMatch[1] });
      continue;
    }
    tokens.push({ kind: "text", text: part });
  }
  return tokens;
}

/** Strip markdown-lite markup down to plain text — used for JSON-LD / meta
 *  strings so no `**`, `*`, or `[label](url)` ever leaks into structured data. */
export function stripInlineMarkup(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

/** True if an analogy callout's own text already opens with "kind of like"
 *  (optionally after a leading "It's "/"It is ") — used to avoid the twin
 *  and HTML callout both saying "Kind of like: It's kind of like…". */
export function startsWithKindOfLike(text: string): boolean {
  return /^(it'?s\s+|it\s+is\s+)?kind\s+of\s+like\b/i.test(text.trim());
}
