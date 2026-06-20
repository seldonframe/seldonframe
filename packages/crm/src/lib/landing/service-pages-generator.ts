// packages/crm/src/lib/landing/service-pages-generator.ts
//
// Second scoped Anthropic call: generate one ServicePage per REAL service.
//
// Design constraints (enforced IN CODE):
//   1. Real-only guarantee — iterate gridServices; skip any that have no LLM
//      match. LLM entries not in the grid are DROPPED (no fabrication).
//   2. Slug = serviceSlug(gridService.name), NEVER the LLM's value.
//   3. Photo failure is non-fatal — heroPhoto is simply omitted.
//   4. Each output page is run through validateSiteTree; invalid pages are
//      dropped rather than surfacing broken data to the route.
//   5. Any parse/LLM failure returns [] gracefully (never throws to caller).
//
// Pattern mirrors generateR1Payload (r1-payload-generator.ts) exactly:
//   - AnthropicLike shim for test injection
//   - pickText + stripFences imported (exported from r1-payload-generator)
//   - model resolution via env var → hard-coded default
//   - JSON parse in try/catch → on failure return []

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import {
  pickText,
  stripFences,
  type AnthropicContentBlock,
} from "./r1-payload-generator";
import {
  serviceSlug,
  validateSiteTree,
  type ServicePage,
  type ServicePageBody,
} from "./r1-site-tree";
import { buildServicePagesPrompt } from "./service-pages-prompt";
import { resolveServicePhoto, type ServicePhoto } from "./service-photo-resolver";

// ── Model selection ──────────────────────────────────────────────────────────

// P4 service pages are a targeted call — Haiku is sufficient.
// Priority: LANDING_SERVICE_PAGES_MODEL → LANDING_PAYLOAD_MODEL → hard-coded default
const DEFAULT_MODEL =
  process.env.LANDING_SERVICE_PAGES_MODEL?.trim() ||
  process.env.LANDING_PAYLOAD_MODEL?.trim() ||
  "claude-haiku-4-5";

const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = "Output JSON only.";

// ── AnthropicLike shim (mirrors r1-payload-generator.ts) ────────────────────

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

// ── Photo resolver DI seam ───────────────────────────────────────────────────

/** Minimal shape callers / tests inject instead of resolveServicePhoto. */
type PhotoResolverFn = (input: {
  realSrc?: string | null;
  realAlt?: string | null;
  serviceName: string;
  vertical: string;
  archetype: AestheticArchetypeId;
  businessName: string;
}) => Promise<ServicePhoto | null>;

// ── Normalise LLM body ───────────────────────────────────────────────────────

/**
 * Coerce the LLM body to a typed ServicePageBody[].
 * Accepts anything — non-conforming entries are dropped silently.
 */
function normalizeBody(raw: unknown): ServicePageBody[] {
  if (!Array.isArray(raw)) return [];
  const out: ServicePageBody[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const kind = obj["kind"];
    const text = obj["text"];
    if (typeof text !== "string" || !text.trim()) continue;
    if (kind === "heading" || kind === "paragraph") {
      out.push({ kind, text: text.trim() });
    }
  }
  return out;
}

// ── Public args type ─────────────────────────────────────────────────────────

export type GenerateServicePagesArgs = {
  /** The REAL grid services — source of truth for which pages to emit. */
  gridServices: { id: string; name: string; description: string }[];
  facts: ExtractedBusinessFacts;
  vertical?: string;
  archetype: AestheticArchetypeId;
  byokKey: string;
  /** Test seam — inject a mock Anthropic-compatible client. */
  anthropicClient?: unknown;
  model?: string;
  /** Test seam — inject a mock photo resolver (skips real Unsplash calls). */
  photoResolver?: PhotoResolverFn;
};

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate one ServicePage per real grid service.
 *
 * Returns [] on any LLM / parse failure — workspace creation is never blocked.
 * Individual invalid pages are also dropped (validateSiteTree guard).
 */
