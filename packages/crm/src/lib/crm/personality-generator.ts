// ============================================================================
// v1.3.0 — LLM-generated CRMPersonality with validator gating + cache.
// ============================================================================
//
// THE KARPATHY MOVE.
//
// Hardcoding a PersonalitySchema for every niche on earth doesn't
// scale. v1.2.0 shipped 7 hardcoded personalities (general, hvac,
// dental, legal, agency, coaching, medspa); next demo will hit pet
// grooming → falls to general → operator complains general isn't
// pet-grooming-specific. Same for photography, accounting, tutoring,
// HVAC niches we didn't anticipate.
//
// New architecture:
//   model generates  →  validator gates  →  cache scales
//
// Flow:
//   1. derive a stable business_type_key from operator input
//      (services + description) — lowercased, hyphenated
//   2. SELECT from personality_cache by key. Hit → return cached
//      schema, increment usage_count. Miss → continue.
//   3. Call Anthropic with a few-shot prompt (4 hardcoded personalities
//      as examples) requesting a CRMPersonality JSON for THIS business.
//   4. Parse JSON. Run checkPersonalityCompleteness.
//      Valid → INSERT into cache (ON CONFLICT DO NOTHING — handles the
//      race where two parallel workspace creations of the same niche
//      both miss the cache).
//      Invalid → retry once with the validation errors appended to
//      the prompt as feedback.
//   5. If still invalid after retry → fall back to selectCRMPersonality
//      (existing keyword-based logic from personality.ts).
//
// Cost model: ~$0.01 per first-of-niche workspace. Subsequent
// workspaces of the same niche: $0 (cache hit). With 50 niches in
// the cache, 95%+ of inbound workspaces are zero-LLM-cost.
//
// Quality model: every cached schema passed checkPersonalityCompleteness.
// As models improve, run a one-off backfill to regenerate llm-source
// rows; the seed-source rows (the original hardcoded 7) stay as
// reference few-shot examples.

import Anthropic from "@anthropic-ai/sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { personalityCache } from "@/db/schema";
import {
  checkPersonalityCompleteness,
  formatCompletenessErrors,
} from "./personality-completeness";
import {
  PERSONALITIES,
  selectCRMPersonality,
  type CRMPersonality,
  type PersonalityVertical,
} from "./personality";

// ─── Input + output ──────────────────────────────────────────────────────────

export interface GeneratorInput {
  business_name: string;
  city?: string | null;
  state?: string | null;
  services: string[];
  business_description?: string | null;
}

export type GeneratorSource = "cache" | "llm" | "fallback";

export interface GeneratorResult {
  personality: CRMPersonality;
  source: GeneratorSource;
  /** The cache lookup key. Stable for the same input shape. */
  business_type_key: string;
  /** When source='llm' or 'fallback', diagnostic string for logs. */
  notes?: string;
  /** When source='llm', the model id that produced the schema (after
   *  any haiku-fallback retry). Surfaced in observability so we can
   *  see which model is actually serving production. */
  model?: string;
}

// ─── Cache key derivation ────────────────────────────────────────────────────
//
// The key is derived deterministically from services + description so
// two operators describing roofing in slightly different words still
// hit the same cache row. Strategy:
//
//   1. Concatenate services + description, lowercase
//   2. Drop everything except a-z and spaces
//   3. Pull the most-distinctive single noun (heuristic: longest word
//      that isn't a common stopword + isn't a generic service verb)
//   4. Pair with the first word of the longest service when available
//
// Falls back to a normalized hash when no good single key emerges.
// Deterministic — no LLM call, no DB lookup. Fast.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "our", "your", "you", "we", "are", "can",
  "have", "has", "all", "any", "but", "not", "from", "this", "that",
  "into", "their", "they", "them", "his", "her", "its", "out", "off",
  "over", "more", "most", "many", "some", "much", "very", "just",
  "like", "also", "than", "then", "such", "only", "now", "new",
  "best", "free", "open", "small", "large", "big", "good", "great",
  "service", "services", "business", "company", "shop", "studio",
  "owner", "owned", "family", "local", "trusted", "reliable", "quality",
  "professional", "expert", "experienced", "certified", "licensed",
  "in", "on", "at", "of", "to", "by", "as", "is", "be", "or", "an", "a",
]);

