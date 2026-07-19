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
  inferVertical,
  type R1LandingPayload,
} from "./r1-payload-prompt";
import {
  resolveServicePhoto,
  type ServicePhoto,
} from "./service-photo-resolver";
import { resolveExternalMedia } from "@/lib/media/resolve-url";

// Prefer a smaller model for payload generation — the prompt is highly
// structured (JSON schema is fully specified), so Haiku is sufficient
// and much faster/cheaper than Opus.
// Priority: env override → claude-haiku-4-5 → (fallback to that model)
const DEFAULT_MODEL =
  process.env.LANDING_PAYLOAD_MODEL?.trim() || "claude-haiku-4-5";

// The generated payload JSON can be large (6 sections × several fields each).
// 4096 tokens is more than enough for the R1 shape.
const MAX_TOKENS = 4096;

// The Unsplash photo id the prompt hardcodes as the no-extracted-photo hero
// fallback (see r1-payload-prompt.ts). Every trades workspace without a
// scrapeable hero photo lands on this exact image, so we detect it and swap in
// a vertical/archetype-relevant one in the hero post-process below.
const GENERIC_HERO_PHOTO_ID = "photo-1581094794329";

const SYSTEM_PROMPT =
  `You are a JSON-only landing page copy service. ` +
  `You receive business facts and archetype guidelines in the user message. ` +
  `You return exactly one JSON object matching the R1 landing payload schema. ` +
  `You NEVER speak conversationally. You NEVER explain your reasoning. ` +
  `Your entire output is a single valid JSON object and nothing else.`;

// ── AnthropicLike shim (matches markdown-extractor.ts pattern) ───────────────

export type AnthropicContentBlock = { type: string; text?: string };

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

export function pickText(content: Array<AnthropicContentBlock>): string {
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
export function stripFences(text: string): string {
  const trimmed = text.trim();
  // ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

// ── Service photo post-process ────────────────────────────────────────────────

/**
 * Injectable function signature matching resolveServicePhoto.
 * Tests pass a fake to avoid Unsplash network calls.
 */
export type ResolveServicePhotoFn = (input: {
  realSrc?: string | null;
  realAlt?: string | null;
  serviceName: string;
  vertical: string;
  archetype: AestheticArchetypeId;
  businessName: string;
}) => Promise<ServicePhoto | null>;

/**
 * Pick the best real hero photo the pipeline captured from the source site.
 * og:image + hero-classified images are merged into facts.photos FIRST (see
 * markdown-extractor.ts / html-image-harvester.ts), so the first usable one is
 * the intended hero. Returns null when the site had no scrapeable photo.
 */
export function pickHeroPhotoFromFacts(
  facts: ExtractedBusinessFacts,
): { src: string; alt: string } | null {
  const photos = Array.isArray(facts.photos) ? facts.photos : [];
  const usable = (src: string): boolean =>
    /^https?:\/\//i.test(src) && !/\.svg(?:[?#]|$)/i.test(src);
  const hero = photos.find((p) => p.section === "hero" && usable(p.src));
  const any = photos.find((p) => usable(p.src));
  const pick = hero ?? any;
  if (!pick) return null;
  return { src: pick.src, alt: (pick.alt ?? "").trim() };
}

// ── Blob re-host (part 3) ─────────────────────────────────────────────────────

/** Replace a source image URL with a permanent Blob URL. Returns the original
 *  URL on any failure — re-hosting is best-effort and never blocks the build. */
export type RehostImageFn = (url: string) => Promise<string>;

// Hosts we NEVER re-host: already-permanent Blob storage, and the stock CDNs
// (Unsplash/Pexels) which are hotlink-friendly by their own API terms.
const BLOB_HOST_RE = /\.blob\.vercel-storage\.com$/i;
const STOCK_HOST_RE = /(?:^|\.)(?:unsplash\.com|pexels\.com)$/i;

/**
 * Only the CLIENT's OWN scraped images get re-hosted — not stock, not
 * already-Blob URLs. Exported for unit testing.
 */
export function isRehostableSourceUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (BLOB_HOST_RE.test(u.host)) return false; // already permanent
  if (STOCK_HOST_RE.test(u.host)) return false; // stock CDN — hotlink-friendly
  return true;
}

const REHOST_TIMEOUT_MS = 8000;

/** Production re-host: SSRF-guarded fetch → Blob put (resolveExternalMedia),
 *  bounded by a timeout, degrading to the original URL on any failure. */
const defaultRehostImage: RehostImageFn = async (url) => {
  try {
    const result = await Promise.race([
      resolveExternalMedia(url, "image"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REHOST_TIMEOUT_MS)),
    ]);
    if (result && result.ok) return result.url;
  } catch {
    // fall through to the original URL
  }
  return url;
};

