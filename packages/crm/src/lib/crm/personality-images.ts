// ============================================================================
// Personality images — Unsplash hero + section URLs per CRMPersonality.
// ============================================================================
//
// May 2, 2026 / Issue #3 — every CRMPersonality (hvac, dental, legal,
// agency, coaching) ships a curated bundle of Unsplash images so a fresh
// workspace's landing page renders with industry-relevant photography
// instead of a text-only hero band. Hand-picked URLs (not auto-fetched)
// so we have full editorial control over what shows up: professional
// stock that matches each vertical, no awkward stock-photo clichés.
//
// Selection rules:
//   - hero_url: a single landscape (16:9 or wider) image suitable for
//     a full-bleed hero background. The renderer overlays a dark
//     gradient so headline text stays readable; pick darker / lower-
//     contrast images.
//   - service_grid_image_urls: up to 8 portrait/square photos used as
//     service-card backgrounds (round-robin assignment in
//     applyPersonalityImagesToSchema). Operators can override per-card
//     via update_landing_section.
//
// All URLs are Unsplash Source-format direct photo links with `auto=format`
// + `fit=crop` + `w=1600&h=900` for hero (or w=600&h=400 for cards).
// Resizing happens server-side at Unsplash; no client-side image
// processing. Free for commercial use under the Unsplash License.
//
// Adding a new personality: drop an entry below, keyed by vertical slug.
// Personalities without an entry render text-only (graceful fallback).

import type { PersonalityVertical } from "./personality";
import type { UnsplashAttribution } from "@/components/landing/sections/types";
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";

// Test seam: production uses globalThis.fetch. Tests override via
// __setUnsplashFetchForTest. Doing it module-scope keeps the fast-path
// production call free of indirection. The seam's response type is
// scoped to what searchUnsplash actually consumes (ok, status, json)
// so tests can pass minimal stubs without satisfying the full DOM
// Response surface.
type UnsplashFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};
type FetchFn = (url: string, init?: RequestInit) => Promise<UnsplashFetchResponse>;
let unsplashFetch: FetchFn = (url, init) =>
  fetch(url, init) as unknown as Promise<UnsplashFetchResponse>;

export function __setUnsplashFetchForTest(fn: FetchFn): void {
  unsplashFetch = fn;
}

export function __resetUnsplashFetchForTest(): void {
  unsplashFetch = (url, init) =>
    fetch(url, init) as unknown as Promise<UnsplashFetchResponse>;
}

/**
 * v1.54.0 — Deterministic fallback query picker. Same business name
 * always selects the same fallback query (so regenerate doesn't roll
 * the dice on operator iteration). djb2-style hash.
 */
export function pickFallbackQuery(
  archetype: AestheticArchetypeId,
  businessName: string,
): string {
  const fallbacks = ARCHETYPES[archetype].fallbackImageQueries;
  if (fallbacks.length === 0) return "professional business";
  let hash = 5381;
  for (let i = 0; i < businessName.length; i++) {
    hash = ((hash << 5) + hash + businessName.charCodeAt(i)) | 0;
  }
  return fallbacks[Math.abs(hash) % fallbacks.length];
}

export interface PersonalityImageBundle {
  /** Single landscape hero background — 1600x900 ideal. */
  hero_url: string;
  /** Up to 8 portrait/square images for the services-grid cards. */
  service_grid_image_urls: string[];
}

const HERO_PARAMS = "auto=format&fit=crop&w=1600&h=900&q=80";
const CARD_PARAMS = "auto=format&fit=crop&w=800&h=600&q=80";

function hero(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${HERO_PARAMS}`;
}

function card(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${CARD_PARAMS}`;
}

// ─── GENERAL ─────────────────────────────────────────────────────────────────
// v1.2.0 — fallback for any business that doesn't match a named
// vertical. Hand-picked images that read as "professional contractor /
// trade / local service" — work boots, blueprints, contractor on a
// site, residential exterior work — generic enough to fit roofing /
// landscaping / handyman / painting / fencing / general remodelers
// without looking like a specific vertical.

const GENERAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1503387762-cf8d8a39c049"), // contractor consulting on residential job site
  service_grid_image_urls: [
    card("1503387762-cf8d8a39c049"), // contractor on site
    card("1581094288338-2314dddb7ece"), // tools laid out
    card("1503387837-b154d5074bd2"), // blueprints / planning
    card("1581092334651-ddf26d9a09d0"), // residential workspace
    card("1556761175-5973dc0f32e7"), // craftsperson at work
    card("1505236858219-8359eb29e329"), // home exterior project
  ],
};

