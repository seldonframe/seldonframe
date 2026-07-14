// packages/crm/src/lib/web-onboarding/markdown-extractor.ts
//
// Replaces web-fetch-extractor.ts (kept as legacy) with a thin
// scraper -> LLM pipeline. No web_fetch tool. No tool-use turns. The
// LLM does one job: extract structured business facts from a Markdown
// document we hand it.
//
// REQUIRED ENV: FIRECRAWL_API_KEY
//   - Sign up at https://firecrawl.dev (500 scrapes/month free)
//   - Self-host alternative: https://github.com/firecrawl/firecrawl
//   - To swap to a different scraper (Browserless, ScrapingBee, Bright
//     Data), only firecrawl-scrape.ts changes — this file stays.
//
// Why this exists (2026-05-16):
//   - Vercel logs showed every URL failing parse with Claude returning
//     conversational preambles ("I'll fetch the homepage to extract...")
//     or getting truncated mid-reasoning before emitting JSON.
//   - The Anthropic web_fetch tool locked us into Anthropic-only.
//   - We never saw what HTML reached the model (no observability).
//   - JS-only SPAs couldn't be fetched at all.
//
// 2026-05-16 (later same day):
//   - First cut used server-side fetch() + node-html-markdown. Vercel
//     logs immediately showed http_error_403 on every Cloudflare-fronted
//     agency site (HVAC, dental, etc.) — Vercel egress IPs are bot-flagged.
//   - Replaced with Firecrawl which runs a real browser fingerprint behind
//     rotating proxies and returns Markdown directly. fetch-page.ts and
//     html-to-markdown.ts are gone.
//
// THIN HARNESS + ANTIFRAGILE TO LLM IMPROVEMENTS:
// To swap to GPT-5 / Gemini / Llama, only this file changes — the prompt
// (EXTRACTION_INSTRUCTIONS_MD) is provider-agnostic. Each LLM gets the
// same MD input and is asked for the same JSON output.

import Anthropic from "@anthropic-ai/sdk";

import {
  EXTRACTION_INSTRUCTIONS_MD,
  type ExtractedBusinessFacts,
} from "./extraction-prompt";
import { parseExtraction } from "./extraction-parser";
import { firecrawlScrape, type ScrapeDeps } from "./firecrawl-scrape";
import { harvestImagesFromHtml } from "./html-image-harvester";
import { WebFetchError, type WebFetchErrorReason } from "./web-fetch-extractor";

// Re-export the error type so callers can import it from either path
// during the cutover period without breaking.
export { WebFetchError };
export type { WebFetchErrorReason };

// Default model: claude-opus-4-7 (best-in-class reasoning on messy
// real-world agency websites; operator pays once per workspace creation).
// Override priority:
//   1. params.model (per-call, used for tests + A/B)
//   2. process.env.WEB_ONBOARDING_MODEL (deployment-level override)
//   3. claude-opus-4-7
const DEFAULT_MODEL =
  process.env.WEB_ONBOARDING_MODEL?.trim() || "claude-opus-4-7";

// Output is JSON only (no tool-use reasoning). 4096 proved too tight for
// content-rich sites: a long services_detailed + photos[] + faq +
// testimonials payload could exceed it, truncating the JSON mid-field so the
// parser rejected it (markdown_extractor_parse_failed in prod, e.g.
// gardensfortexas.com). Restored to 8192 (the prior value) for comfortable
// headroom; photos are already capped at 12 in EXTRACTION_INSTRUCTIONS_MD.
const MAX_TOKENS = 8192;

// System prompt — strongest format constraint Anthropic offers. The new
// architecture eliminates tool-use turns so the model can't go
// conversational on us, but the system prompt is belt-and-suspenders.
const SYSTEM_PROMPT = `You are a JSON-only business-fact extraction service. You receive a website's content as Markdown in the user message and return exactly one JSON object describing the business. You NEVER speak conversationally. You NEVER explain your reasoning. You NEVER preface your response. Your output is consumed by a parser that requires exactly one valid JSON object as the entire response.`;

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicLike = {
  messages: {
    create: (
      params: Record<string, unknown>,
      opts?: { headers?: Record<string, string> },
    ) => Promise<{
      content: Array<AnthropicContentBlock>;
      stop_reason?: string;
    }>;
  };
};