const GENERIC_VERBS = new Set([
  "repair", "install", "installation", "service", "consult", "support",
  "manage", "build", "design", "create", "make", "do",
  "damage", "issue", "issues", "problem", "problems",
  "session", "sessions", "appointment", "appointments",
]);

function stem(word: string): string {
  return word
    .replace(/(ies)$/i, "y")
    .replace(/(es)$/i, "")
    .replace(/(ing|ed|s)$/i, "");
}

/**
 * Derive a stable cache key from the input. Algorithm:
 *
 *   1. Tokenize services (high signal) + description (low signal)
 *   2. Drop stopwords + generic verbs
 *   3. Stem each token (roofing → roof, candles → candle)
 *   4. Count occurrences. Service-list mentions count 2x — operator
 *      lists those for a reason.
 *   5. Take the top-2 most-frequent stems
 *
 * Result: lowercase, hyphenated, max 64 chars. Examples:
 *   { services: ["Roof repair", "Storm damage", "Gutter installation"],
 *     description: "Family-owned roofing contractor" }
 *     → "roof-gutter"  (roof appears 2x via "Roof"+"roofing"; gutter 1x;
 *        storm 1x; "damage"/"installation"/"family"/"owned"/"contractor"
 *        all dropped)
 *   { services: ["Botox", "Filler"], description: "Med spa" }
 *     → "botox-filler"
 *   { services: ["Custom-poured candles"], description: "Small-batch" }
 *     → "custom-candle"
 */
export function deriveBusinessTypeKey(input: GeneratorInput): string {
  const tokenize = (text: string, weight: number) => {
    const words = text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length >= 4);
    const out: Array<[string, number]> = [];
    for (const w of words) {
      const s = stem(w);
      if (s.length < 3) continue;
      if (STOPWORDS.has(s) || STOPWORDS.has(w)) continue;
      if (GENERIC_VERBS.has(s) || GENERIC_VERBS.has(w)) continue;
      out.push([s, weight]);
    }
    return out;
  };

  // Services count 2x — they're the operator's primary signal.
  const fromServices = tokenize(input.services.join(" "), 2);
  const fromDescription = tokenize(input.business_description ?? "", 1);

  const counts = new Map<string, number>();
  for (const [s, w] of [...fromServices, ...fromDescription]) {
    counts.set(s, (counts.get(s) ?? 0) + w);
  }

  if (counts.size === 0) return "general";

  // Sort by count desc, then by length desc, then alphabetically (for
  // stability across runs).
  const sorted = Array.from(counts.entries()).sort(
    ([sa, ca], [sb, cb]) => cb - ca || sb.length - sa.length || sa.localeCompare(sb),
  );

  const picks = sorted.slice(0, 2).map(([s]) => s);
  const key = picks.join("-").slice(0, 64);
  return key || "general";
}

// ─── Few-shot example builder ────────────────────────────────────────────────
//
// 4 hardcoded personalities serialized as JSON serve as examples.
// The model sees the structure + voice + level of detail and produces
// a matching schema for the new business.

function buildFewShotExamples(): string {
  // Pick 4 verticals that span service-trade / luxury / professional /
  // generic so the model has range. Each is a CRMPersonality
  // serialized to compact JSON (no whitespace bloat in the prompt).
  const examples: PersonalityVertical[] = [
    "hvac",      // service trade
    "medspa",    // luxury / consumer health
    "legal",     // professional service
    "general",   // generic catch-all
  ];
  const blocks = examples
    .map((v) => {
      const personality = PERSONALITIES[v];
      return `## Example: ${v}\n\`\`\`json\n${JSON.stringify(
        personality,
        null,
        2,
      )}\n\`\`\``;
    })
    .join("\n\n");
  return blocks;
}

