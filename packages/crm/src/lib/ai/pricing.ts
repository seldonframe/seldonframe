// LLM pricing constants + cost calculator.
// SLICE 9 PR 2 C4 per Max's PR 2 spec (cost observability folded).
//
// Pricing source: Anthropic public pricing as of 2026-04-25.
// Verify + update if Anthropic adjusts before launch.
//
// Conventions:
//   - Token prices stated per 1M tokens (Anthropic's published unit)
//   - Costs returned as `number` USD; persisted to workflow_runs as
//     decimal(10,4) — 4 fractional digits = $0.0001 precision, plenty
//     for per-run aggregates ($0-$10 typical range)
//
// If multi-LLM-provider support arrives later, extend the PRICING
// table with new model ids; the resolver normalizes by exact model
// string. Unknown models default to the most-conservative published
// price (Claude Opus rates) — better to over-estimate than silently
// drop cost data.

export type LlmPricing = {
  inputPerMTok: number;   // USD per 1M input tokens
  outputPerMTok: number;  // USD per 1M output tokens
};

export const PRICING: Record<string, LlmPricing> = {
  // Claude Opus 4.x — flagship reasoning model
  "claude-opus-4-7":  { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-6":  { inputPerMTok: 15, outputPerMTok: 75 },
  // Claude Sonnet 4.x — balanced cost/capability
  "claude-sonnet-4-6": { inputPerMTok: 3,  outputPerMTok: 15 },
  // Claude Haiku 4.x — cheapest tier
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

const FALLBACK_PRICING: LlmPricing = { inputPerMTok: 15, outputPerMTok: 75 };

export function getPricingForModel(model: string): LlmPricing {
  return PRICING[model] ?? FALLBACK_PRICING;
}

/**
 * Cost in USD for a single LLM call.
 * Returns 0 when both token counts are 0 or undefined.
 */
export function computeCallCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    (inputTokens <= 0 && outputTokens <= 0)
  ) {
    return 0;
  }
  const pricing = getPricingForModel(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  // Round to 4 decimals to match the persisted column precision.
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}
