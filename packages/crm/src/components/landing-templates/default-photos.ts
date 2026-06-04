// landing-templates/default-photos.ts
//
// Per-template DEFAULT imagery, sourced from each template's Claude Design
// fixture (hand-picked, on-brand stock). When a workspace's extracted content
// has no photo for a slot, we fill it from these curated defaults instead of a
// blind Unsplash search — so every health/wellness landing looks like the
// DESIGNED template, not a random stock result (an earlier dynamic search
// produced, memorably, a computer-terminal hero for a spa). Real extracted
// photos always win; the defaults only fill the gaps.

import type { Soul } from "./_contract/types";
import type { LandingTemplateId } from "./registry";
import { lumenDermatology } from "./clinical-luxe/fixture";
import { georgiaHart } from "./warm-wellness/fixture";
import { stillwaterSanctuary } from "./cinematic-sanctuary/fixture";
import { palmerBodywork } from "./editorial-bodywork/fixture";
import { austinFamilyChiropractic } from "./earthy-modern-clinical/fixture";

type Photo = NonNullable<Soul["photos"]>[number];
type Role = "hero" | "service" | "about" | "gallery";

/** Curated fixture imagery per template (Claude Design's hand-picked photos). */
const POOLS: Record<LandingTemplateId, Photo[]> = {
  "clinical-luxe": lumenDermatology.photos ?? [],
  "warm-wellness": georgiaHart.photos ?? [],
  "cinematic-sanctuary": stillwaterSanctuary.photos ?? [],
  "editorial-bodywork": palmerBodywork.photos ?? [],
  "earthy-modern-clinical": austinFamilyChiropractic.photos ?? [],
};

const ofRole = (pool: Photo[], role: Role): Photo[] => pool.filter((p) => p.role === role);

/** Gallery tiles the cinematic template renders; harmless for the others. */
const GALLERY_SLOTS = 4;

/**
 * Return `data` with every photo slot the templates render — hero, one per
 * service, about, and gallery×4 — guaranteed filled: real extracted photos
 * first, then the template's curated fixture defaults (cycled when a template
 * needs more slots than the fixture provides). Never throws.
 */
export function withTemplateDefaults(data: Soul, templateId: LandingTemplateId): Soul {
  const pool = POOLS[templateId];
  if (!pool || pool.length === 0) return data;

  const real = data.photos ?? [];
  const realOf = (role: Role): Photo[] => real.filter((p) => p.role === role);

  const poolHero = ofRole(pool, "hero");
  const poolService = ofRole(pool, "service");
  const poolGallery = ofRole(pool, "gallery");
  // Fixtures omit the About portrait by design; fall back to gallery → service.
  const poolAbout = [...ofRole(pool, "about"), ...poolGallery, ...poolService];

  const out: Array<Photo | undefined> = [];

  // hero (1)
  out.push(realOf("hero")[0] ?? poolHero[0] ?? poolService[0]);

  // services — one per offering (min 3); real wins, else cycle the pool.
  const serviceCount = Math.max(data.offerings?.length ?? 0, poolService.length, 3);
  const realServices = realOf("service");
  for (let i = 0; i < serviceCount; i++) {
    out.push(
      realServices[i] ??
        (poolService.length ? { ...poolService[i % poolService.length], role: "service" } : undefined),
    );
  }

  // about (1)
  out.push(
    realOf("about")[0] ?? (poolAbout.length ? { ...poolAbout[0], role: "about" } : undefined),
  );

  // gallery (GALLERY_SLOTS) — real wins, else cycle the gallery pool (or services).
  const realGallery = realOf("gallery");
  const galPool = poolGallery.length ? poolGallery : poolService;
  for (let i = 0; i < GALLERY_SLOTS; i++) {
    out.push(
      realGallery[i] ??
        (galPool.length ? { ...galPool[i % galPool.length], role: "gallery" } : undefined),
    );
  }

  const photos = out.filter((p): p is Photo => Boolean(p && p.url));
  return { ...data, photos };
}
