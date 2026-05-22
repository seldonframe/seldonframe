// packages/crm/src/lib/landing/r1-payload-generator.ts
//
// Anthropic caller for the R1 landing payload generator.
// Pattern matches markdown-extractor.ts:
//   - AnthropicLike shim for test injection
//   - BYOK key resolution
//   - Model selection via env or hard-coded default
//   - JSON parse + type guard
//   - Non-fatal failure surface (throws, caller catches)
//
// Usage:
//   const payload = await generateR1Payload({ facts, archetype, byokKey });
//   await saveLandingPayload(workspaceId, payload, archetype);

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import {
  buildR1PayloadPrompt,
  type R1LandingPayload,
} from "./r1-payload-prompt";

// Prefer a smaller model for payload generation — the prompt is highly
// structured (JSON schema is fully specified), so Haiku is sufficient
// and much faster/cheaper than Opus.
// Priority: env override → claude-haiku-4-5 → (fallback to that model)
const DEFAULT_MODEL =
  process.env.LANDING_PAYLOAD_MODEL?.trim() || "claude-haiku-4-5";

// The generated payload JSON can be large (6 sections × several fields each).
// 4096 tokens is more than enough for the R1 shape.
const MAX_TOKENS = 4096;

const SYSTEM_PROMPT =
  `You are a JSON-only landing page copy service. ` +
  `You receive business facts and archetype guidelines in the user message. ` +
  `You return exactly one JSON object matching the R1 landing payload schema. ` +
  `You NEVER speak conversationally. You NEVER explain your reasoning. ` +
  `Your entire output is a single valid JSON object and nothing else.`;

// ── AnthropicLike shim (matches markdown-extractor.ts pattern) ───────────────

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

// ── JSON parsing + validation ─────────────────────────────────────────────────

/**
 * Best-effort runtime type guard for R1LandingPayload.
 * Checks for the five required top-level section keys.
 */
function isR1LandingPayload(v: unknown): v is R1LandingPayload {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["hero"] === "object" &&
    obj["hero"] !== null &&
    typeof obj["services"] === "object" &&
    obj["services"] !== null &&
    typeof obj["testimonials"] === "object" &&
    obj["testimonials"] !== null &&
    typeof obj["faq"] === "object" &&
    obj["faq"] !== null &&
    typeof obj["footer"] === "object" &&
    obj["footer"] !== null
  );
}

/**
 * Strip markdown fences if the model wraps the JSON despite instructions.
 * Same defensiveness as extraction-parser.ts.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  // ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate the R1 landing payload for a workspace.
 *
 * @throws Error if the LLM call fails, returns malformed JSON, or signals
 *         generation failure via {"_error": "generation_failed"}.
 *         Caller (run-create-from-url / run-create-from-paste) wraps in
 *         try/catch and logs + continues — workspace creation is not blocked.
 */
export async function generateR1Payload(args: {
  facts: ExtractedBusinessFacts;
  archetype: AestheticArchetypeId;
  byokKey: string;
  /** Test seam — inject a mock Anthropic-compatible client. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<R1LandingPayload> {
  const client = (args.anthropicClient ??
    new Anthropic({ apiKey: args.byokKey })) as AnthropicLike;
  const modelInUse = args.model ?? DEFAULT_MODEL;

  const userMessage = buildR1PayloadPrompt(args.facts, args.archetype);

  let response: { content: Array<AnthropicContentBlock>; stop_reason?: string };
  try {
    response = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "r1_payload_anthropic_error",
        archetype: args.archetype,
        business_name: args.facts.business_name,
        model: modelInUse,
        status: status ?? null,
        message: message.slice(0, 500),
      }),
    );
    throw new Error(
      `r1_payload_generation_failed: Anthropic call failed (${status ?? "unknown"}) — ${message.slice(0, 200)}`,
    );
  }

  const raw = pickText(response.content);
  if (!raw) {
    throw new Error(
      `r1_payload_generation_failed: LLM returned no text content block (stop_reason=${response.stop_reason ?? "?"})`,
    );
  }

  const cleaned = stripFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const preview = cleaned.slice(0, 300);
    console.warn(
      JSON.stringify({
        event: "r1_payload_json_parse_failed",
        archetype: args.archetype,
        business_name: args.facts.business_name,
        preview,
      }),
    );
    throw new Error(
      `r1_payload_generation_failed: JSON parse error. Preview: ${preview}`,
    );
  }

  // Check for the model's explicit failure signal.
  if (
    parsed &&
    typeof parsed === "object" &&
    "_error" in (parsed as Record<string, unknown>)
  ) {
    throw new Error(
      `r1_payload_generation_failed: model signaled _error=${
        (parsed as Record<string, unknown>)["_error"] ?? "unknown"
      }`,
    );
  }

  if (!isR1LandingPayload(parsed)) {
    const preview = JSON.stringify(parsed).slice(0, 300);
    throw new Error(
      `r1_payload_generation_failed: payload missing required sections. Got: ${preview}`,
    );
  }

  return parsed;
}
