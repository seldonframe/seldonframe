// lib/landing/enrich-r1-images.ts
//
// Fill the r1 landing payload's service entries with curated Unsplash images so
// the premium health/wellness templates render real photography in their
// service slots instead of themed placeholders.
//
// Why here: the template mapper (r1PayloadToTemplateData) already reads
// `service.image` defensively, so populating those URLs on the payload flows
// straight through to every template with NO mapper/dispatch change. We persist
// the enriched payload, so /w/[slug] renders the photos with no per-request
// image fetch.
//
// Best-effort + non-fatal:
//   • No UNSPLASH_ACCESS_KEY → resolveGalleryImages returns [] → no-op.
//   • A slot that can't resolve (even after the archetype-curated fallback) is
//     left without an image → the template renders its themed placeholder.
//   • resolveGalleryImages dedupes by photo id, so N services don't all show the
//     same stock photo.

import { resolveGalleryImages } from "@/lib/crm/personality-images";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import type { R1LandingPayload } from "./r1-payload-prompt";

export async function enrichR1ServiceImages(
  payload: R1LandingPayload,
  ctx: { archetype: AestheticArchetypeId; businessName: string },
): Promise<void> {
  const services = payload?.services?.services;
  if (!Array.isArray(services) || services.length === 0) return;

  // One query per service, derived from its name; the resolver broadens niche
  // terms and falls back to the archetype's curated queries on zero-results.
  const queries = services.map((s) =>
    typeof s?.name === "string" && s.name.trim() ? s.name.trim() : "wellness treatment",
  );

  const images = await resolveGalleryImages(queries, ctx);

  // Assign in slot order. resolveGalleryImages returns results in query order
  // (with the archetype fallback this is one-per-slot in practice); we fill what
  // we got and leave the rest to the template placeholder.
  for (let i = 0; i < images.length && i < services.length; i++) {
    (services[i] as { image?: string }).image = images[i].url;
  }
}