function pickText(content: Array<AnthropicContentBlock>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

/**
 * Drop-in replacement for the old extractBusinessFactsFromUrl signature
 * (web-fetch-extractor.ts). Same params except the HTTP test seam is
 * now `firecrawlClient` (was `fetchImpl`); same return type; same error
 * surface (WebFetchError with the same four reason codes).
 *
 * Test seams: firecrawlClient (scrape layer) and anthropicClient (LLM
 * layer) are independently injectable. Production callers pass neither.
 */
export async function extractBusinessFactsFromUrl(params: {
  url: string;
  byokKey: string;
  /** Test seam — defaults to a real Firecrawl client built from env. */
  firecrawlClient?: ScrapeDeps["firecrawlClient"];
  /** Test seam — defaults to a real Anthropic client built from byokKey. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<ExtractedBusinessFacts> {
  const client = (params.anthropicClient ??
    new Anthropic({ apiKey: params.byokKey })) as AnthropicLike;
  const modelInUse = params.model || DEFAULT_MODEL;

  // Step 1: Firecrawl scrape -> Markdown.
  const scrape = await firecrawlScrape(params.url, {
    firecrawlClient: params.firecrawlClient,
  });
  if (!scrape.ok) {
    console.warn(
      JSON.stringify({
        event: "markdown_extractor_firecrawl_failed",
        url: params.url,
        reason: scrape.reason,
        detail: scrape.detail?.slice(0, 200) ?? null,
      }),
    );
    if (scrape.reason === "not_configured") {
      throw new WebFetchError(
        "internal_error",
        "FIRECRAWL_API_KEY not set on this deployment",
      );
    }
    throw new WebFetchError(
      "extraction_failed",
      `Firecrawl fetch failed: ${scrape.reason}${
        scrape.detail ? `: ${scrape.detail}` : ""
      }`,
    );
  }

  const md = scrape.markdown;

  // Step 2: Anthropic call — NO TOOLS, NO web_fetch. Just system +
  // user-message-with-MD -> JSON response.
  let response: { content: Array<AnthropicContentBlock>; stop_reason?: string };
  try {
    response = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      // Static across every call for this deployment (same SYSTEM_PROMPT
      // string every time) — hoisted into a cached `system` array entry
      // per the enhance-blocks.ts:722-748 pattern. Only the per-request
      // Markdown + URL stay in the uncached user message.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_INSTRUCTIONS_MD}\n\nURL: ${params.url}\n\nPage content (Markdown):\n${md}`,
        },
      ],
    });
  } catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "markdown_extractor_anthropic_error",
        url: params.url,
        model: modelInUse,
        status: status ?? null,
        message: message.slice(0, 500),
      }),
    );
    if (status === 401 || status === 403) {
      throw new WebFetchError(
        "anthropic_unauthorized",
        "Anthropic rejected the BYOK key.",
        err,
      );
    }
    if (status === 402 || status === 429) {
      throw new WebFetchError(
        "credits_exhausted",
        "BYOK Anthropic key has no remaining credits.",
        err,
      );
    }
    throw new WebFetchError(
      "internal_error",
      err instanceof Error ? err.message : "Anthropic SDK call failed.",
      err,
    );
  }

  // Step 3: extract and parse the JSON text.
  const text = pickText(response.content);
  if (!text) {
    console.warn(
      JSON.stringify({
        event: "markdown_extractor_empty_text",
        url: params.url,
        model: modelInUse,
        stop_reason: response.stop_reason ?? null,
        content_types: response.content.map((b) => b.type),
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      "LLM returned no text content block.",
    );
  }

  const parsed = parseExtraction(text);
  if (!parsed.ok) {
    console.warn(
      JSON.stringify({
        event: "markdown_extractor_parse_failed",
        url: params.url,
        model: modelInUse,
        // stop_reason="max_tokens" + a large text_len ⇒ truncation (raise
        // MAX_TOKENS); "end_turn" with valid-looking text ⇒ malformed JSON.
        stop_reason: response.stop_reason ?? null,
        text_len: text.length,
        text_preview: text.slice(0, 500),
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      "The model returned no usable JSON.",
    );
  }

  const facts = parsed.data;

  // Deterministically enrich with images harvested straight from the page
  // HTML. Firecrawl markdown only carries ![](...) images; the real hero /
  // gallery photos live in CSS background / srcset / lazy attrs and the logo
  // + og:image live in <head>. We merge these ourselves rather than trusting
  // the LLM to surface them from markdown (which it structurally cannot).
  if (scrape.html || scrape.ogImage) {
    const harvest = harvestImagesFromHtml(scrape.html ?? "", scrape.finalUrl);
    facts.logo = harvest.logo ?? scrape.favicon ?? facts.logo ?? null;

    const keyOf = (src: string): string => {
      try {
        const u = new URL(src);
        return u.origin + u.pathname;
      } catch {
        return src;
      }
    };
    const existing = Array.isArray(facts.photos) ? facts.photos : [];
    const seen = new Set(existing.map((p) => keyOf(p.src)));
    const additions: NonNullable<ExtractedBusinessFacts["photos"]> = [];

    // og:image first — the strongest hero candidate.
    const ogSrc = scrape.ogImage ?? harvest.ogImage;
    if (ogSrc && !seen.has(keyOf(ogSrc))) {
      additions.push({ src: ogSrc, alt: "", section: "hero" });
      seen.add(keyOf(ogSrc));
    }
    for (const img of harvest.images) {
      const k = keyOf(img.src);
      if (seen.has(k)) continue;
      seen.add(k);
      additions.push({ src: img.src, alt: img.alt, section: img.section });
    }

    // Real source photos go FIRST so the R1 generator prefers them over stock.
    facts.photos = [...additions, ...existing].slice(0, 12);

    console.warn(
      JSON.stringify({
        event: "source_images_harvested",
        url: params.url,
        from_html: harvest.images.length,
        og_image: !!ogSrc,
        logo: !!facts.logo,
        total_photos: facts.photos.length,
      }),
    );
  }

  return facts;
}
