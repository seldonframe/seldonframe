// landing-templates/registry.ts
//
// Registry of the five premium Claude Design full-page health/wellness
// landing templates. Each is a self-contained package under
// `landing-templates/<id>/` exporting a component with the shared
// `({ data, ctas, theme }) => JSX` signature (see `_contract/types.ts`).
//
// Adding a template = (1) drop the package under `<id>/`, (2) add the
// entry below, (3) map the relevant verticals in TEMPLATE_BY_VERTICAL.
// The `/w/[slug]` route reads this map to dispatch; nothing else changes.

import type { ComponentType } from "react";
import type { TemplateProps } from "./_contract/types";
import { ClinicalLuxe } from "./clinical-luxe/ClinicalLuxe";
import { WarmWellness } from "./warm-wellness/WarmWellness";
import { CinematicSanctuary } from "./cinematic-sanctuary/CinematicSanctuary";
import { EditorialBodywork } from "./editorial-bodywork/EditorialBodywork";
import { EarthyModernClinical } from "./earthy-modern-clinical/EarthyModernClinical";

export const LANDING_TEMPLATES = {
  "clinical-luxe": ClinicalLuxe, // T1 — derm / med-spa / cosmetic
  "warm-wellness": WarmWellness, // T2 — prenatal / women's health / coaching
  "cinematic-sanctuary": CinematicSanctuary, // T3 — spa / holistic / osteopathy
  "editorial-bodywork": EditorialBodywork, // T4 — massage / bodywork / recovery
  "earthy-modern-clinical": EarthyModernClinical, // T5 — chiro / physio (workhorse)
} as const satisfies Record<string, ComponentType<TemplateProps>>;

export type LandingTemplateId = keyof typeof LANDING_TEMPLATES;

/** Runtime guard for persisted ids (theme.landingTemplate is untyped JSON). */
export function isLandingTemplateId(value: unknown): value is LandingTemplateId {
  return typeof value === "string" && value in LANDING_TEMPLATES;
}

/** The safe default when a health business doesn't clearly fit a niche. */
export const DEFAULT_HEALTH_TEMPLATE: LandingTemplateId = "earthy-modern-clinical";

/**
 * Vertical → template. Keys are lowercased soul `industry` / CRM-personality
 * vertical strings. `pickLandingTemplate` (creation pipeline, Phase 2) reads
 * this first, then falls back to the archetype default, then to
 * DEFAULT_HEALTH_TEMPLATE.
 */
export const TEMPLATE_BY_VERTICAL: Record<string, LandingTemplateId> = {
  // T1 — Clinical Luxe
  dermatology: "clinical-luxe",
  derm: "clinical-luxe",
  "med-spa": "clinical-luxe",
  medspa: "clinical-luxe",
  "medical-spa": "clinical-luxe",
  cosmetic: "clinical-luxe",
  aesthetics: "clinical-luxe",
  aesthetic: "clinical-luxe",
  dermatologist: "clinical-luxe",
  skincare: "clinical-luxe",
  // T2 — Warm Wellness
  prenatal: "warm-wellness",
  postnatal: "warm-wellness",
  "womens-health": "warm-wellness",
  "women's-health": "warm-wellness",
  maternity: "warm-wellness",
  pilates: "warm-wellness",
  yoga: "warm-wellness",
  fitness: "warm-wellness",
  coaching: "warm-wellness",
  // T3 — Cinematic Sanctuary
  spa: "cinematic-sanctuary",
  holistic: "cinematic-sanctuary",
  osteopathy: "cinematic-sanctuary",
  osteopath: "cinematic-sanctuary",
  osteopathic: "cinematic-sanctuary",
  acupuncture: "cinematic-sanctuary",
  "functional-medicine": "cinematic-sanctuary",
  sanctuary: "cinematic-sanctuary",
  retreat: "cinematic-sanctuary",
  // T4 — Editorial Bodywork
  massage: "editorial-bodywork",
  "massage-therapy": "editorial-bodywork",
  bodywork: "editorial-bodywork",
  recovery: "editorial-bodywork",
  // T5 — Earthy Modern Clinical (workhorse)
  chiropractic: "earthy-modern-clinical",
  chiropractor: "earthy-modern-clinical",
  physiotherapy: "earthy-modern-clinical",
  physical_therapy: "earthy-modern-clinical",
  "physical-therapy": "earthy-modern-clinical",
  physio: "earthy-modern-clinical",
  "sports-medicine": "earthy-modern-clinical",
  sports_medicine: "earthy-modern-clinical",
  rehab: "earthy-modern-clinical",
  wellness: "earthy-modern-clinical",
};
