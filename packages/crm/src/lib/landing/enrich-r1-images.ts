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

// Ambient (face-free) seed queries for the About portrait + cinematic gallery /
// CTA texture. resolveGalleryImages broadens these and falls back to the
// archetype's curated queries on zero-results, so results always match mood.
const AMBIENT_QUERIES = [
  "serene wellness interior",
  "calm spa space",
  "soft natural light detail",
  "natural stone texture",
  "tranquil treatment room",
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

  // 2. Ambient About portrait + gallery/CTA imagery. All templates render an
  //    About slot; the cinematic template adds a 4-tile gallery + CTA texture.
  //    One batched call: [0] → about, [1..] → gallery.
  const ambient = await resolveGalleryImages(AMBIENT_QUERIES, ctx);
  if (ambient.length > 0) {
    const p = payload as EnrichedPayload;
    p.aboutImage = { src: ambient[0].url };
    if (ambient.length > 1) {
      p.galleryImages = ambient.slice(1).map((a) => ({ src: a.url }));
    }
  }
}
