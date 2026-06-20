// Decide the best photo for a service: prefer the business's real scraped photo
// (upscaled) when it exists and isn't a tiny thumbnail; otherwise fall back to an
// HD Unsplash photo keyed to the service + vertical. Network (Unsplash) is behind
// an injectable seam so the generator's unit tests stay offline + deterministic.

import { resolveHeroImage } from "@/lib/crm/personality-images";
import { upscaleCdnImageUrl, isLowResImageUrl, isNonPhotoAsset } from "./service-photo";
import type { AestheticArchetypeId } from "@/components/landing-r1/archetypes";

export type ServicePhoto = { src: string; alt: string };

export type StockResolver = (
  query: string,
  ctx: { archetype: AestheticArchetypeId; businessName: string },
) => Promise<{ url: string; alt?: string } | null>;

// Adapter over the existing Unsplash hero resolver.
// resolveHeroImage returns ResolvedUnsplashImage | null, where:
//   .url         — the CDN URL (already HD, 1600×900 params applied)
//   .attribution — { photographer_name, ... } for a VISIBLE photo credit/link
// ResolvedUnsplashImage carries no descriptive alt, so we leave `alt` undefined
// and let resolveServicePhoto supply a descriptive fallback ("<service> —
// <business>"). Attribution is NOT alt text — it belongs in a visible credit.
const defaultStock: StockResolver = async (query, ctx) => {
  const img = await resolveHeroImage(query, {
    archetype: ctx.archetype,
    businessName: ctx.businessName,
  });
  if (!img) return null;
  return { url: img.url, alt: undefined };
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
  // A "usable photo" is present, not a tiny thumbnail, and not a non-photo asset
  // (icon, logo, sprite, favicon, badge, or SVG). Icons/logos scraped into photo
  // fields must NOT block the HD Unsplash fallback.
  const realIsUsablePhoto = real && !isLowResImageUrl(real) && !isNonPhotoAsset(real);
  if (realIsUsablePhoto) {
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
  // Last resort: a low-res-but-real PHOTO is better than nothing.
  // But if the real URL is an icon/logo/SVG, returning it would be worse than a
  // placeholder — return null so the renderer can show a clean empty state.
  if (real && !isNonPhotoAsset(real)) {
    return { src: upscaleCdnImageUrl(real), alt: input.realAlt?.trim() || input.serviceName };
  }
  return null;
}
