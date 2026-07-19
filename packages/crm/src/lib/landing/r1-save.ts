// packages/crm/src/lib/landing/r1-save.ts
//
// Persistence helpers for the R1 landing payload.
//
// SCHEMA DECISION:
// We extend the existing `landing_pages` table with a new column
// `payload_r1 jsonb`. This avoids creating a parallel table and keeps
// the two systems (old landing-page builder + new R1 generator) in
// the same row. Each workspace gets exactly one R1-type row, identified
// by (orgId, slug='r1'). The old landing system uses slugs like 'home',
// 'landing', etc., so 'r1' is safe and non-colliding.
//
// The column is named `payload_r1` (not `landing_payload_v2`) because
// we're adding it to `landing_pages` (not `organizations`) and the
// convention here is snake_case noun + underscore + qualifier.
// Both names satisfy the "_v2 avoids collision" requirement; `payload_r1`
// is more readable in SQL queries and consistent with the R-framework
// naming used everywhere else.

import { db } from "@/db";
import { landingPages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import type { R1LandingPayload } from "./r1-payload-prompt";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import type { OrgTheme } from "@/lib/theme/types";
import { ARCHETYPES } from "@/lib/workspace/aesthetic-archetypes";
import { applyLiveArchetype } from "./apply-live-archetype";

const R1_SLUG = "r1";
const R1_STATUS = "published"; // public immediately, no gate
const R1_SOURCE = "r1-generator";

/**
 * Upsert the R1 payload into the landing_pages table.
 * One row per workspace, slug='r1'. Idempotent — safe to re-run.
 *
 * 2026-05-22 HOTFIX — was previously `.onConflictDoUpdate(...)` which
 * requires a UNIQUE constraint on (org_id, slug). Migration
 * 0054_landing_r1_unique_slug.sql adds it, but Vercel's migrate-tolerant
 * wrapper soft-fails on migration errors so the constraint may be
 * missing in production (we saw a raw SQL error surface on the UI).
 * Refactored to manual SELECT-then-UPDATE/INSERT so we work regardless
 * of constraint state. Race window is acceptable — workspace creation
 * is single-threaded per workspace, regenerate is user-rate-limited.
 */
export async function saveLandingPayload(
  workspaceId: string,
  payload: R1LandingPayload,
  archetypeId: AestheticArchetypeId,
): Promise<void> {
  const businessName = payload.footer.businessName;
  const tagline = payload.hero.tagline;
  const blueprintJson = {
    _r1: true,
    archetype: archetypeId,
    tagline,
    payload,
  } as unknown as Record<string, unknown>;
  const seo = {
    title: `${businessName} — ${tagline}`,
    description: payload.hero.subhead,
    ogImage: payload.hero.heroImage?.src ?? null,
  } as Record<string, unknown>;

  const [existing] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, workspaceId), eq(landingPages.slug, R1_SLUG)))
    .limit(1);

  if (existing) {
    await db
      .update(landingPages)
      .set({
        title: businessName,
        blueprintJson,
        seo,
        status: R1_STATUS,
        updatedAt: new Date(),
      })
      .where(eq(landingPages.id, existing.id));
    return;
  }

  await db.insert(landingPages).values({
    orgId: workspaceId,
    title: businessName,
    slug: R1_SLUG,
    status: R1_STATUS,
    pageType: "r1-landing",
    source: R1_SOURCE,
    blueprintJson,
    seo,
  });
}

/**
 * Load the R1 payload for a workspace by its slug.
 * Used by the public /w/[slug] route.
 *
 * @returns The payload + metadata, or null if no R1 landing exists.
 */
