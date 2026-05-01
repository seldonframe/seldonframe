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

/** Map a business type to a default personality. May 1, 2026 — drives
 *  both the cinematic overlay (dark, glassmorphism, Instrument Serif
 *  italic headings, blur-in animations) AND the light/professional
 *  overlay (white bg with dark hero band, Inter throughout, white
 *  service cards with hover-lift). Operators override later via
 *  update_design_tokens / set_page_style.
 *
 *  Mapping per user spec:
 *    saas / agency           → cinematic (dark + glass)
 *    professional_service    → light mode, Inter (clean personality has
 *                              the right tokens — light + Inter — even
 *                              though the name suggests minimalism; the
 *                              `editorial` personality uses serif which
 *                              feels wrong for service businesses)
 *    local_service           → clean (light + Inter)
 *    ecommerce               → clean (light + Inter)
 *    other                   → clean (safe default)
 */
function defaultPersonalityForType(type: BusinessType): PagePersonality {
  switch (type) {
    case "saas":
    case "agency":
      return "cinematic";
    case "professional_service":
    case "local_service":
    case "ecommerce":
    case "other":
      return "clean";
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

  // Render via the adapter (PageSchema → Blueprint → V1 HTML+CSS+font-link).
  let html: string;
  let css: string;
  let blueprint: ReturnType<typeof blueprintFromSchema>;
  try {
    const output = renderWithGeneralServiceV1(schema, tokens, schema.media, {
      removePoweredBy,
    });

    // The adapter's `head` contains: optional <link> font preconnects +
    // `<style>...</style>` wrapping the CSS. Split them: font links get
    // prepended to contentHtml (so the served page picks them up at the
    // top of the body — modern browsers handle <link> in body fine);
    // CSS gets stored raw in contentCss per the column convention.
    const fontLinkMatch = output.head.match(/^([\s\S]*?)<style>([\s\S]*)<\/style>\s*$/);
    let fontLinks = "";
    if (fontLinkMatch) {
      fontLinks = fontLinkMatch[1].trim();
      css = fontLinkMatch[2];
    } else {
      // Defensive — when the renderer returns no head (light mode legacy
      // path), the head is just the <style> block. Fall back to existing
      // behavior.
      css = output.head.replace(/^<style>/, "").replace(/<\/style>$/, "");
    }
    html = fontLinks ? `${fontLinks}\n${output.html}` : output.html;
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
