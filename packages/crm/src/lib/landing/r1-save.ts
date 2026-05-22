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
  seo: { title: string; description: string; ogImage: string | null };
} | null> {
  // Join landing_pages → organizations to resolve workspace slug → orgId.
  // We can't query landing_pages by workspace slug directly (it doesn't
  // store it), so we query organizations first.
  const { organizations } = await import("@/db/schema");

  const [orgRow] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, workspaceSlug))
    .limit(1);

  if (!orgRow) return null;

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

  const payload = bjson["payload"] as R1LandingPayload | undefined;
  const archetype = bjson["archetype"] as AestheticArchetypeId | undefined;

  if (!payload || !archetype) return null;

  const seoRaw = (row.seo ?? {}) as Record<string, unknown>;
  return {
    payload,
    archetype,
    seo: {
      title: (seoRaw["title"] as string | undefined) ?? payload.footer.businessName,
      description:
        (seoRaw["description"] as string | undefined) ?? payload.hero.subhead,
      ogImage: (seoRaw["ogImage"] as string | null | undefined) ?? null,
    },
  };
}
