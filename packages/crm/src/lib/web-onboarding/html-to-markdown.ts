// packages/crm/src/lib/web-onboarding/html-to-markdown.ts
//
// Convert fetched HTML into clean Markdown the LLM extractor can read
// efficiently. The MD-as-input pivot (2026-05-16) replaces sending raw
// HTML to Anthropic's web_fetch tool because:
//   1. MD is ~5-10x more token-efficient than HTML (no closing tags,
//      no class/id noise, no inline style soup).
//   2. The LLM's attention can focus on facts, not parsing.
//   3. Provider-agnostic — the same MD goes to Claude, GPT, or Gemini.
//
// Library choice: `node-html-markdown` — zero runtime deps, ships its
// own HTML parser, ~40KB. Alternatives considered:
//   - turndown: depends on jsdom (heavy, ~3MB)
//   - html-to-md: smaller but missing list/header support
//   - rehype + remark: too much ceremony for a one-shot transform
//
// Pure function. No IO. Fully testable with synthetic HTML.

import { NodeHtmlMarkdown } from "node-html-markdown";

// Hard ceiling on the MD we feed the LLM. Agency homepages compressed to
// MD rarely exceed 4-5k chars; 8k gives slack for content-heavy /about
// or /services pages while staying inside any reasonable model's input
// budget. Truncation is dumb-end (no smart sentence boundary) — the LLM
// can handle a mid-word cutoff fine; the cost of cleverness here isn't
// worth the complexity.
const DEFAULT_MAX_CHARS = 8000;

// Elements we strip entirely (children too). Tells node-html-markdown to
// treat them as no-ops:
//   - script/style/noscript: code/CSS the LLM doesn't need
//   - svg: vector graphics produce hundreds of unreadable tokens
//   - iframe/object/embed: third-party content, usually ads or maps
//   - form input fields: usually login/signup widgets, no business facts
//   - canvas/audio/video: media, nothing for the extractor to read
//
// We intentionally KEEP header/footer/nav — business facts (phone, address,
// hours, "Family-owned since 1998") frequently live there, not in main.
const IGNORE_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "object",
  "embed",
  "canvas",
  "audio",
  "video",
  "input",
  "select",
  "textarea",
  "button",
];

// One shared instance — NodeHtmlMarkdown is stateless across translate()
// calls, so we avoid re-parsing the config on every invocation.
const nhm = new NodeHtmlMarkdown({
  // Don't inline data URIs (base64 PNGs can be 1MB+ each — the option
  // exists because some users want them, but for our extractor they're
  // pure token waste). Side effect: image tags with a data: src are
  // dropped entirely (alt text included). Acceptable tradeoff because
  // data-URI images on agency sites are nearly always decorative icons,
  // not business-fact-bearing imagery.
  keepDataImages: false,
  // Cap blank-line runs at 2 (default 3) — collapses messy WordPress
  // exports without losing structural separation.
  maxConsecutiveNewlines: 2,
  // Inline link syntax: [text](url) — easier for the LLM to associate
  // anchor text with destination than reference-style [text][1] ... [1]: url.
  useInlineLinks: true,
  ignore: IGNORE_ELEMENTS,
});

/**
 * Convert HTML into LLM-friendly Markdown.
 *
 * Output guarantees:
 *   - At most `maxChars` characters (default 8000).
 *   - No script/style/noscript/svg blobs.
 *   - Headings, lists, links, image alt text preserved.
 *   - Header/footer/nav content kept (business facts live there).
 *   - Multiple blank lines collapsed.
 *   - Empty or whitespace-only input -> "".
 */
export function htmlToMarkdown(
  html: string,
  opts?: { maxChars?: number },
): string {
  if (!html || !html.trim()) {
    return "";
  }

  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const md = nhm.translate(html).trim();

  if (md.length <= maxChars) {
    return md;
  }
  return md.slice(0, maxChars);
}