export async function generateServicePages(
  args: GenerateServicePagesArgs,
): Promise<ServicePage[]> {
  const {
    gridServices,
    facts,
    vertical = "",
    archetype,
    byokKey,
    model,
    anthropicClient,
    photoResolver,
  } = args;

  if (!gridServices.length) return [];

  // ── Build user message ────────────────────────────────────────────────────

  // Map facts.testimonials → ServicePagesPromptInput testimonials shape.
  // facts.testimonials has { quote, name?, role?, company?, rating? };
  // the prompt type wants  { quote, name?, city?, rating?, service? }.
  // We map what we have; city/service are optional so omitting is fine.
  const promptTestimonials = (facts.testimonials ?? []).map((t) => ({
    quote: t.quote,
    name: t.name ?? undefined,
    rating: t.rating ?? undefined,
    // city and service are not in ExtractedBusinessFacts testimonial shape
  }));

  const userMessage = buildServicePagesPrompt({
    services: gridServices,
    businessName: facts.business_name,
    vertical,
    city: facts.city,
    testimonials: promptTestimonials,
  });

  // ── LLM call ─────────────────────────────────────────────────────────────

  const client = (anthropicClient ??
    new Anthropic({ apiKey: byokKey })) as AnthropicLike;
  const modelInUse = model ?? DEFAULT_MODEL;

  let rawResponse: { content: Array<AnthropicContentBlock>; stop_reason?: string };
  try {
    rawResponse = await client.messages.create({
      model: modelInUse,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "service_pages_anthropic_error",
        business_name: facts.business_name,
        model: modelInUse,
        message: msg.slice(0, 500),
      }),
    );
    return [];
  }

  // ── Parse ─────────────────────────────────────────────────────────────────

  const rawText = pickText(rawResponse.content);
  if (!rawText) {
    console.warn(
      JSON.stringify({
        event: "service_pages_empty_response",
        business_name: facts.business_name,
        stop_reason: rawResponse.stop_reason ?? "?",
      }),
    );
    return [];
  }

  const cleaned = stripFences(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn(
      JSON.stringify({
        event: "service_pages_json_parse_failed",
        business_name: facts.business_name,
        preview: cleaned.slice(0, 300),
      }),
    );
    return [];
  }

  // Extract the servicePages array from the LLM output.
  const llmPages: unknown[] =
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>)["servicePages"])
      ? ((parsed as Record<string, unknown>)["servicePages"] as unknown[])
      : [];

  // Build a lookup map: lowercase name → llm entry (for O(1) matching).
  const llmByName = new Map<string, Record<string, unknown>>();
  for (const item of llmPages) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj["name"] === "string") {
      llmByName.set(obj["name"].toLowerCase().trim(), obj);
    }
  }

  // ── Build pages — iterate gridServices (REAL order, REAL names) ───────────

  const photoFn: PhotoResolverFn =
    photoResolver ??
    ((input) =>
      resolveServicePhoto({
        ...input,
        archetype,
        businessName: facts.business_name,
      }));

  const out: ServicePage[] = [];

  for (const gridSvc of gridServices) {
    const llmEntry = llmByName.get(gridSvc.name.toLowerCase().trim());
    if (!llmEntry) {
      // No LLM content for this service — skip (keeps count ≤ real, no fabrication).
      continue;
    }

    // Slug is ALWAYS derived from the real grid name, never from LLM output.
    const slug = serviceSlug(gridSvc.name);
    if (!slug) continue; // safety: blank slug would fail validation

    const summary =
      typeof llmEntry["summary"] === "string" && llmEntry["summary"].trim()
        ? llmEntry["summary"].trim()
        : gridSvc.description;

    const body = normalizeBody(llmEntry["body"]);
    // Minimum viable body: at least one paragraph from the grid description.
    const safeBody: ServicePageBody[] =
      body.length > 0
        ? body
        : [{ kind: "paragraph", text: gridSvc.description }];

    const ctaLabel =
      typeof llmEntry["ctaLabel"] === "string" && llmEntry["ctaLabel"].trim()
        ? llmEntry["ctaLabel"].trim()
        : "Get a free estimate";

    // Hero photo — resolve real-first, non-fatal on failure.
    let heroPhoto: ServicePhoto | undefined;
    try {
      const resolved = await photoFn({
        realSrc: undefined,
        realAlt: undefined,
        serviceName: gridSvc.name,
        vertical,
        archetype,
        businessName: facts.business_name,
      });
      if (resolved) heroPhoto = resolved;
    } catch {
      /* photo failure is non-fatal — heroPhoto stays undefined */
    }

    // Map facts.testimonials to the ServicePage testimonial shape.
    // ServicePage.testimonials wants: { id, quote, name, city?, rating?, service? }
    // We synthesise a stable id from the index.
    const serviceTestimonials: ServicePage["testimonials"] = (
      facts.testimonials ?? []
    )
      .filter((t) => t.quote?.trim())
      .map((t, i) => ({
        id: `t${i}`,
        quote: t.quote,
        name: t.name ?? "Customer",
        rating: t.rating ?? undefined,
        // city and service are not present in the facts shape
      }));

    const page: ServicePage = {
      slug,
      name: gridSvc.name,
      summary,
      body: safeBody,
      ctaLabel,
      ...(heroPhoto ? { heroPhoto } : {}),
      ...(serviceTestimonials.length > 0
        ? { testimonials: serviceTestimonials }
        : {}),
    };

    // Final validation guard — drop structurally invalid pages.
    const validation = validateSiteTree({ servicePages: [page] });
    if (validation.valid) {
      out.push(page);
    } else {
      console.warn(
        JSON.stringify({
          event: "service_pages_page_invalid",
          slug,
          errors: validation.errors,
        }),
      );
    }
  }

  return out;
}