// ─── HVAC ────────────────────────────────────────────────────────────────────
// Technicians, HVAC equipment, residential service. Photos lean toward
// "professional + trustworthy" rather than corporate stock.

const HVAC_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1581094488379-6c3c8e7e8a64"), // technician working on outdoor AC unit
  service_grid_image_urls: [
    card("1581094288338-2314dddb7ece"), // HVAC tools
    card("1597007030739-6d2e7172ee0a"), // ductwork install
    card("1558618666-fcd25c85cd64"), // technician with clipboard
    card("1581092334651-ddf26d9a09d0"), // residential thermostat
    card("1622428051717-dcd8412959de"), // commercial unit on roof
    card("1565182999561-18d7dc61c393"), // air filter / indoor air
  ],
};

// ─── DENTAL ──────────────────────────────────────────────────────────────────
// Dentists with patients, modern dental office, smiling patients. Lean
// toward clean / bright / friendly — not clinical.

const DENTAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1606811971618-4486d14f3f99"), // smiling family / friendly dental setting
  service_grid_image_urls: [
    card("1588776814546-1ffcf47267a5"), // dentist with patient (cleaning)
    card("1609840114035-3c981b782dfe"), // teeth whitening / tools
    card("1551269901-5c5e14c25df7"), // invisalign / clear aligner
    card("1606265752439-1f18756aa5fc"), // dental implant model
    card("1559757148-5c350d0d3c56"), // emergency / urgent care setting
    card("1581595220892-b0739db3ba8c"), // pediatric / child dentist
  ],
};

// ─── LEGAL ───────────────────────────────────────────────────────────────────
// Law-office interiors, scales of justice, attorney-client meetings. Avoid
// gavel-on-desk clichés in favor of warmer, conversational images.

const LEGAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1589994965851-a8f479c573a9"), // attorney consulting with client
  service_grid_image_urls: [
    card("1505664194779-8beaceb93744"), // family law / mediation
    card("1450101499163-c8848c66ca85"), // legal documents / contract
    card("1589216532372-1c2a367900d9"), // estate planning / paperwork
    card("1521791136064-7986c2920216"), // attorney handshake
    card("1505664063603-28e48ca204eb"), // court / formal setting
    card("1589994160957-fa46ab66f78d"), // immigration / passport context
  ],
};

// ─── AGENCY ──────────────────────────────────────────────────────────────────
// Creative-team workspaces, design tools, brand collateral. Lean into
// modern / minimal / photo-of-people-collaborating.

const AGENCY_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1521737711867-e3b97375f902"), // collaborative team workspace
  service_grid_image_urls: [
    card("1542744094-3a31f272c490"), // brand strategy whiteboard
    card("1559028012-481c04fa702d"), // designer working
    card("1499951360447-b19be8fe80f5"), // photographer / creative
    card("1551434678-e076c223a692"), // analytics / strategy
    card("1559136555-9303baea8ebd"), // motion / video work
    card("1542744173-8e7e53415bb0"), // ux/ui design
  ],
};

// ─── MEDSPA ──────────────────────────────────────────────────────────────────
// v1.1.7 — luxury aesthetics, modern spa interiors, treatment rooms,
// botanical/skincare products. Lean toward warm, premium, calming —
// not clinical or harsh.

const MEDSPA_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1570172619644-dfd03ed5d881"), // serene treatment-room ambience
  service_grid_image_urls: [
    card("1596704017254-9b121068fb31"), // facial treatment
    card("1571019613454-1cb2f99b2d8b"), // skincare products / botanical
    card("1503951914875-452162b0f3f1"), // laser/wellness device
    card("1591343395082-e120087004b4"), // dropper / serum
    card("1583416750470-965b2707b355"), // spa interior detail
    card("1612817288484-6f916006741a"), // massage / body treatment
  ],
};

// ─── COACHING ────────────────────────────────────────────────────────────────
// 1:1 coaching sessions, video calls, journaling, professional growth.
// Warm, conversational, person-focused.

