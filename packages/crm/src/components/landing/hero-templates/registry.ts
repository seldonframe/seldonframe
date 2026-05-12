// v1.43.0 — Hero template registry.
//
// Maps `HeroTemplateId` (a string the LLM puts in the hero JSON payload)
// to its React component. The hero block's renderer reads `props.template`,
// looks it up here, and dispatches.
//
// Adding a new template = (1) add the component file under
// `hero-templates/<id>/`, (2) add a SKILL.md fragment under
// `blocks/hero/templates/<id>.md`, (3) add the entry below. No other
// codebase changes — the LLM picker reads the SKILL.md fragments, the
// renderer reads this map, the archetype config reads the ID.
//
// Antifragility: smarter Claude → better picks from the same registry.
// The registry itself is mechanical (no LLM call here).

import type { ComponentType } from "react";
import type { HeroSectionContent } from "../sections/types";
import { HeroCinematicAura } from "../sections/hero-cinematic-aura";
import { HeroViktorLight } from "./viktor-light/HeroViktorLight";
import { HeroVelorahEditorial } from "./velorah-editorial/HeroVelorahEditorial";
import { HeroNexoraLight } from "./nexora-light/HeroNexoraLight";
import { HeroSecurifyBold } from "./securify-bold/HeroSecurifyBold";
import { HeroStellarTabsWhite } from "./stellar-tabs-white/HeroStellarTabsWhite";

export const HERO_TEMPLATES = {
  "cinematic-aura": HeroCinematicAura,
  "viktor-light": HeroViktorLight,
  "velorah-editorial": HeroVelorahEditorial,
  "nexora-light": HeroNexoraLight,
  "securify-bold": HeroSecurifyBold,
  "stellar-tabs-white": HeroStellarTabsWhite,
} as const satisfies Record<string, ComponentType<HeroSectionContent>>;

export type HeroTemplateId = keyof typeof HERO_TEMPLATES;

/** Type guard for runtime LLM payloads (string from JSON → typed ID). */
export function isHeroTemplateId(value: unknown): value is HeroTemplateId {
  return typeof value === "string" && value in HERO_TEMPLATES;
}
