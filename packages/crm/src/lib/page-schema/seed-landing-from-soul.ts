// ============================================================================
// seedLandingFromSoul — render the landing page from a workspace Soul.
// ============================================================================
//
// May 1, 2026 — primitives architecture A5/B7. Walks the new pipeline
// end-to-end:
//   org.soul → schemaFromSoul()         (B1 content-pack-aware schema)
//             → tokensForPersonality()   (per-business-type defaults)
//             → renderWithGeneralServiceV1()  (adapter → existing renderer)
//             → persist HTML + CSS + Blueprint to landing_pages
//
// Called from the Soul submit handler so a freshly-submitted Soul (with a
// SaaS classification) immediately re-renders the landing page using the
// SaaS content pack — no operator action required.
//
// Best-effort: failures log but don't propagate. The legacy seed/re-render
// path (`reRenderAllSurfacesForOrg`) remains as the canonical fallback for
// plan-change webhooks.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { canRemoveBranding, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { schemaFromSoul } from "./schema-from-soul";
import { tokensForPersonality } from "./design-tokens";
import { renderWithGeneralServiceV1 } from "./renderers/general-service-v1-adapter";
import { blueprintFromSchema } from "./renderers/blueprint-from-schema";
import { classifyBusinessTypeFromSoul } from "./classify-business";
import type { BusinessType } from "./types";
import type { PagePersonality } from "./design-tokens";

/** Map a business type to a default personality. SaaS leans clean (no
 *  glassmorphism — that's reserved for cinematic which would require the
 *  React-based renderer not yet in production). Local services and pro
 *  services use clean. Agencies lean editorial for the spacious feel.
 *  Operators can override per-tier later via update_design_tokens. */
function defaultPersonalityForType(type: BusinessType): PagePersonality {
  switch (type) {
    case "saas":
    case "local_service":
    case "professional_service":
    case "ecommerce":
    case "other":
      return "clean";
    case "agency":
      return "editorial";
  }
}

export interface SeedLandingResult {
  ok: boolean;
  landingId?: string;
  reason?: string;
}

/**
 * Build a PageSchema from the org's Soul, render via the V1 renderer
 * adapter, and persist the result to the org's primary landing page row
 * (slug = "home"). Idempotent — safe to call on every Soul submission.
 *
 * If the org has no landing page row yet, this function does NOT create
 * one (workspace creation handles that). It only updates an existing row.
 * Reason: we don't want to race the workspace-creation seed flow, which
 * has its own atomic transaction.
 */
export async function seedLandingFromSoul(orgId: string): Promise<SeedLandingResult> {
  if (!orgId) return { ok: false, reason: "no_org_id" };

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      plan: organizations.plan,
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return { ok: false, reason: "org_not_found" };
  if (!org.soul) return { ok: false, reason: "no_soul" };

  // Build the schema + tokens.
  const businessType = classifyBusinessTypeFromSoul(
    org.soul as unknown as Record<string, unknown>
  );
  const personality = defaultPersonalityForType(businessType);
  const accent =
    typeof org.theme?.accentColor === "string" ? org.theme.accentColor : "#14b8a6";
  const tokens = tokensForPersonality(personality, {
    palette: { accent },
  });

  const schema = schemaFromSoul(org.soul as unknown as Record<string, unknown>, {
    business_type: businessType,
  });

  // Plan-tier branding flag.
  const plan = resolvePlanFromPlanId(org.plan ?? null);
  const removePoweredBy = canRemoveBranding(plan);

  // Render via the adapter (PageSchema → Blueprint → V1 HTML+CSS).
  let html: string;
  let css: string;
  let blueprint: ReturnType<typeof blueprintFromSchema>;
  try {
    const output = renderWithGeneralServiceV1(schema, tokens, schema.media, {
      removePoweredBy,
    });
    html = output.html;
    // The adapter returns the CSS wrapped in <style>; strip the wrapper to
    // store raw CSS in landing_pages.contentCss (the column convention).
    css = output.head.replace(/^<style>/, "").replace(/<\/style>$/, "");
    blueprint = blueprintFromSchema(schema, tokens);
  } catch (err) {
    console.warn(`[seed-landing-from-soul] render failed for org ${orgId}:`, err);
    return { ok: false, reason: "render_failed" };
  }

  // Find the org's "home" landing row. We never create rows here — that's
  // the workspace-creation flow's job.
  const [row] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, "home")))
    .limit(1);

  if (!row) return { ok: false, reason: "no_landing_row" };

  await db
    .update(landingPages)
    .set({
      contentHtml: html,
      contentCss: css,
      blueprintJson: blueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, row.id));

  return { ok: true, landingId: row.id };
}
