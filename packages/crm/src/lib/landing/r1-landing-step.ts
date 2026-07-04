// packages/crm/src/lib/landing/r1-landing-step.ts
//
// Shared helper for the R1 landing generation step.
// Called identically by run-create-from-url.ts and run-create-from-paste.ts
// (DRY: the step is > 10 lines and identical in both orchestrators).
//
// Non-fatal: if any step throws, we log a structured warning and return
// false. The caller emits the SSE event only when we return true.

import {
  classifyArchetype,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";
import { generateR1Payload } from "./r1-payload-generator";
import { saveLandingPayload } from "./r1-save";
import { inferVertical, type R1LandingPayload, type R1LeadFormSection } from "./r1-payload-prompt";
import { resolveThemeMode, type ThemeModeChoice } from "./theme-mode";
import { generateServicePages } from "./service-pages-generator";
import { validateSiteTree } from "./r1-site-tree";

/**
 * Pure helper — ensures every generated payload ships with an enabled lead form
 * and hero intake form flag. The LLM prompt intentionally omits `leadForm` (it
 * is a Speed-to-Lead surface managed deterministically server-side, not copy),
 * so this function fills the gap before the payload is persisted.
 *
 * Rules:
 *  • Preserves any leadForm content the LLM already produced (shouldn't happen,
 *    but safe-by-default). Only fills missing fields and forces enabled = true.
 *  • needOptions: derived from the grid service names so the select reflects the
 *    real services on the site (R1LeadFormSection.needOptions is string[]).
 *  • hero.leadFormInHero: always set to true. Safe across all archetypes — the
 *    hero only renders the form in two-column variants (HeroSplit /
 *    HeroLeftAsymmetric); other variants ignore the flag. The bottom
 *    LeadFormSection always renders when leadForm.enabled is true.
 *
 * @param payload  The raw generated R1LandingPayload (mutated in-place + returned).
 * @param services List of service names from payload.services.services (for needOptions).
 * @returns The same payload reference with leadForm and hero.leadFormInHero set.
 */
export function withDefaultLeadForm(
  payload: R1LandingPayload,
  services: string[],
): R1LandingPayload {
  const existing: Partial<R1LeadFormSection> = payload.leadForm ?? {};

  payload.leadForm = {
    // LLM-supplied content is preserved; defaults fill any gaps.
    heading: existing.heading ?? "Request a free quote",
    subheading:
      existing.subheading ??
      "Tell us what you need — we'll get back to you within the hour.",
    needLabel: existing.needLabel ?? "What do you need?",
    // needOptions: use real service names when available; omit (text input) when empty.
    ...(existing.needOptions
      ? { needOptions: existing.needOptions }
      : services.length > 0
        ? { needOptions: services }
        : {}),
    ...(existing.consentText ? { consentText: existing.consentText } : {}),
    // Force enabled last so it always wins regardless of what the LLM emitted.
    enabled: true,
  };

  // Always enable the hero intake form column.
  payload.hero = { ...payload.hero, leadFormInHero: true };

  return payload;
}

export type R1LandingStepResult =
  | {
      ok: true;
      archetype: AestheticArchetypeId;
      /** The in-memory payload just generated + persisted. Exposed so
       *  callers (e.g. create-full's chatbot auto-seed) can derive
       *  content from it without a second DB read. Additive field —
       *  existing consumers that only destructure {ok, archetype}
       *  are unaffected. */
      payload: R1LandingPayload;
    }
  | { ok: false; reason: string };

/**
 * Run the R1 landing generation step for a freshly-created workspace.
 *
 * Steps:
 *  1. Classify archetype from extracted facts.
 *  2. Call the LLM to generate the payload JSON.
 *  3. Persist to landing_pages WHERE slug = 'r1'.
 *
 * Returns { ok: true } on success, { ok: false, reason } on any failure.
 * Never throws — designed to be wrapped in a try/catch by the caller.
 */
export async function runR1LandingStep(args: {
  workspaceId: string;
  facts: ExtractedBusinessFacts;
  byokKey: string;
  themeMode?: ThemeModeChoice;
  /**
   * Skip the per-service detail-page generation (step 4). Each service page is
   * its own LLM call, so skipping them materially cuts wall-clock for latency-
   * sensitive callers — e.g. the keyless ChatGPT-app build_workspace tool, where
   * a long synchronous tool call risks an MCP client timeout. The main landing
   * is unaffected: ServicesGrid simply renders non-linking cards, and the
   * operator can regenerate the full multi-page site later. Defaults to false,
   * so the URL/paste onboarding flows keep generating service pages.
   */
  skipServicePages?: boolean;
}): Promise<R1LandingStepResult> {
  const { workspaceId, facts, byokKey } = args;

  try {
    // Step 1: Classify archetype.
    // classifyArchetype accepts a description-based fallback when vertical
    // is uncertain, so we pass inferVertical as the primary signal.
    const vertical = inferVertical(
      facts.services,
      facts.business_description,
    );
    const archetype = classifyArchetype({
      vertical,
      emergencyService: facts.emergency_service ?? null,
      sameDay: facts.same_day ?? null,
      reviewRating: facts.review_rating ?? null,
      reviewCount: facts.review_count ?? null,
      businessDescription: facts.business_description,
    });

    // Step 2: Generate payload.
    // (Health-template imagery is no longer fetched here. The /w renderer fills
    // any empty photo slots from each template's curated fixture defaults via
    // withTemplateDefaults — reliable, on-brand, and identical to the designed
    // template, instead of a blind per-build stock search.)
    const payload = await generateR1Payload({ facts, archetype, byokKey });

    // Step 3: Inject resolved theme mode server-side before persisting.
    payload.theme = { mode: resolveThemeMode(args.themeMode, archetype) };

    // Step 4 (P4): Generate one service detail page per real grid service.
    // Graceful — any failure leaves the site single-page rather than blocking
    // the whole build. validateSiteTree is used as a final gate to keep only
    // structurally valid pages (generateServicePages already runs it per-page
    // internally, so this filters out any that slipped through on a bad payload).
    if (!args.skipServicePages) {
      try {
        const servicePages = await generateServicePages({
          gridServices: payload.services.services,
          facts,
          vertical,
          archetype,
          byokKey,
        });
        const valid = servicePages.filter(
          (p) => validateSiteTree({ servicePages: [p] }).valid,
        );
        if (valid.length) payload.servicePages = valid;
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "r1_service_pages_failed",
            workspace_id: workspaceId,
            message:
              err instanceof Error ? err.message.slice(0, 300) : String(err),
          }),
        );
      }
    }

    // Step 5 (P4): Navbar booking CTA — rewriteR1Hrefs maps "/book" → the
    // workspace booking URL at render time (same as the hero CTA).
    payload.nav = { ...(payload.nav ?? {}), cta: { label: "Book now", href: "/book" } };

    // Step 5b (P4.1): Ensure lead form is enabled and hero intake flag is set.
    // The LLM prompt does not emit leadForm (Speed-to-Lead is a product surface,
    // not copy). withDefaultLeadForm fills it deterministically from real service
    // names so both the hero column and the bottom section render on every site.
    withDefaultLeadForm(
      payload,
      payload.services.services.map((s) => s.name),
    );

    // Step 6: Persist.
    await saveLandingPayload(workspaceId, payload, archetype);

    return { ok: true, archetype, payload };
  } catch (err: unknown) {
    // Log the FULL error server-side for debugging — this never leaves
    // the server. The user-facing reason is intentionally short.
    const fullDetail = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "landing_payload_generation_failed",
        workspace_id: workspaceId,
        business_name: facts.business_name,
        detail: fullDetail.slice(0, 2000),
        stack: err instanceof Error ? err.stack?.slice(0, 1500) : undefined,
      }),
    );
    // Return a SHORT, user-safe reason — never leak SQL queries / stack
    // traces to the API response (and from there to the UI).
    return {
      ok: false,
      reason: "Couldn't generate the website right now.",
    };
  }
}
