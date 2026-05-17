// packages/crm/src/lib/web-onboarding/markdown-extractor.ts
//
// Replaces web-fetch-extractor.ts (kept as legacy) with a thin
// server-side fetch -> HTML->MD -> LLM pipeline. No web_fetch tool. No
// tool-use turns. The LLM does one job: extract structured business
// facts from a Markdown document we hand it.
//
// Why this exists (2026-05-16):
//   - Vercel logs showed every URL failing parse with Claude returning
//     conversational preambles ("I'll fetch the homepage to extract...")
//     or getting truncated mid-reasoning before emitting JSON.
//   - The Anthropic web_fetch tool locked us into Anthropic-only.
//   - We never saw what HTML reached the model (no observability).
//   - JS-only SPAs couldn't be fetched at all.
//
// New architecture:
//   1. fetch-page.ts  -> server-side fetch with timeout + UA + redirect
//   2. html-to-markdown.ts -> strip noise, keep facts, cap at 8k chars
//   3. THIS FILE -> call any LLM with strict JSON-only prompt
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
import { fetchPage } from "./fetch-page";
import { htmlToMarkdown } from "./html-to-markdown";
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

// Smaller than the old 8192 because the model no longer reasons about
// tool use — input is pre-fetched MD, output is just JSON. 4096 fits
// the full ExtractedBusinessFacts shape comfortably (~2k tokens for the
// JSON body) with slack for whitespace.
const MAX_TOKENS = 4096;

// Minimum MD length for a meaningful page. Below this we assume a JS-only
// SPA / Cloudflare challenge / 404-routed-to-homepage / blank page —
// none of which give the LLM enough signal to extract real facts. 200
// chars is roughly "a heading + a paragraph" — anything less is noise.
const MIN_MD_CHARS = 200;

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
 * (web-fetch-extractor.ts). Same params, same return type, same error
 * surface (WebFetchError with the same four reason codes).
 *
 * Test seams: fetchImpl (HTTP layer) and anthropicClient (LLM layer)
 * are independently injectable. Production callers pass neither.
 */
export async function extractBusinessFactsFromUrl(params: {
  url: string;
  byokKey: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam — defaults to a real Anthropic client built from byokKey. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<ExtractedBusinessFacts> {
  const client = (params.anthropicClient ??
    new Anthropic({ apiKey: params.byokKey })) as AnthropicLike;
  const modelInUse = params.model || DEFAULT_MODEL;

  // Step 1: server-side HTTP fetch.
  const fetchResult = await fetchPage(params.url, { fetchImpl: params.fetchImpl });
  if (!fetchResult.ok) {
    console.warn(
      JSON.stringify({
        event: "markdown_extractor_fetch_failed",
        url: params.url,
        reason: fetchResult.reason,
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      `Fetch failed: ${fetchResult.reason}`,
    );
  }

  // Step 2: HTML -> Markdown.
  const md = htmlToMarkdown(fetchResult.html);
  if (md.length < MIN_MD_CHARS) {
    console.warn(
      JSON.stringify({
        event: "markdown_extractor_empty_page",
        url: params.url,
        final_url: fetchResult.url,
        md_chars: md.length,
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      "Page returned no meaningful content (likely JS-only SPA or anti-bot challenge).",
    );
  }

  // Step 3: Anthropic call — NO TOOLS, NO web_fetch. Just system +
  // user-message-with-MD -> JSON response.
  let response: { content: Array<AnthropicContentBlock>; stop_reason?: string };
  try {
    response = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
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

  // Step 4: extract and parse the JSON text.
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
        text_preview: text.slice(0, 500),
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      "The model returned no usable JSON.",
    );
  }

  return parsed.data;
}
