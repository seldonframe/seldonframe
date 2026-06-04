// lib/landing/enrich-r1-images.ts
//
// Fill the r1 landing payload with curated Unsplash imagery so the premium
// health/wellness templates render real photography instead of themed
// placeholders:
//   • service slots          → service.image          (role "service")
//   • About portrait         → payload.aboutImage     (role "about")
//   • Cinematic gallery + CTA → payload.galleryImages (role "gallery")
//
// The mapper (r1PayloadToTemplateData) reads all three defensively, so
// populating them flows straight through to every template with NO mapper/
// dispatch change. We persist the enriched payload, so /w/[slug] renders the
// photos with no per-request image fetch.
//
// The About + gallery fills are deliberately AMBIENT (interiors, details,
// textures) rather than people: we never drop a random, mismatched stock face
// into a business's "practitioner portrait" slot — Claude Design flagged that
// exact risk. Ambient imagery reads beautifully there and is safe across every
// vertical.
//
// Best-effort + non-fatal:
//   • No UNSPLASH_ACCESS_KEY → resolveGalleryImages returns [] → slots keep
//     their themed placeholder.
//   • resolveGalleryImages dedupes by photo id, so slots don't repeat one stock
//     photo, and falls back to the archetype's curated queries on zero-results.

import { resolveGalleryImages } from "@/lib/crm/personality-images";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import type { R1LandingPayload } from "./r1-payload-prompt";

/** Extra image fields written onto the persisted payload JSON. The base
 *  R1LandingPayload type doesn't declare them; the mapper reads them
 *  defensively (same pattern as service.image). */
type EnrichedPayload = R1LandingPayload & {
  aboutImage?: { src: string };
  galleryImages?: Array<{ src: string }>;
};

// Ambient (face-free) seed queries for the hero (fallback only), the About
// portrait, and the cinematic gallery / CTA texture. resolveGalleryImages
// broadens these and falls back to the archetype's curated queries on
// zero-results, so results always match the workspace's mood. Index 0 is the
// strongest, hero-worthy shot — used only when extraction captured no hero.
const AMBIENT_QUERIES = [
  "luxury spa interior",
  "serene wellness space",
  "soft natural light detail",
  "natural stone texture",
  "tranquil treatment room",
  "calm botanical detail",
];

export async function enrichR1TemplateImages(
  payload: R1LandingPayload,
  ctx: { archetype: AestheticArchetypeId; businessName: string },
): Promise<void> {
  // 1. Per-service photography — one query per service, name-derived; the
  //    resolver broadens niche terms + falls back to the archetype curated set.
  const services = payload?.services?.services;
  if (Array.isArray(services) && services.length > 0) {
    const queries = services.map((s) =>
      typeof s?.name === "string" && s.name.trim() ? s.name.trim() : "wellness treatment",
    );
    const images = await resolveGalleryImages(queries, ctx);
    for (let i = 0; i < images.length && i < services.length; i++) {
      (services[i] as { image?: string }).image = images[i].url;
    }
  }

  // 2. Hero (fallback) + ambient About portrait + gallery/CTA imagery. The hero
  //    normally comes from extraction; paste-mode / imageless sites have none,
  //    leaving the most important above-the-fold slot empty. All templates
  //    render an About slot; the cinematic template adds a gallery + CTA texture.
  //    One batched call, allocated in order: [hero?] → about → gallery.
  const ambient = await resolveGalleryImages(AMBIENT_QUERIES, ctx);
  if (ambient.length > 0) {
    const p = payload as EnrichedPayload;
    let i = 0;

    // Hero — ONLY when extraction didn't capture one (never overwrite a real
    // brand photo). hero.heroImage is the field the mapper reads → role "hero".
    const heroSec = p.hero as { heroImage?: { src?: string; alt?: string } } | undefined;
    const hasHero =
      typeof heroSec?.heroImage?.src === "string" && heroSec.heroImage.src.trim().length > 0;
    if (!hasHero && heroSec && ambient[i]) {
      heroSec.heroImage = { src: ambient[i].url };
      i++;
    }

    if (ambient[i]) {
      p.aboutImage = { src: ambient[i].url };
      i++;
    }
    const gallery = ambient.slice(i).map((a) => ({ src: a.url }));
    if (gallery.length) p.galleryImages = gallery;
  }
}
