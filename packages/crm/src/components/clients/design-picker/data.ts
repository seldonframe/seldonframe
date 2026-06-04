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

export function templateById(id: DesignId): AnyTemplate {
  if (!id || id === "auto") return AUTO;
  return DESIGNS.find((d) => d.id === id) || AUTO;
}
