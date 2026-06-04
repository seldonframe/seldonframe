// lib/landing/template-selection.ts
//
// Resolve which premium health/wellness landing template (if any) fits a
// workspace's vertical. Shared by the creation pipeline (auto-pick) and the
// ready-page design picker. Health-only by design: non-health verticals
// return null and keep the existing landing-r1 archetype render untouched.

import {
  DEFAULT_HEALTH_TEMPLATE,
  TEMPLATE_BY_VERTICAL,
  type LandingTemplateId,
} from "@/components/landing-templates/registry";

/** True when the (lowercased) vertical maps to a health/wellness template. */
export function isHealthVertical(vertical: string | null | undefined): boolean {
  if (!vertical) return false;
  return vertical.trim().toLowerCase() in TEMPLATE_BY_VERTICAL;
}

/**
 * Pick the best-fit health/wellness template for a vertical, or null for
 * non-health verticals (caller then keeps the landing-r1 render). This is the
 * "Auto" resolution used at workspace-creation time.
 */
export function pickLandingTemplate(
  vertical: string | null | undefined,
): LandingTemplateId | null {
  const v = (vertical ?? "").trim().toLowerCase();
  if (!v) return null;
  return TEMPLATE_BY_VERTICAL[v] ?? null;
}

/**
 * Like pickLandingTemplate but never null — for resolving "Auto" on a workspace
 * already in the health track (e.g. the ready-page picker), where we know a
 * template should apply. Unmapped health verticals fall back to the workhorse.
 */
export function resolveHealthTemplate(
  vertical: string | null | undefined,
): LandingTemplateId {
  return pickLandingTemplate(vertical) ?? DEFAULT_HEALTH_TEMPLATE;
}

/**
 * Classify the best-fit health/wellness template directly from extracted
 * business facts (name + description + services). Keyword-based, deterministic,
 * and intentionally conservative: returns null for anything that isn't clearly
 * a health/wellness sub-vertical, so non-health workspaces keep landing-r1.
 *
 * Why not reuse the CRM personality? It's too coarse (hvac / dental / legal /
 * coaching / agency / default) to tell chiro from massage from derm — the five
 * templates need that distinction. The copy carries it; this reads the copy.
 * Order matters: most-specific match wins.
 */
export function classifyHealthTemplate(input: {
  businessName?: string | null;
  businessDescription?: string | null;
  services?: readonly string[] | null;
}): LandingTemplateId | null {
  const hay = [
    input.businessName ?? "",
    input.businessDescription ?? "",
    ...(input.services ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => hay.includes(k));

  // T1 Clinical Luxe — derm / med-spa / cosmetic / aesthetics.
  if (has("dermatolog", "med spa", "medspa", "med-spa", "aesthetic", "botox", "cosmetic", "skincare", "skin care", "laser clinic"))
    return "clinical-luxe";
  // T2 Warm Wellness — prenatal / women's health / pilates / yoga.
  if (has("prenatal", "postnatal", "pre-natal", "post-natal", "pregnan", "women's health", "womens health", "pilates", "yoga", "doula", "midwif"))
    return "warm-wellness";
  // T4 Editorial Bodywork — massage / bodywork. (Before "spa" so a massage
  // spa reads as bodywork.)
  if (has("massage", "bodywork", "deep tissue", "myofascial"))
    return "editorial-bodywork";
  // T3 Cinematic Sanctuary — spa / holistic / osteopathy / acupuncture.
  if (has("day spa", "sauna", "holistic", "osteopath", "acupunctur", "reiki", "naturopath", "wellness sanctuary", "wellness retreat"))
    return "cinematic-sanctuary";
  // T5 Earthy Modern Clinical — chiro / physio / sports med / rehab.
  if (has("chiropract", "physiotherap", "physical therap", "physio", "sports medicine", "sports med", "rehabilitation", "rehab clinic", "orthopedic"))
    return "earthy-modern-clinical";

  return null;
}