const COACHING_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1573497019940-1c28c88b4f3e"), // coach + client conversation
  service_grid_image_urls: [
    card("1552664730-d307ca884978"), // group coaching workshop
    card("1573497620053-ea5300f94f21"), // 1:1 conversation
    card("1551836022-d5d88e9218df"), // executive coaching
    card("1573164574511-73c773193279"), // virtual call setup
    card("1517245386807-bb43f82c33c4"), // career planning notebook
    card("1531403009284-440f080d1e12"), // mindset / focus
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const IMAGES: Partial<Record<PersonalityVertical, PersonalityImageBundle>> = {
  general: GENERAL_IMAGES,
  hvac: HVAC_IMAGES,
  dental: DENTAL_IMAGES,
  legal: LEGAL_IMAGES,
  agency: AGENCY_IMAGES,
  coaching: COACHING_IMAGES,
  medspa: MEDSPA_IMAGES,
};

/**
 * Look up a personality's curated image bundle. Returns the GENERAL
 * bundle as a last-resort fallback so workspaces with LLM-generated
 * personalities (whose `vertical` value is whatever the model picked
 * — "roofing", "pet-grooming", "tax-prep", etc.) still render with
 * SOMETHING in the hero rather than text-only. v1.3.1 — added the
 * fallback after the Ironclad Roofing demo showed a text-only hero
 * (default personality wasn't in the IMAGES map).
 */
export function getPersonalityImages(
  vertical: PersonalityVertical | string | null | undefined
): PersonalityImageBundle | null {
  if (vertical) {
    const exact = IMAGES[vertical as PersonalityVertical];
    if (exact) return exact;
  }
  // Fallback: GENERAL bundle (workshop / contractor / blueprints —
  // generic enough to fit any service business). Callers that
  // specifically need to detect "no curated bundle" can compare the
  // returned object identity against IMAGES.general.
  return IMAGES.general ?? null;
}

// ─── v1.3.4 — per-query Unsplash search ──────────────────────────────────────
//
// When the LLM personality includes images.hero_query (free-text), we
// can fetch a real photo for that query rather than falling back to a
// hand-curated bundle that may be irrelevant or broken. Two paths:
//
//   1. Official Unsplash API (when UNSPLASH_ACCESS_KEY is set in env).
//      Authoritative, returns a real photo URL + photographer attribution.
//   2. Source.unsplash.com legacy redirect (no key required, deprecated
//      but the CDN still serves photos — Unsplash hasn't taken it
//      offline as of May 2026). Used as a key-less fallback.
//
// The result is a PLAIN URL string. Caller embeds in
// `background-image: url(...)` exactly like the curated-bundle URLs.

const HERO_QUERY_PARAMS = "auto=format&fit=crop&w=1600&h=900&q=80";

// v1.39.0 — skyline / scenery rejection.
//
// Pre-1.39.0 the resolver picked Unsplash result[0] unconditionally.
// For queries like "austin storm roofing" Unsplash interpreted the
// city as the dominant subject and returned downtown skyline shots —
// not roofs. The Bluebonnet Roofing test landed with an Austin-skyline
// hero, which read as "stock template" instantly.
//
// Fix: scan the top N results for descriptions that match
// scenery/cityscape patterns and SKIP them, picking the first result
// whose description suggests the actual subject (a roof, a worker,
// shingles, etc.). If every result looks like scenery, fall back to
// the first one anyway (a hero is better than no hero).
//
// We rely on Unsplash's `description` + `alt_description` fields,
// which photographers populate with real descriptive text. The
// rejection regex covers obvious scenery markers without being
// over-aggressive (e.g. "rooftop view of city" might pass — that's
// fine, looks fine in a hero).
const SCENERY_REJECTION_RE = /\b(skyline|cityscape|aerial view of (the )?city|downtown|panorama|landscape|sunset over|sunrise over|view from|tourism)\b/i;

interface UnsplashSearchResult {
  id?: string;
  description?: string | null;
  alt_description?: string | null;
  urls?: { raw?: string; full?: string; regular?: string };
  // v1.40.5 — production-tier compliance fields.
  user?: {
    name?: string | null;
    username?: string | null;
    links?: { html?: string | null };
  };
  links?: {
    download_location?: string | null;
  };
}

/**
 * v1.40.5 — Unsplash production-compliance fields. Returned alongside
 * every resolved image URL so the caller can render attribution + the
 * resolver fires the required download tracking ping.
 */
export interface ResolvedUnsplashImage {
  url: string;
  attribution: UnsplashAttribution;
}

function pickBestHeroResult(
  results: UnsplashSearchResult[],
): UnsplashSearchResult | null {
  if (results.length === 0) return null;
  // Prefer the first result whose description doesn't read as scenery.
  for (const r of results) {
    const text = `${r.description ?? ""} ${r.alt_description ?? ""}`.trim();
    if (text.length === 0) {
      // No description — could be anything. Take it (better than rejecting).
      return r;
    }
    if (!SCENERY_REJECTION_RE.test(text)) {
      return r;
    }
  }
  // All results matched scenery — fall back to first anyway.
  return results[0];
}

// v1.40.5 — three-tier query broadening for 0-result retries.
//
// v1.40.4 (single tier: drop first word) wasn't aggressive enough for niche
// marketing terms. The HERO Aesthetic test revealed that "minimalist medspa
// treatment room" still returned 0 results after broadening to "medspa
// treatment room" — the word "medspa" itself is rarely tagged on Unsplash
// (photographers tag spa/wellness/clinic/aesthetic, not "medspa"). v1.40.5
// adds a third tier: take the LAST 2 words of the original. This drops
// niche brand-marketing tokens entirely and falls back to the universal
// noun phrase (e.g. "treatment room") which is well-tagged.
//
// Tier 1: original query unchanged
// Tier 2: drop the first word
// Tier 3: last 2 words of the original
//
// Examples:
//   "minimalist medspa treatment room"
//     → ["minimalist medspa treatment room", "medspa treatment room", "treatment room"]
//   "asphalt shingle residential roof"
//     → ["asphalt shingle residential roof", "shingle residential roof", "residential roof"]
//   "facial treatment dermatology"
//     → ["facial treatment dermatology", "treatment dermatology"]   (last 2 == tier 2, deduped)
//   "spa wellness"
//     → ["spa wellness", "wellness"]                                (last word as final tier)
//
// Empty + duplicate candidates filtered. Returns at least the original.
function buildQueryCandidates(query: string): string[] {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/).filter(Boolean);
  const candidates = [cleaned];
  if (words.length >= 2) {
    candidates.push(words.slice(1).join(" "));
  }
  if (words.length >= 3) {
    candidates.push(words.slice(-2).join(" "));
  }
  // Dedupe while preserving order.
  return [...new Set(candidates)];
}

