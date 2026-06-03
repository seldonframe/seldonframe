// landing-templates/registry.ts
//
// Registry of premium Claude Design full-page health/wellness landing
// templates. Each template is a self-contained package under
// `landing-templates/<id>/` exporting a component with the shared
// `({ data, ctas, theme }) => JSX` signature (see `_contract/types.ts`).
//
// Adding a template = (1) drop the package under `<id>/`, (2) add the
// entry below, (3) map the relevant verticals in TEMPLATE_BY_VERTICAL.
// The `/w/[slug]` route reads this map to dispatch; nothing else changes.

import type { ComponentType } from "react";
import type { TemplateProps } from "./_contract/types";
import { EarthyModernClinical } from "./earthy-modern-clinical/EarthyModernClinical";

export const LANDING_TEMPLATES = {
  "earthy-modern-clinical": EarthyModernClinical,
  // T1 Clinical Luxe · T2 Warm Wellness · T3 Cinematic Sanctuary ·
  // T4 Editorial Bodywork land here as Claude Design delivers them.
} as const satisfies Record<string, ComponentType<TemplateProps>>;

export type LandingTemplateId = keyof typeof LANDING_TEMPLATES;

/** Runtime guard for persisted ids (theme.landingTemplate is untyped JSON). */
export function isLandingTemplateId(value: unknown): value is LandingTemplateId {
  return typeof value === "string" && value in LANDING_TEMPLATES;
}

/**
 * Vertical → template. Keys are lowercased soul `industry` / CRM-personality
 * vertical strings. Seeded with the verticals T5 (Earthy Modern Clinical)
 * covers; extended as T1–T4 arrive. `pickLandingTemplate` falls back to the
 * archetype default, then to T5 as the safe health default.
 */
export const TEMPLATE_BY_VERTICAL: Record<string, LandingTemplateId> = {
  chiropractic: "earthy-modern-clinical",
  chiropractor: "earthy-modern-clinical",
  physiotherapy: "earthy-modern-clinical",
  physical_therapy: "earthy-modern-clinical",
  "physical-therapy": "earthy-modern-clinical",
  "sports-medicine": "earthy-modern-clinical",
  sports_medicine: "earthy-modern-clinical",
  rehab: "earthy-modern-clinical",
  wellness: "earthy-modern-clinical",
};
