// packages/crm/src/lib/landing/set-r1-media.ts
//
// Media-editing T1: the canonical write seam for setting a single media
// field (image or video) on an org's r1 landing payload. Used by:
//   - the upload_workspace_image route/tool for r1 workspaces (fixes the
//     previously-broken slug='home' lookup in applyHeroBackground, which
//     silently no-ops for every r1 workspace — see images.ts).
//   - future copilot media-editing tools (T2+).
//
// Content-safe: writes ONLY the targeted media field on the payload —
// nothing else in hero/services/etc. is touched. DI'd load/save/revalidate
// so unit tests need no DB (mirrors set-landing-template-for-org.ts's
// org-id-scoped-write pattern).

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { saveLandingPayload } from "./r1-save";
import type { R1LandingPayload } from "./r1-payload-prompt";

const R1_SLUG = "r1";
const R1_STATUS = "published";

export type R1MediaSlot =
  | "hero_image"
  | "hero_background"
  | "hero_background_video"
  | `service_photo:${number}`;

export interface SetR1MediaInput {
  slot: string;
  src: string;
  alt?: string;
  poster?: string;
}

export type SetR1MediaResult =
  | { ok: true; slot: string }
  | { ok: false; error: string };

export interface SetR1MediaDeps {
  load: (
    orgId: string,
  ) => Promise<{ payload: R1LandingPayload; archetype: AestheticArchetypeId } | null>;
  save: (
    orgId: string,
    payload: R1LandingPayload,
    archetype: AestheticArchetypeId,
  ) => Promise<void>;
  revalidate: (path: string) => void;
}

/** Default DI: loads the r1 row straight from landing_pages, saves via the
 *  shared saveLandingPayload upsert, revalidates the public /w/[slug] path. */
async function defaultLoad(
  orgId: string,
): Promise<{ payload: R1LandingPayload; archetype: AestheticArchetypeId } | null> {
  const [row] = await db
    .select({
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, orgId),
        eq(landingPages.slug, R1_SLUG),
        eq(landingPages.status, R1_STATUS),
      ),
    )
    .limit(1);

  if (!row || !row.blueprintJson) return null;

  const bjson = row.blueprintJson as Record<string, unknown>;
  if (bjson["_r1"] !== true) return null;

  const payload = bjson["payload"] as R1LandingPayload | undefined;
  const archetype = bjson["archetype"] as AestheticArchetypeId | undefined;
  if (!payload || !archetype) return null;

  return { payload, archetype };
}

/** Fire-and-forget: looks up the org's slug and revalidates its public path.
 *  Not awaited by callers (revalidatePath itself is synchronous; the slug
 *  lookup runs in the background so a slow/failed revalidate never blocks
 *  the media write from returning ok:true). */
function defaultRevalidate(orgId: string): void {
  void (async () => {
    const [org] = await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (org?.slug) {
      revalidatePath(`/w/${org.slug}`);
    }
  })();
}

const DEFAULT_DEPS: SetR1MediaDeps = {
  load: defaultLoad,
  save: saveLandingPayload,
  revalidate: defaultRevalidate,
};

const SERVICE_PHOTO_RE = /^service_photo:(\d+)$/;

/**
 * Write a single media field into the org's r1 landing payload. Rejects any
 * slot outside the known set (no write, no save). Bounds-checks
 * service_photo:<index>.
 */
export async function setR1Media(
  orgId: string,
  input: SetR1MediaInput,
  deps: SetR1MediaDeps = DEFAULT_DEPS,
): Promise<SetR1MediaResult> {
  const { slot, src, alt, poster } = input;

  const serviceMatch = SERVICE_PHOTO_RE.exec(slot);
  const isKnownSlot =
    slot === "hero_image" ||
    slot === "hero_background" ||
    slot === "hero_background_video" ||
    serviceMatch !== null;

  if (!isKnownSlot) {
    return { ok: false, error: "unknown_slot" };
  }

  const loaded = await deps.load(orgId);
  if (!loaded) {
    return { ok: false, error: "no_landing_exists" };
  }
  const { payload, archetype } = loaded;

  if (serviceMatch) {
    const index = Number(serviceMatch[1]);
    const services = payload.services?.services ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= services.length) {
      return { ok: false, error: "service_index_out_of_range" };
    }

    const nextServices = services.map((svc, i) =>
      i === index ? { ...svc, photo: { src, alt: alt ?? "" } } : svc,
    );
    const nextPayload: R1LandingPayload = {
      ...payload,
      services: { ...payload.services, services: nextServices },
    };

    await deps.save(orgId, nextPayload, archetype);
    deps.revalidate(orgId);
    return { ok: true, slot };
  }

  let nextHero = payload.hero;
  if (slot === "hero_image") {
    nextHero = { ...payload.hero, heroImage: { src, alt: alt ?? "" } };
  } else if (slot === "hero_background") {
    nextHero = { ...payload.hero, backgroundImage: { src, alt: alt ?? "" } };
  } else if (slot === "hero_background_video") {
    nextHero = { ...payload.hero, backgroundVideo: { src, poster } };
  }

  const nextPayload: R1LandingPayload = { ...payload, hero: nextHero };

  await deps.save(orgId, nextPayload, archetype);
  deps.revalidate(orgId);
  return { ok: true, slot };
}

/**
 * Clear (remove) a single media field from the org's r1 landing payload.
 * Same slot vocabulary + validation as setR1Media — rejects any slot outside
 * the known set (no write, no save), bounds-checks service_photo:<index>.
 * Content-safe: removes ONLY the targeted media field, nothing else.
 */
export async function clearR1Media(
  orgId: string,
  slot: string,
  deps: SetR1MediaDeps = DEFAULT_DEPS,
): Promise<SetR1MediaResult> {
  const serviceMatch = SERVICE_PHOTO_RE.exec(slot);
  const isKnownSlot =
    slot === "hero_image" ||
    slot === "hero_background" ||
    slot === "hero_background_video" ||
    serviceMatch !== null;

  if (!isKnownSlot) {
    return { ok: false, error: "unknown_slot" };
  }

  const loaded = await deps.load(orgId);
  if (!loaded) {
    return { ok: false, error: "no_landing_exists" };
  }
  const { payload, archetype } = loaded;

  if (serviceMatch) {
    const index = Number(serviceMatch[1]);
    const services = payload.services?.services ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= services.length) {
      return { ok: false, error: "service_index_out_of_range" };
    }

    const nextServices = services.map((svc, i) => {
      if (i !== index) return svc;
      const { photo: _photo, ...rest } = svc;
      return rest;
    });
    const nextPayload: R1LandingPayload = {
      ...payload,
      services: { ...payload.services, services: nextServices },
    };

    await deps.save(orgId, nextPayload, archetype);
    deps.revalidate(orgId);
    return { ok: true, slot };
  }

  let nextHero = payload.hero;
  if (slot === "hero_image") {
    const { heroImage: _heroImage, ...rest } = payload.hero;
    nextHero = rest;
  } else if (slot === "hero_background") {
    const { backgroundImage: _backgroundImage, ...rest } = payload.hero;
    nextHero = rest;
  } else if (slot === "hero_background_video") {
    const { backgroundVideo: _backgroundVideo, ...rest } = payload.hero;
    nextHero = rest;
  }

  const nextPayload: R1LandingPayload = { ...payload, hero: nextHero };

  await deps.save(orgId, nextPayload, archetype);
  deps.revalidate(orgId);
  return { ok: true, slot };
}