async function searchUnsplash(
  query: string,
  apiKey: string,
  opts: { perPage: number; orientation: "landscape" | "squarish" },
): Promise<UnsplashSearchResult[] | null> {
  const response = await unsplashFetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query,
    )}&per_page=${opts.perPage}&orientation=${opts.orientation}&content_filter=low`,
    {
      headers: {
        Authorization: `Client-ID ${apiKey}`,
        "Accept-Version": "v1",
      },
    },
  );
  if (!response.ok) {
    console.warn(
      JSON.stringify({
        event: "unsplash_api_error",
        query,
        status: response.status,
      }),
    );
    return null;
  }
  const data = (await response.json()) as { results?: UnsplashSearchResult[] };
  return data.results ?? [];
}

// v1.40.5 — Unsplash API guideline: when an image is "downloaded"
// (Unsplash's term for "shown to a user as part of your application"),
// you MUST send a GET to photo.links.download_location. This is how
// Unsplash credits the photographer's download counter and is a
// REQUIRED check during production-tier review. Without it, your app
// stays capped at 50 req/hour and gets rejected on resubmission.
//
// We fire this server-side at URL-resolution time (when the photo
// "enters use" for that workspace's landing page). Fire-and-forget —
// the response body is `{ url: ... }` we don't need; only the request
// itself matters. Failure of this ping doesn't break workspace
// creation; we log and move on.
function trackUnsplashDownload(downloadLocation: string, apiKey: string): void {
  // Don't await — fire and continue. Workspace creation latency is
  // already at ~30s, no need to add another round-trip on the
  // critical path.
  fetch(downloadLocation, {
    headers: {
      Authorization: `Client-ID ${apiKey}`,
      "Accept-Version": "v1",
    },
  }).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "unsplash_download_track_failed",
        url: downloadLocation,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}

// Build an UnsplashAttribution from a search-result. Falls back to
// "Unsplash" / `unsplash` when photographer info is missing (rare —
// the API almost always returns it).
function buildAttribution(result: UnsplashSearchResult): UnsplashAttribution {
  const name = result.user?.name?.trim() || "Unsplash";
  const username = result.user?.username?.trim() || "unsplash";
  const profileUrl =
    result.user?.links?.html?.trim() || `https://unsplash.com/@${username}`;
  return {
    photographer_name: name,
    photographer_username: username,
    photographer_url: profileUrl,
    photo_id: result.id?.trim() || "",
  };
}

