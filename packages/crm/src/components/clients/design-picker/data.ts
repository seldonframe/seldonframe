import type { AutoTemplate, DesignId, DesignTemplate, AnyTemplate } from "./types";

// v1 scope: the 5 health & wellness templates. "Auto" resolves server-side via
// the existing archetype system; non-health businesses always fall to Auto.
//
// `thumb` points at the catalog hero thumbnails. Swap for your asset URLs / a
// CDN path; in Next.js you might import them or use <Image> (the components use
// a plain <img> with an onError fallback so a missing thumb degrades gracefully).

export const AUTO: AutoTemplate = {
  id: "auto",
  name: "Auto",
  tagline: "Best fit",
  blurb: "We match the design to the business automatically — recommended for every workspace.",
};

export const DESIGNS: DesignTemplate[] = [
  { id: "earthy-modern-clinical", name: "Earthy Modern Clinical", thumb: "/landing-thumbs/t5.png",
    niche: ["chiro", "physio", "sports med"], swatch: ["#b0552f", "#ece5d8"] },
  { id: "clinical-luxe", name: "Clinical Luxe", thumb: "/landing-thumbs/t1.png",
    niche: ["derm", "medspa", "cosmetic"], swatch: ["#9c7c4d", "#24211c"] },
  { id: "warm-wellness", name: "Warm Wellness", thumb: "/landing-thumbs/t2.png",
    niche: ["prenatal", "women's health", "yoga"], swatch: ["#c2868a", "#faf5f2"] },
  { id: "cinematic-sanctuary", name: "Cinematic Sanctuary", thumb: "/landing-thumbs/t3.png",
    niche: ["spa", "holistic", "acupuncture"], swatch: ["#9a8460", "#1f1b16"] },
  { id: "editorial-bodywork", name: "Editorial Bodywork", thumb: "/landing-thumbs/t4.png",
    niche: ["massage", "bodywork", "recovery"], swatch: ["#7c5440", "#ece3d6"] },
];

// Archetype track — the 8 aesthetic archetypes offered to trades/generic
// (non-health) workspaces. These re-skin the landing-r1 render (palette + font
// + hero variant); switching is content-safe. No thumbnails yet — the picker's
// <Thumb> degrades to a named placeholder, and the swatches carry the color
// cue. Ids/labels/swatches mirror ARCHETYPES in
// lib/workspace/aesthetic-archetypes.ts (kept as a static list so the client
// bundle doesn't pull in the full archetype registry).
export const ARCHETYPE_DESIGNS: DesignTemplate[] = [
  { id: "bold-urgency", name: "Bold Urgency",
    niche: ["emergency HVAC", "plumbing", "electrical"], swatch: ["#cc2d2d", "#1a1a1a"] },
  { id: "editorial-warm", name: "Editorial Warm",
    niche: ["craft trades", "family-owned"], swatch: ["#9c2b1d", "#ece5d8"] },
  { id: "soft-residential", name: "Soft Residential",
    niche: ["cleaning", "landscaping", "lawn"], swatch: ["#3d6e4f", "#f2efe8"] },
  { id: "clinical-trust", name: "Clinical Trust",
    niche: ["medical", "dental", "legal"], swatch: ["#1e3a5f", "#eef2f6"] },
  { id: "cinematic-aspirational", name: "Cinematic Luxe",
    niche: ["medspa", "fitness", "wellness"], swatch: ["#a08562", "#1f1b16"] },
  { id: "technical-restrained", name: "Technical",
    niche: ["agency", "B2B", "SaaS"], swatch: ["#2a2a2a", "#f4f4f5"] },
  { id: "brutalist", name: "Brutalist",
    niche: ["creative studios", "concept-driven"], swatch: ["#0a0a0a", "#f5f5f5"] },
  { id: "midnight-craft", name: "Midnight Craft",
    niche: ["premium dark trades", "design-build"], swatch: ["#34d399", "#0b0f0d"] },
];

const ALL_DESIGNS = [...DESIGNS, ...ARCHETYPE_DESIGNS];

export function templateById(id: DesignId): AnyTemplate {
  if (!id || id === "auto") return AUTO;
  return ALL_DESIGNS.find((d) => d.id === id) || AUTO;
}
