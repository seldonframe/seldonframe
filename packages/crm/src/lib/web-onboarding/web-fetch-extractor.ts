// packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts
// Wraps Anthropic SDK messages.create with the web_fetch server tool enabled.
// Returns the parsed business facts, or throws WebFetchError with a typed reason.
//
// Spec §"Extraction call" — we pass tools: [{ type: "web_fetch_20250910" }] and
// the beta header "web-fetch-2025-09-10". Anthropic fetches the pages server-side
// and returns the model's text turn containing the JSON extraction.

import Anthropic from "@anthropic-ai/sdk";

import {
  EXTRACTION_INSTRUCTIONS,
  type ExtractedBusinessFacts,
} from "./extraction-prompt";
import { parseExtraction } from "./extraction-parser";

export type WebFetchErrorReason =
  | "extraction_failed"
  | "credits_exhausted"
  | "anthropic_unauthorized"
  | "internal_error";

export class WebFetchError extends Error {
  constructor(public reason: WebFetchErrorReason, message: string, public cause?: unknown) {
    super(message);
    this.name = "WebFetchError";
  }
}

const DEFAULT_MODEL = process.env.WEB_ONBOARDING_MODEL?.trim() || "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910";
const WEB_FETCH_BETA_HEADER = "web-fetch-2025-09-10";

type AnthropicLike = {
  messages: {
    create: (params: Record<string, unknown>, opts?: { headers?: Record<string, string> }) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};

function pickText(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

export async function extractBusinessFactsFromUrl(params: {
  url: string;
  byokKey: string;
  /** Optional injection point for tests. Production path constructs a real Anthropic client. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<ExtractedBusinessFacts> {
  const client = (params.anthropicClient ?? new Anthropic({ apiKey: params.byokKey })) as AnthropicLike;

  let response: { content: Array<{ type: string; text?: string }> };
  try {
    response = await client.messages.create(
      {
        model: params.model || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        tools: [{ type: WEB_FETCH_TOOL_TYPE }],
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_INSTRUCTIONS}\n\nURL to extract: ${params.url}`,
          },
        ],
      },
      { headers: { "anthropic-beta": WEB_FETCH_BETA_HEADER } }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
      throw new WebFetchError("anthropic_unauthorized", "Anthropic rejected the BYOK key.", err);
    }
    if (status === 402 || status === 429) {
      throw new WebFetchError(
        "credits_exhausted",
        "BYOK Anthropic key has no remaining credits.",
        err
      );
    }
    throw new WebFetchError(
      "internal_error",
      err instanceof Error ? err.message : "Anthropic SDK call failed.",
      err
    );
  }

  const text = pickText(response.content);
  const parsed = parseExtraction(text);
  if (!parsed.ok) {
    throw new WebFetchError("extraction_failed", "The model returned no usable JSON.");
  }

  return parsed.data;
}
