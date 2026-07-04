// packages/crm/src/lib/landing/public-workspace.ts
//
// Public, slug-keyed lookup of the bits of a workspace the /w/[slug] route
// needs to render a registered landing template DIRECTLY from the workspace's
// raw `organizations.soul` jsonb — used when no r1 landing payload exists yet.
//
// This is the soul-first counterpart to r1-save.ts's loadLandingPayload():
//   • loadLandingPayload → the r1 landing_pages row (preferred when present).
//   • getWorkspaceTemplateContext → the org's id + raw soul + theme, so the
//     route can fall back to submittedSoulToTemplateData(soul) and still pick a
//     template via theme.landingTemplate / theme.aestheticArchetype.
//
// No auth — these are public marketing pages. Returns null when the slug
// doesn't resolve to a workspace (the route turns that into notFound()).

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Resolve a workspace slug → the org id, its raw `soul` jsonb (untyped on
 * purpose — the caller maps it defensively via submittedSoulToTemplateData),
 * and the slice of `theme` that drives template selection.
 *
 * @returns `{ orgId, soul, theme }` or null when no organization has that slug.
 */
export async function getWorkspaceTemplateContext(slug: string): Promise<{
  orgId: string;
  soul: unknown;
  theme: { landingTemplate?: string; aestheticArchetype?: string } | null;
  /** Task 8 (noindex unclaimed anonymous builds): null until a user claims
   *  the workspace via signup. */
  ownerId: string | null;
  /** Task 8: carries organizations.settings.origin — WEB_UNGATED_ORIGIN marks
   *  workspaces created anonymously via the web paste-box flow. */
  settings: Record<string, unknown>;
} | null> {
  const [row] = await db
    .select({
      id: organizations.id,
      soul: organizations.soul,
      theme: organizations.theme,
      ownerId: organizations.ownerId,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!row) return null;

  // theme is jsonb (OrgTheme); landingTemplate / aestheticArchetype are
  // optional. Normalize to plain optional strings for the route's use.
  const theme = row.theme
    ? {
        ...(typeof row.theme.landingTemplate === "string"
          ? { landingTemplate: row.theme.landingTemplate }
          : {}),
        ...(typeof row.theme.aestheticArchetype === "string"
          ? { aestheticArchetype: row.theme.aestheticArchetype }
          : {}),
      }
    : null;

  return { orgId: row.id, soul: row.soul, theme, ownerId: row.ownerId, settings: row.settings };
}