export async function loadLandingPayload(workspaceSlug: string): Promise<{
  payload: R1LandingPayload;
  archetype: AestheticArchetypeId;
  orgId: string;
  /** Health-templates pilot: id persisted at organizations.theme.landingTemplate
   *  (undefined for every workspace that hasn't opted into a premium template).
   *  Additive — existing callers ignore it and the landing-r1 path is unchanged. */
  landingTemplate: string | undefined;
  /** SH2-F1 — the org's full normalized theme (org row's `theme` column was
   *  already selected below for `landingTemplate`; this is purely additive,
   *  no new query). Callers pass it to SiteShell so a user-customized
   *  accentColor/primaryColor (gated on theme.customizedAt) actually renders
   *  on the public site. */
  theme: OrgTheme;
  seo: { title: string; description: string; ogImage: string | null };
  /** Task 8 (noindex unclaimed anonymous builds): null until a user claims
   *  the workspace via signup. */
  ownerId: string | null;
  /** Task 8: carries organizations.settings.origin — WEB_UNGATED_ORIGIN marks
   *  workspaces created anonymously via the web paste-box flow. */
  settings: Record<string, unknown>;
} | null> {
  // Join landing_pages → organizations to resolve workspace slug → orgId.
  // We can't query landing_pages by workspace slug directly (it doesn't
  // store it), so we query organizations first.
  const { organizations } = await import("@/db/schema");

  const [orgRow] = await db
    .select({
      id: organizations.id,
      theme: organizations.theme,
      ownerId: organizations.ownerId,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.slug, workspaceSlug))
    .limit(1);

  if (!orgRow) return null;

  // theme is jsonb typed as OrgTheme; landingTemplate is an optional string.
  const landingTemplate =
    typeof orgRow.theme?.landingTemplate === "string"
      ? orgRow.theme.landingTemplate
      : undefined;
  const theme = normalizeTheme(orgRow.theme);

  const [row] = await db
    .select({
      blueprintJson: landingPages.blueprintJson,
      seo: landingPages.seo,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, orgRow.id),
        eq(landingPages.slug, R1_SLUG),
        eq(landingPages.status, R1_STATUS),
      ),
    )
    .limit(1);

  if (!row || !row.blueprintJson) return null;

  const bjson = row.blueprintJson as Record<string, unknown>;
  if (bjson["_r1"] !== true) return null;

  const payloadRaw = bjson["payload"] as R1LandingPayload | undefined;
  const archetypeRaw = bjson["archetype"] as AestheticArchetypeId | undefined;

  if (!payloadRaw || !archetypeRaw) return null;

  // 2026-07-15 — LIVE ARCHETYPE AT THE SOURCE: the payload freezes the
  // archetype into many fields at generation time (top-level + per-section),
  // but the design picker / SeldonChat's update_design only ever write
  // theme.aestheticArchetype. Normalize here, once, so EVERY consumer of
  // loadLandingPayload (both public routes, and any future one) re-skins
  // uniformly instead of relying on each render site to override its own
  // field (that per-route drift was the bug — see
  // docs/superpowers/specs/2026-07-15-live-archetype-at-source-design.md).
  // The frozen payload value remains the fallback when the org theme has no
  // archetype yet (pre-1.54 workspaces) or already matches — no-op either way.
  const liveArchetype = theme.aestheticArchetype;
  const hasLiveOverride =
    typeof liveArchetype === "string" &&
    liveArchetype in ARCHETYPES &&
    liveArchetype !== archetypeRaw;

  const payload = hasLiveOverride
    ? applyLiveArchetype(payloadRaw, liveArchetype)
    : payloadRaw;
  const archetype = hasLiveOverride
    ? (liveArchetype as AestheticArchetypeId)
    : archetypeRaw;

  const seoRaw = (row.seo ?? {}) as Record<string, unknown>;
  return {
    payload,
    archetype,
    orgId: orgRow.id,
    landingTemplate,
    theme,
    ownerId: orgRow.ownerId,
    settings: orgRow.settings,
    seo: {
      title: (seoRaw["title"] as string | undefined) ?? payload.footer.businessName,
      description:
        (seoRaw["description"] as string | undefined) ?? payload.hero.subhead,
      ogImage: (seoRaw["ogImage"] as string | null | undefined) ?? null,
    },
  };
}
