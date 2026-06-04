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
