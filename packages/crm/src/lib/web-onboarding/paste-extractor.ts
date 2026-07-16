// packages/crm/src/lib/web-onboarding/paste-extractor.ts
//
// Phase Q — "no website" paste path.
//
// Design note: markdown-extractor.ts's extractBusinessFactsFromUrl wraps
// the Firecrawl pipeline (scrape URL → markdown → LLM). We can't reuse
// it here because there is no URL to scrape — the operator has already
// pasted the content. Instead we reproduce the LLM layer directly:
// wrap the pasted text in a Markdown envelope, call Anthropic with the
// same EXTRACTION_INSTRUCTIONS_MD prompt, and hand the result to the
// same parseExtraction parser. Same JSON output shape, same downstream
// pipeline — zero schema change needed.

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_INSTRUCTIONS_MD, type ExtractedBusinessFacts } from "./extraction-prompt";
import { parseExtraction } from "./extraction-parser";
import { mapAnthropicSdkError } from "./anthropic-error-map";
import { WebFetchError } from "./web-fetch-extractor";

// Mirrors the AnthropicLike shim used in markdown-extractor.ts — narrows the
// SDK's full Message return type to only the fields we use, avoiding the
// `StopReason | null` vs `string | undefined` incompatibility.
type AnthropicLike = {
  messages: {
    create: (
      params: Record<string, unknown>,
    ) => Promise<{
      content: Array<AnthropicContentBlock>;
      stop_reason?: string | null;
    }>;
  };
};

// Same model / token defaults as markdown-extractor.ts so both paths
// benefit from the same env override.
const DEFAULT_MODEL =
  process.env.WEB_ONBOARDING_MODEL?.trim() || "claude-opus-4-7";

const MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You are a JSON-only business-fact extraction service. You receive business information as Markdown in the user message and return exactly one JSON object describing the business. You NEVER speak conversationally. You NEVER explain your reasoning. You NEVER preface your response. Your output is consumed by a parser that requires exactly one valid JSON object as the entire response.`;

type AnthropicContentBlock = { type: string; text?: string };

function pickText(content: Array<AnthropicContentBlock>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

/**
 * Extract business facts from operator-pasted text (Google Maps snippet,
 * Business Profile dump, free-form notes, etc.).
 *
 * Wraps the text in a Markdown envelope so the same EXTRACTION_INSTRUCTIONS_MD
 * prompt processes it identically to a Firecrawl-scraped website page.
 *
 * The LLM is smart enough to separate business facts from customer
 * reviews, testimonials, and operator notes — no schema change needed.
 */
export async function extractBusinessFactsFromPaste(args: {
  pastedText: string;
  byokKey: string;
}): Promise<ExtractedBusinessFacts> {
  // Wrap pasted text as a Markdown blob. The preamble tells the model
  // what the source is so it can apply appropriate extraction heuristics
  // (e.g., distinguish business facts from reviews).
  const md = [
    "# Operator-pasted business profile",
    "",
    "The operator pasted the following content. It may contain a mix of",
    "business profile data (name, address, hours, services), customer",
    "reviews/testimonials, and free-form notes about how they want the",
    "workspace built. Extract facts only; ignore opinions.",
    "",
    args.pastedText.trim(),
  ].join("\n");

  const client = new Anthropic({ apiKey: args.byokKey }) as unknown as AnthropicLike;
  const modelInUse = DEFAULT_MODEL;

  let response: { content: Array<AnthropicContentBlock>; stop_reason?: string | null };
  try {
    response = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_INSTRUCTIONS_MD}\n\nSource: paste://operator-input\n\nPage content (Markdown):\n${md}`,
        },
      ],
    });
  } catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "paste_extractor_anthropic_error",
        model: modelInUse,
        status: status ?? null,
        message: message.slice(0, 500),
      }),
    );
    throw mapAnthropicSdkError(err);
  }

  const text = pickText(response.content);
  if (!text) {
    console.warn(
      JSON.stringify({
        event: "paste_extractor_empty_text",
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
        event: "paste_extractor_parse_failed",
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