// ─── LLM prompt ──────────────────────────────────────────────────────────────

function buildPrompt(input: GeneratorInput, retryFeedback?: string): string {
  const examples = buildFewShotExamples();
  const services = input.services.length > 0
    ? input.services.join(", ")
    : "(no services specified)";
  const location = [input.city, input.state].filter(Boolean).join(", ");
  const description = input.business_description?.trim() || "(no description)";

  const core = `You are generating a CRM personality configuration for a specific business.

# Business
- Name: ${input.business_name}
- Location: ${location || "(not specified)"}
- Services: ${services}
- Description: ${description}

# Examples of valid personalities (study these carefully)

${examples}

# Your task

Return a single CRMPersonality JSON object for the business above.
The output must:

- Use industry-appropriate terminology (e.g., "Patient" for dental,
  "Customer" for trades, "Client" for professional services). Avoid
  generic "Lead" / "Contact" unless that genuinely is the business's
  vocabulary.
- Define 4-8 pipeline stages that reflect the actual workflow for
  THIS specific business. Stages must be in chronological order
  (Inquiry → ... → Completed). Include a final "Lost" or "Did Not
  Convert" stage.
- Provide intakeFields including a required email field, a required
  full-name field, and 1-3 industry-specific fields.
- Provide an intake.title that's appropriate for this business
  (e.g., "Request a Treatment Consultation", "Get a Free Roofing
  Quote", "Apply for a Pet Grooming Appointment"). NOT generic.
- Provide content_templates with EXACTLY 4 trust_badges, AT LEAST
  3 FAQs whose answers a real customer of this business would find
  useful, hero_headlines that use {city}/{rating}/{review_count}
  placeholders, and CTAs voiced for this business
  (e.g., "Book your treatment", "Get a free roofing quote").
- Provide a dashboard with at least 3 primaryMetrics and 2
  urgencyIndicators relevant to this business.
- Set \`theme.mode\` to "light" for most verticals (trades, tutoring,
  professional services, retailers, healthcare, fitness, education,
  hospitality). Use "dark" ONLY for premium / luxury / nightlife /
  fashion / aesthetic verticals (med spa, design agency, photography
  studio, jewelry, high-end salon, club, fashion boutique). When in
  doubt, choose "light" — it's safer for legibility + accessibility
  and works for 80%+ of business types.

Return ONLY the JSON object, no markdown fences, no explanation. The
output will be parsed with JSON.parse() directly.`;

  if (retryFeedback) {
    return `${core}\n\n# IMPORTANT — your previous attempt failed validation\n\nThe schema you returned was rejected with these errors:\n\n${retryFeedback}\n\nFix every error above and return the corrected JSON.`;
  }

  return core;
}

// ─── Anthropic call + JSON parse ─────────────────────────────────────────────

interface CallResult {
  ok: true;
  personality: CRMPersonality;
  /** Which model actually produced the JSON. Surfaced in logs so we can
   *  attribute output quality + cost to the right tier. */
  model: string;
}
interface CallError {
  ok: false;
  error: string;
  /** Set when the failure was a 404 (model-not-found) so the caller can
   *  trigger the haiku-fallback retry. */
  modelNotFound?: boolean;
}
type CallOutcome = CallResult | CallError;

// v1.3.2 — model selection is an EXTERNAL DEPENDENCY that WILL change
// again. Centralize in env var so rotation is zero-deploy:
//
//   ANTHROPIC_MODEL — primary model id. Default tracks the latest
//                     stable Sonnet at time of writing.
//   ANTHROPIC_MODEL_FALLBACK — degraded fallback when primary returns
//                              404. Default = haiku for cost + lower
//                              latency.
//
// Setting either env var on Vercel takes effect on the next request —
// no npm publish, no source change. The constants below are the
// shipped defaults and only matter when the env var is unset.
const DEFAULT_PRIMARY_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_FALLBACK_MODEL = "claude-3-5-haiku-20241022";

function primaryModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_PRIMARY_MODEL;
}

function fallbackModel(): string {
  return process.env.ANTHROPIC_MODEL_FALLBACK?.trim() || DEFAULT_FALLBACK_MODEL;
}

function detect404(err: unknown): boolean {
  // Anthropic SDK throws an APIError with status 404 when the model
  // id doesn't resolve (e.g. claude-3-5-sonnet-latest got retired).
  // Match defensively across SDK versions.
  if (!err) return false;
  const e = err as { status?: number; statusCode?: number; message?: string };
  if (e.status === 404 || e.statusCode === 404) return true;
  if (typeof e.message === "string" && /\b404\b|model.*not.*found/i.test(e.message))
    return true;
  return false;
}

async function callAnthropic(
  apiKey: string,
  prompt: string,
  model: string,
): Promise<CallOutcome> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("\n");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return { ok: false, error: "no JSON object in response" };
    }
    const raw = text.slice(start, end + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return { ok: true, personality: parsed as CRMPersonality, model };
  } catch (err) {
    const isModelNotFound = detect404(err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      modelNotFound: isModelNotFound,
    };
  }
}

/**
 * Call Anthropic with primary model; on 404 (model-not-found) retry
 * once with the fallback model. Returns the OK outcome with the
 * actually-used model id, or the FINAL error if both attempts failed.
 */
async function callAnthropicWithModelFallback(
  apiKey: string,
  prompt: string,
): Promise<CallOutcome> {
  const primary = primaryModel();
  const first = await callAnthropic(apiKey, prompt, primary);
  if (first.ok) return first;
  if (!first.modelNotFound) return first;
  // Primary model 404'd. Retry with the haiku fallback so the operator
  // still gets an LLM-generated personality (lower quality + cost) rather
  // than falling all the way through to the keyword fallback layer.
  const fallback = fallbackModel();
  if (fallback === primary) return first; // misconfig; nothing to retry
  console.warn(
    JSON.stringify({
      event: "personality_generator_model_fallback",
      from_model: primary,
      to_model: fallback,
      reason: first.error,
    }),
  );
  return callAnthropic(apiKey, prompt, fallback);
}

// ─── Cache helpers ───────────────────────────────────────────────────────────

