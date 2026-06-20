// Decide the best photo for a service: prefer the business's real scraped photo
// (upscaled) when it exists and isn't a tiny thumbnail; otherwise fall back to an
// HD Unsplash photo keyed to the service + vertical. Network (Unsplash) is behind
// an injectable seam so the generator's unit tests stay offline + deterministic.

import { resolveHeroImage } from "@/lib/crm/personality-images";
import { upscaleCdnImageUrl, isLowResImageUrl } from "./service-photo";
import type { AestheticArchetypeId } from "@/components/landing-r1/archetypes";

export type ServicePhoto = { src: string; alt: string };

export type StockResolver = (
  query: string,
  ctx: { archetype: AestheticArchetypeId; businessName: string },
) => Promise<{ url: string; alt?: string } | null>;

// Adapter over the existing Unsplash hero resolver.
// resolveHeroImage returns ResolvedUnsplashImage | null, where:
//   .url         — the CDN URL (already HD, 1600×900 params applied)
//   .attribution — { photographer_name, photographer_username, photographer_url, photo_id }
// There is no .alt on ResolvedUnsplashImage; we derive a usable alt from
// photographer_name so callers downstream get attribution-quality alt text.
const defaultStock: StockResolver = async (query, ctx) => {
  const img = await resolveHeroImage(query, {
    archetype: ctx.archetype,
    businessName: ctx.businessName,
  });
  if (!img) return null;
  return {
    url: img.url,
    alt: img.attribution.photographer_name
      ? `Photo by ${img.attribution.photographer_name} on Unsplash`
      : undefined,
  };
};

export async function resolveServicePhoto(input: {
  realSrc?: string | null;
  realAlt?: string | null;
  serviceName: string;
  vertical: string;
  archetype: AestheticArchetypeId;
  businessName: string;
  stock?: StockResolver; // DI seam (tests inject a fake)
}): Promise<ServicePhoto | null> {
  const real = (input.realSrc ?? "").trim();
  // Prefer real when present AND not a tiny thumbnail.
  if (real && !isLowResImageUrl(real)) {
    return { src: upscaleCdnImageUrl(real), alt: input.realAlt?.trim() || input.serviceName };
  }
  // Fallback: HD stock keyed to service + vertical (graceful null on failure/rate-limit).
  const stock = input.stock ?? defaultStock;
  try {
    const hit = await stock(`${input.serviceName} ${input.vertical}`.trim(), {
      archetype: input.archetype,
      businessName: input.businessName,
    });
    if (hit?.url) return { src: hit.url, alt: hit.alt || `${input.serviceName} — ${input.businessName}` };
  } catch {
    /* rate-limited / network — degrade */
  }
  // Last resort: an upscaled real (even if small) beats nothing; else null (placeholder).
  return real ? { src: upscaleCdnImageUrl(real), alt: input.realAlt?.trim() || input.serviceName } : null;
}