/**
 * Resolve a hero image URL from a free-text query. Returns a CDN URL
 * pointing to a real Unsplash photo when the API call succeeds and
 * returns at least one valid result. Returns an EMPTY STRING when the
 * API quota's exhausted, the request errors, or no results match —
 * the hero component then renders its designed branded-gradient
 * empty-state instead of a broken image.
 *
 * v1.39.0 — rejects scenery/cityscape results (SCENERY_REJECTION_RE)
 * so queries like "austin roofing" don't return a downtown-skyline
 * hero. Fetches per_page=15 to give the rejection logic enough
 * alternatives to find a real subject.
 *
 * v1.40.3 — REMOVED the source.unsplash.com keyless fallback.
 * Pre-1.40.3 we fell back to `https://source.unsplash.com/1600x900/?{q}`
 * when the API path failed. That endpoint is DEPRECATED and frequently
 * returns broken responses now, which produced stored-broken-URL pipelines:
 * even though the hero's onError handler (added in v1.40.2) eventually
 * caught the failure, the user briefly saw a broken-image icon in the
 * corner before the React state flipped.
 *
 * v1.40.4 — content_filter relaxed (high → low) + 0-result retry with
 * broadened query. Diagnostic test surfaced that some LLM-generated
 * queries return 0 results from Unsplash even though a slightly broader
 * version returns 15+ ("minimalist medspa treatment room" → 0,
 * "medspa treatment room" → many). content_filter=high was also blocking
 * legitimate medspa imagery. Both are common-case fixes; together they
 * raise the hit rate from ~80% per query to ~99% for realistic vertical
 * queries.
 */
export async function resolveHeroImage(
  query: string,
  archetypeContext?: { archetype: AestheticArchetypeId; businessName: string },
): Promise<ResolvedUnsplashImage | null> {
  const cleanedQuery = query?.trim() || "professional business interior";
  const apiKey = process.env.UNSPLASH_ACCESS_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const candidates = buildQueryCandidates(cleanedQuery);

  // Phase 1 — LLM-generated query + broadenings (existing behavior).
  for (const candidate of candidates) {
    const result = await tryHeroUnsplashFetch(candidate, apiKey);
    if (result) return result;
  }

  // Phase 2 — v1.54.0 — archetype-curated fallback. Only fires when
  // caller provided archetypeContext AND Phase 1 returned no usable
  // image. The fallback query is picked deterministically so regenerate
  // gives the same image (operator-iteration story).
  if (archetypeContext) {
    const fallbackQuery = pickFallbackQuery(
      archetypeContext.archetype,
      archetypeContext.businessName,
    );
    console.warn(
      JSON.stringify({
        event: "unsplash_archetype_fallback_used",
        original_query: query,
        archetype: archetypeContext.archetype,
        fallback_query: fallbackQuery,
      }),
    );
    const result = await tryHeroUnsplashFetch(fallbackQuery, apiKey);
    if (result) return result;
  }

  return null;
}

