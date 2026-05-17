// packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts
// Wraps Anthropic SDK messages.create with the web_fetch server tool enabled.
// Returns the parsed business facts, or throws WebFetchError with a typed reason.
//
// 2026-05-16 fix — every smoke-test URL was returning extraction_failed.
// Root causes (per https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool):
//   1. Tool spec was missing the REQUIRED `name: "web_fetch"` field. The
//      Anthropic API silently 400'd and we masked it as extraction_failed.
//   2. Sent an unnecessary `anthropic-beta: web-fetch-2025-09-10` header.
//      web_fetch is GA, no beta header required, and the wrong value may
//      have contributed to silent failures.
//   3. Default model was claude-sonnet-4-20250514 — a stale snapshot from
//      the original Sonnet 4 release. Updated to claude-sonnet-4-5-20250929
//      (current GA Sonnet, used elsewhere in the agent runtime).
//   4. When Anthropic returns 200 with an inline web_fetch_tool_error
//      (url_not_accessible, too_many_requests, etc.), we missed the error
//      block and fell through to "no usable JSON". Now we scan for it.
//   5. Zero observability — every failure was a black box. Now we log
//      the full Anthropic error + the inline tool error code + the
//      response shape so the next failure is diagnosable in Vercel logs.

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

// Default model: claude-opus-4-7 — Anthropic's current best-in-class
// reasoning model (highest extraction accuracy on the messy real-world
// agency websites this pipeline ingests). Justifies the higher per-token
// cost ($15/$75 vs Sonnet's $3/$15 per MTok) because:
//   1. Operator only pays this once per workspace creation (~$0.05-0.15 on
//      Opus vs ~$0.01-0.03 on Sonnet — both negligible for a paid agency).
//   2. Extraction quality compounds: better signal → better soul → better
//      chatbot answers → better client demo.
//   3. The whole pipeline downstream assumes the structured fields are
//      accurate. A worse extractor poisons every downstream artifact.
//
// THIN HARNESS + ANTIFRAGILE TO LLM IMPROVEMENTS:
// This module is intentionally a ~80-line wrapper. When Anthropic ships
// Opus 4.8 / Opus 5 / a new GA Sonnet, flip the env var and ship — no
// code changes. To swap providers entirely (e.g. add OpenAI GPT-5 with
// function-calling + a server-side fetch instead of web_fetch), the
// surface area to change is this single file + the byok-resolver. The
// EXTRACTION_INSTRUCTIONS prompt is the "skill" — improvements there
// help every model.
//
// Override priority (highest to lowest):
//   1. params.model (caller passes per-call — used for tests + A/B)
//   2. process.env.WEB_ONBOARDING_MODEL (deployment-level override)
//   3. claude-opus-4-7 (default — kept current via this comment block)
const DEFAULT_MODEL =
  process.env.WEB_ONBOARDING_MODEL?.trim() || "claude-opus-4-7";
const MAX_TOKENS = 4096;
// Tool spec per official docs — `type` AND `name` are both required.
const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910";
const WEB_FETCH_TOOL_NAME = "web_fetch";

type AnthropicContentBlock = {
  type: string;
  text?: string;
  // Server tool result block — Anthropic returns the fetch result inline.
  // When the fetch fails, the inner content has type "web_fetch_tool_error"
  // with an error_code field.
  content?: {
    type?: string;
    error_code?: string;
    [key: string]: unknown;
  };
};

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
 * Scan the response for an embedded web_fetch_tool_error block. Anthropic
 * returns 200 with the error inline when the fetch itself fails
 * (url_not_accessible, unsupported_content_type, too_many_requests,
 * url_not_allowed, etc.). Surfacing the specific error_code is the
 * fastest path to diagnosing why a given URL failed (vs. lumping all
 * into extraction_failed).
 */
function findWebFetchToolError(
  content: Array<AnthropicContentBlock>,
): string | null {
  for (const block of content) {
    if (
      block.type === "web_fetch_tool_result" &&
      block.content?.type === "web_fetch_tool_error"
    ) {
      return block.content.error_code ?? "unknown_web_fetch_error";
    }
  }
  return null;
}

export async function extractBusinessFactsFromUrl(params: {
  url: string;
  byokKey: string;
  /** Optional injection point for tests. Production path constructs a real Anthropic client. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<ExtractedBusinessFacts> {
  const client = (params.anthropicClient ?? new Anthropic({ apiKey: params.byokKey })) as AnthropicLike;
  const modelInUse = params.model || DEFAULT_MODEL;

  let response: { content: Array<AnthropicContentBlock>; stop_reason?: string };
  try {
    response = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      // Tool spec MUST include both `type` and `name` per the Anthropic docs.
      // Omitting `name` causes the API to 400 silently from our perspective.
      tools: [{ type: WEB_FETCH_TOOL_TYPE, name: WEB_FETCH_TOOL_NAME }],
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_INSTRUCTIONS}\n\nURL to extract: ${params.url}`,
        },
      ],
    });
  } catch (err: unknown) {
    // Log the full error payload so the next failure isn't a black box.
    // NEVER log the BYOK key.
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "web_fetch_extractor_anthropic_error",
        url: params.url,
        model: modelInUse,
        status: status ?? null,
        message: message.slice(0, 500),
      }),
    );
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

  // Inline web_fetch_tool_error check — Anthropic returns 200 with the
  // error in the response body when the fetch itself fails.
  const toolError = findWebFetchToolError(response.content);
  if (toolError) {
    console.warn(
      JSON.stringify({
        event: "web_fetch_extractor_tool_error",
        url: params.url,
        model: modelInUse,
        error_code: toolError,
        stop_reason: response.stop_reason ?? null,
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      `Anthropic web_fetch failed for ${params.url}: ${toolError}`,
    );
  }

  const text = pickText(response.content);

  // If there's no text block at all, the response is malformed.
  if (!text) {
    console.warn(
      JSON.stringify({
        event: "web_fetch_extractor_empty_text",
        url: params.url,
        model: modelInUse,
        stop_reason: response.stop_reason ?? null,
        content_types: response.content.map((b) => b.type),
      }),
    );
    throw new WebFetchError(
      "extraction_failed",
      "Anthropic returned no text content block.",
    );
  }

  const parsed = parseExtraction(text);
  if (!parsed.ok) {
    // Log the first 500 chars of the model output so we can see if it's
    // malformed JSON, missing required keys, or just plain prose.
    console.warn(
      JSON.stringify({
        event: "web_fetch_extractor_parse_failed",
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
