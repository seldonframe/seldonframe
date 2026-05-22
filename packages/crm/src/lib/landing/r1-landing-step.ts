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
import { inferVertical } from "./r1-payload-prompt";

export type R1LandingStepResult =
  | { ok: true; archetype: AestheticArchetypeId }
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
    const payload = await generateR1Payload({ facts, archetype, byokKey });

    // Step 3: Persist.
    await saveLandingPayload(workspaceId, payload, archetype);

    return { ok: true, archetype };
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