// Inner search-and-pick logic, extracted so resolveHeroImage's Phase 1
// loop and Phase 2 fallback path share the same try/zero/throw handling.
async function tryHeroUnsplashFetch(
  candidate: string,
  apiKey: string,
): Promise<ResolvedUnsplashImage | null> {
  try {
    const results = await searchUnsplash(candidate, apiKey, {
      perPage: 15,
      orientation: "landscape",
    });
    if (!results) return null; // API error — try next candidate
    if (results.length === 0) {
      console.warn(
        JSON.stringify({
          event: "unsplash_api_zero_results",
          query: candidate,
        }),
      );
      return null;
    }
    const picked = pickBestHeroResult(results);
    const raw = picked?.urls?.raw ?? picked?.urls?.full;
    if (raw && picked) {
      if (picked.links?.download_location) {
        trackUnsplashDownload(picked.links.download_location, apiKey);
      }
      return {
        url: `${raw}${raw.includes("?") ? "&" : "?"}${HERO_QUERY_PARAMS}`,
        attribution: buildAttribution(picked),
      };
    }
    return null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "unsplash_api_throw",
        query: candidate,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Legacy signature returning just the URL string. Kept for callers that
 * don't render attribution (seed-landing-from-soul.ts, page-blocks/persist.ts).
 * NEW callers should prefer resolveHeroImage() to get the attribution payload
 * needed for production-compliant rendering.
 */
export async function resolveHeroImageUrlForQuery(
  query: string,
): Promise<string> {
  const result = await resolveHeroImage(query);
  return result?.url ?? "";
}

// ─── v1.38.1 — per-service gallery resolver ──────────────────────────────────
//
// projectGallery wants square thumbnails (~600x600), one per service. Resolves
// an Unsplash photo for each query AND deduplicates by photo id so a
// workspace with 6 services doesn't show the same generic photo 6 times when
// the queries are similar ("plumbing", "drain cleaning", "water heater").
//
// v1.40.3 — REMOVED the source.unsplash.com keyless fallback. When the API
// path fails for a given query we SKIP that slot entirely; the gallery
// component (project-gallery.tsx) reflows around missing tiles via its
// per-tile onError handler.
//
// v1.40.4 — content_filter=high → low + 0-result retry with broadened query.
// Same fix shape as the hero resolver. Diagnostic test confirmed that
// content_filter=high was blocking legit medspa imagery (e.g. "facial
// treatment dermatology" passed; "minimalist medspa treatment room" returned
// 0 results) and that broadenQuery rescues the latter.

const GALLERY_QUERY_PARAMS = "auto=format&fit=crop&w=800&h=800&q=80";

export async function resolveGalleryImages(
  queries: string[],
  archetypeContext?: { archetype: AestheticArchetypeId; businessName: string },
): Promise<ResolvedUnsplashImage[]> {
  if (queries.length === 0) return [];
  const apiKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const seenIds = new Set<string>();
  const out: ResolvedUnsplashImage[] = [];

  for (let slotIdx = 0; slotIdx < queries.length; slotIdx++) {
    const query = queries[slotIdx];
    const cleaned = query?.trim() || "professional business";

    let resolved = false;

    // Phase 1 — try LLM-generated query + broadenings.
    const candidates = buildQueryCandidates(cleaned);
    for (const candidate of candidates) {
      const picked = await tryGalleryUnsplashFetch(candidate, apiKey, seenIds);
      if (picked) {
        out.push(picked);
        resolved = true;
        break;
      }
    }

    // Phase 2 — v1.54.0 — archetype-curated fallback. Index-based picking
    // (NOT hash) so 6 services don't all land on the same fallback photo
    // when their queries all zero-result. Modulo over the fallback array.
    if (!resolved && archetypeContext) {
      const fallbacks = ARCHETYPES[archetypeContext.archetype].fallbackImageQueries;
      const fallbackQuery = fallbacks[slotIdx % fallbacks.length];
      console.warn(
        JSON.stringify({
          event: "unsplash_archetype_fallback_used",
          original_query: cleaned,
          archetype: archetypeContext.archetype,
          fallback_query: fallbackQuery,
          context: "gallery",
        }),
      );
      const picked = await tryGalleryUnsplashFetch(fallbackQuery, apiKey, seenIds);
      if (picked) out.push(picked);
    }
  }

  return out;
}

// Gallery-specific inner search: squarish orientation, perPage 10,
// dedupes by photo id (shared seenIds set passed by caller).
async function tryGalleryUnsplashFetch(
  candidate: string,
  apiKey: string,
  seenIds: Set<string>,
): Promise<ResolvedUnsplashImage | null> {
  try {
    const results = await searchUnsplash(candidate, apiKey, {
      perPage: 10,
      orientation: "squarish",
    });
    if (!results) return null;
    if (results.length === 0) {
      console.warn(
        JSON.stringify({
          event: "unsplash_gallery_zero_results",
          query: candidate,
        }),
      );
      return null;
    }
    const fresh = results.find((r) => r.id && !seenIds.has(r.id));
    const raw = fresh?.urls?.raw ?? fresh?.urls?.full;
    if (raw && fresh?.id) {
      seenIds.add(fresh.id);
      if (fresh.links?.download_location) {
        trackUnsplashDownload(fresh.links.download_location, apiKey);
      }
      return {
        url: `${raw}${raw.includes("?") ? "&" : "?"}${GALLERY_QUERY_PARAMS}`,
        attribution: buildAttribution(fresh),
      };
    }
    return null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "unsplash_gallery_throw",
        query: candidate,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Legacy signature returning just URL strings. Kept for callers that don't
 * render attribution. NEW callers should prefer resolveGalleryImages() to
 * get the attribution payload needed for production-compliant rendering.
 */
export async function resolveGalleryImageUrlsForQueries(
  queries: string[],
): Promise<string[]> {
  const results = await resolveGalleryImages(queries);
  return results.map((r) => r.url);
}