/**
 * Re-host the client's own captured images used in the payload (hero photo,
 * service photos, logo) to permanent Blob URLs. Mutates the payload in place.
 * Stock/Blob URLs are skipped (isRehostableSourceUrl). Best-effort per image.
 * Exported for unit testing. Returns counts for observability.
 */
export async function rehostCapturedImages(
  payload: R1LandingPayload,
  rehostFn: RehostImageFn,
): Promise<{ attempted: number; rehosted: number }> {
  const targets = new Set<string>();
  if (isRehostableSourceUrl(payload.hero.heroImage?.src)) {
    targets.add(payload.hero.heroImage.src);
  }
  for (const service of payload.services.services) {
    if (isRehostableSourceUrl(service.photo?.src)) targets.add(service.photo.src);
  }
  if (isRehostableSourceUrl(payload.logo)) targets.add(payload.logo);

  if (targets.size === 0) return { attempted: 0, rehosted: 0 };

  const pairs = await Promise.all(
    [...targets].map(async (u) => [u, await rehostFn(u)] as const),
  );
  const map = new Map(pairs);
  let rehosted = 0;
  const swap = (src: string): string => {
    const next = map.get(src);
    if (next && next !== src) {
      rehosted++;
      return next;
    }
    return src;
  };

  if (payload.hero.heroImage && isRehostableSourceUrl(payload.hero.heroImage.src)) {
    payload.hero.heroImage.src = swap(payload.hero.heroImage.src);
  }
  for (const service of payload.services.services) {
    if (service.photo && isRehostableSourceUrl(service.photo.src)) {
      service.photo.src = swap(service.photo.src);
    }
  }
  if (isRehostableSourceUrl(payload.logo)) {
    payload.logo = swap(payload.logo);
  }
  return { attempted: targets.size, rehosted };
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
  /**
   * Test seam — inject a fake photo resolver to keep tests offline.
   * Defaults to the real resolveServicePhoto (which may call Unsplash).
   */
  resolveServicePhotoFn?: ResolveServicePhotoFn;
  /**
   * Test seam — inject a fake image re-host fn to keep tests offline.
   * Defaults to the real Blob re-host (resolveExternalMedia).
   */
  rehostImageFn?: RehostImageFn;
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

  // Thread the client's own captured logo (part 1) onto the payload so the
  // nav renders their real brand mark instead of a text wordmark.
  if (typeof args.facts.logo === "string" && args.facts.logo.trim()) {
    parsed.logo = args.facts.logo.trim();
  }

  // ── Photo post-process ─────────────────────────────────────────────────────
  // After the payload is validated, enrich each service with an HD photo.
  // Infer the vertical from facts (same source as classifyArchetype in the
  // orchestrator — pure, sync, no deps).
  const photoFn = args.resolveServicePhotoFn ?? resolveServicePhoto;
  const vertical = inferVertical(
    args.facts.services,
    args.facts.business_description,
  );

  for (const service of parsed.services.services) {
    // Tolerate the legacy `image` key emitted by older prompts.
    const legacySrc =
      (service as { image?: { src?: string; alt?: string } }).image?.src;
    const legacyAlt =
      (service as { image?: { src?: string; alt?: string } }).image?.alt;
    const realSrc = service.photo?.src ?? legacySrc ?? null;
    const realAlt = service.photo?.alt ?? legacyAlt ?? null;

    try {
      const resolved = await photoFn({
        realSrc,
        realAlt,
        serviceName: service.name,
        vertical,
        archetype: args.archetype,
        businessName: args.facts.business_name,
      });
      if (resolved) {
        service.photo = resolved;
      }
      // When resolved is null: leave service.photo as-is (or absent) —
      // the renderer placeholder handles it.
    } catch {
      // One photo failure must never abort the build — degrade silently.
    }
  }

  // ── Hero image post-process ────────────────────────────────────────────────
  // The prompt's no-extracted-photo hero fallback (r1-payload-prompt.ts) is a
  // SINGLE hardcoded Unsplash photo id shared by EVERY trades workspace — its
  // trailing `&q=<query>` is a no-op on an images.unsplash.com by-id URL, so a
  // plumber with no scrapeable hero photo gets the exact same generic image as
  // every other trade. Unlike service cards, the hero was never run through the
  // image resolver. When the hero is that generic fallback (or missing), resolve
  // a vertical/archetype-relevant HD image instead — same resolver + DI seam the
  // service cards use, so it varies per business and per archetype (the
  // archetype's curated fallbackImageQueries pick deterministically by business
  // name). Real extracted hero photos are left untouched.
  const heroSrc = (parsed.hero.heroImage?.src ?? "").trim();
  const heroIsGenericFallback = !heroSrc || heroSrc.includes(GENERIC_HERO_PHOTO_ID);
  let heroSource: "extracted" | "scraped" | "stock" = heroIsGenericFallback
    ? "stock"
    : "extracted";
  if (heroIsGenericFallback) {
    // (2) Prefer the business's OWN captured photo before any stock image —
    // world-class means the client's real hero shows, not a generic template.
    const realHero = pickHeroPhotoFromFacts(args.facts);
    if (realHero) {
      parsed.hero.heroImage = {
        src: realHero.src,
        alt:
          realHero.alt ||
          parsed.hero.heroImage?.alt ||
          `${args.facts.business_name} — hero`,
      };
      heroSource = "scraped";
    } else {
      // (3) No scrapeable photo — resolve a vertical/archetype-relevant HD stock
      // image via the same resolver + DI seam the service cards use.
      try {
        const resolved = await photoFn({
          realSrc: null, // ignore the generic hardcoded URL — force the relevant fallback
          realAlt: parsed.hero.heroImage?.alt ?? null,
          // Empty serviceName → the resolver's `${serviceName} ${vertical}` query is
          // just the vertical (e.g. "hvac"); when the vertical is unknown, the
          // resolver falls to the archetype's curated fallbackImageQueries.
          serviceName: "",
          vertical,
          archetype: args.archetype,
          businessName: args.facts.business_name,
        });
        if (resolved?.src) {
          parsed.hero.heroImage = {
            src: resolved.src,
            alt:
              parsed.hero.heroImage?.alt ||
              `${args.facts.business_name} — professional at work`,
          };
        }
      } catch {
        // Network / rate-limit — keep the prompt's fallback rather than abort.
      }
    }
  }

  // Observability — never let an all-stock result look silently "green".
  // Records how the hero was sourced + how many of the client's own photos
  // were available (CLAUDE.md §3.1 Optimistic-Path rule).
  console.warn(
    JSON.stringify({
      event: "landing_images_sourced",
      business_name: args.facts.business_name,
      archetype: args.archetype,
      photos_available: Array.isArray(args.facts.photos)
        ? args.facts.photos.length
        : 0,
      hero_source: heroSource,
      logo_present: !!args.facts.logo,
    }),
  );

  // Blob re-host the client's OWN captured images (hero/service/logo) → permanent
  // URLs, so the public site never depends on a hotlink that can 403/expire.
  // Stock (Unsplash/Pexels) + already-Blob URLs are skipped. Best-effort — a
  // failed re-host keeps the original URL; workspace creation never blocks.
  try {
    const { attempted, rehosted } = await rehostCapturedImages(
      parsed,
      args.rehostImageFn ?? defaultRehostImage,
    );
    if (attempted > 0) {
      console.warn(
        JSON.stringify({
          event: "landing_images_rehosted",
          business_name: args.facts.business_name,
          attempted,
          rehosted,
        }),
      );
    }
  } catch {
    // Re-hosting must never block the build.
  }

  return parsed;
}