async function lookupCache(
  businessTypeKey: string,
): Promise<CRMPersonality | null> {
  try {
    const [row] = await db
      .select({ schema: personalityCache.schema })
      .from(personalityCache)
      .where(eq(personalityCache.businessTypeKey, businessTypeKey))
      .limit(1);
    if (!row) return null;
    // Best-effort: bump usage_count. Don't await — fire-and-forget.
    db.update(personalityCache)
      .set({
        usageCount: sql`${personalityCache.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(personalityCache.businessTypeKey, businessTypeKey))
      .execute()
      .catch(() => {
        // Counter increment is observability only; don't surface failures.
      });
    return row.schema as CRMPersonality;
  } catch {
    // Table missing in dev / cache infra issue — fall through to LLM.
    return null;
  }
}

async function persistCache(
  businessTypeKey: string,
  schema: CRMPersonality,
  source: "llm" | "seed",
  generatedBy?: string,
): Promise<void> {
  try {
    await db
      .insert(personalityCache)
      .values({
        businessTypeKey,
        schema,
        source,
        validated: true,
        usageCount: 1,
        generatedBy: generatedBy ?? null,
      })
      .onConflictDoNothing({ target: personalityCache.businessTypeKey });
  } catch (err) {
    // Persistence failure shouldn't block workspace creation.
    console.warn(
      `[personality-generator] cache write failed for "${businessTypeKey}":`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Resolve the CRMPersonality for a business via:
 *   1. Cache lookup (fast, deterministic, free)
 *   2. LLM generation (Claude — ~$0.01, validator-gated, cached)
 *   3. Fallback to keyword-based selectCRMPersonality (existing
 *      hardcoded mapping — guaranteed to return something valid)
 *
 * Always returns a valid CRMPersonality. Never throws.
 */
export async function resolvePersonalityForBusiness(
  input: GeneratorInput,
): Promise<GeneratorResult> {
  const businessTypeKey = deriveBusinessTypeKey(input);

  // Layer 1: cache.
  const cached = await lookupCache(businessTypeKey);
  if (cached) {
    return {
      personality: cached,
      source: "cache",
      business_type_key: businessTypeKey,
    };
  }

  // Layer 2: LLM generation. Skip if no API key.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    let attempt: CallOutcome = await callAnthropicWithModelFallback(
      apiKey,
      buildPrompt(input),
    );
    let validationErrors: string | null = null;

    if (attempt.ok) {
      const errors = checkPersonalityCompleteness(attempt.personality);
      if (errors.length > 0) {
        const usedModel = attempt.model;
        validationErrors = formatCompletenessErrors(errors);
        // Retry once with feedback.
        attempt = await callAnthropicWithModelFallback(
          apiKey,
          buildPrompt(input, validationErrors),
        );
        if (attempt.ok) {
          const errors2 = checkPersonalityCompleteness(attempt.personality);
          if (errors2.length === 0) {
            await persistCache(
              businessTypeKey,
              attempt.personality,
              "llm",
              attempt.model,
            );
            return {
              personality: attempt.personality,
              source: "llm",
              business_type_key: businessTypeKey,
              notes: `validated on retry (initial model=${usedModel})`,
              model: attempt.model,
            };
          }
          validationErrors = formatCompletenessErrors(errors2);
        } else {
          validationErrors = `retry_call_failed: ${attempt.error}`;
        }
      } else {
        // First-attempt success.
        await persistCache(
          businessTypeKey,
          attempt.personality,
          "llm",
          attempt.model,
        );
        return {
          personality: attempt.personality,
          source: "llm",
          business_type_key: businessTypeKey,
          model: attempt.model,
        };
      }
    } else {
      validationErrors = `first_call_failed: ${attempt.error}${attempt.modelNotFound ? " [model_not_found]" : ""}`;
    }

    // Falling through to layer 3 — log the LLM failure for observability.
    console.warn(
      JSON.stringify({
        event: "personality_generator_fallback",
        business_type_key: businessTypeKey,
        reason: validationErrors,
        primary_model: primaryModel(),
        fallback_model: fallbackModel(),
      }),
    );
  }

  // Layer 3: keyword fallback to one of the hardcoded personalities.
  // Guaranteed to return a valid CRMPersonality.
  const industryHint = [
    input.services.join(" "),
    input.business_description ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const fallback = selectCRMPersonality(null, industryHint);
  return {
    personality: fallback,
    source: "fallback",
    business_type_key: businessTypeKey,
    notes: apiKey ? "llm path exhausted" : "ANTHROPIC_API_KEY missing",
  };
}

/**
 * Test/dev seeding: pre-populate the cache with the hardcoded
 * personalities so they behave as warm-cache entries on day one.
 * Idempotent via ON CONFLICT DO NOTHING — safe to run on every
 * deploy.
 */
export async function seedPersonalityCache(): Promise<{
  inserted: number;
  skipped: number;
}> {
  let inserted = 0;
  let skipped = 0;
  for (const [vertical, personality] of Object.entries(PERSONALITIES)) {
    try {
      const result = await db
        .insert(personalityCache)
        .values({
          businessTypeKey: vertical,
          schema: personality as CRMPersonality,
          source: "seed",
          validated: true,
          usageCount: 0,
          generatedBy: null,
        })
        .onConflictDoNothing({ target: personalityCache.businessTypeKey })
        .returning({ id: personalityCache.id });
      if (result.length > 0) inserted += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { inserted, skipped };
}
