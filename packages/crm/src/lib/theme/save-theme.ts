// Core theme-write logic, originally extracted from the settings form's
// server action (lib/theme/actions.ts, since retired) so it could be called
// from a NON-server-action context — specifically the copilot's update_theme
// tool, which invokes it directly (no FormData, no redirect) from an API
// route handler. This is now the only write path.
//
// This file intentionally does NOT have a "use server" directive: a
// "use server" file may only export async functions (see
// scripts/check-use-server.sh), and even though saveThemeForOrg IS an
// async function, keeping the reusable core outside the action module
// keeps the action file focused on FormData parsing + redirect, and lets
// callers import the core without picking up Server Action semantics
// (e.g. the implicit POST-only RPC endpoint Next.js generates for every
// exported "use server" function).

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { normalizeTheme } from "@/lib/theme/normalize-theme";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

const REVALIDATE_PATHS = ["/settings", "/l", "/book", "/forms"] as const;

/** Pure merge step, extracted so the "customizedAt gets stamped and survives
 *  a subsequent partial merge" decision is unit-testable without touching the
 *  database (this repo's DI convention — see voice-r1-tools.spec.ts's PATTERN
 *  NOTE — prefers extracting the pure core over mocking `db`).
 *
 *  Stamps `customizedAt` to "now" on every call: any explicit save (settings
 *  form OR the copilot's update_theme tool) means the operator customized the
 *  theme, so from this point on public renderers should stop applying the
 *  archetype's curated default palette in favor of the org's own colors. */
export function mergeThemePatch(
  currentTheme: OrgTheme,
  patch: Partial<OrgTheme>,
  now: () => Date = () => new Date(),
): OrgTheme {
  return normalizeTheme({
    ...currentTheme,
    ...patch,
    customizedAt: now().toISOString(),
  });
}

/** Read the org's current theme (normalized over defaults), merge `patch`
 *  on top, re-validate the merged result through normalizeTheme (so a
 *  partial/bad patch can never write invalid data), persist it, and
 *  revalidate every public + settings path that reads theme live.
 *
 *  Returns the theme that was actually written (post-normalization) so
 *  callers can report back exactly what took effect. */
export async function saveThemeForOrg(
  orgId: string,
  patch: Partial<OrgTheme>,
): Promise<OrgTheme> {
  // Defensive read: mirrors getThemeSettings's try/catch (lib/theme/actions.ts:28-47)
  // for a stale-schema read (e.g. the `theme` column not yet migrated in this
  // environment). On failure, fall back to DEFAULT_ORG_THEME as the merge base —
  // the write below still proceeds, it just merges `patch` over defaults instead
  // of over an unreadable current theme.
  //
  // SH2-F1 — additive `slug` select alongside `theme` (no new query): the R1
  // public landing route (/w/[slug], subdomain-mirrored at /s/[orgSlug]/...)
  // needs its exact slug-scoped path revalidated the same way
  // clients/[slug]/ready/actions.ts already does for landingTemplate writes —
  // that route renders dynamically per-request (no generateStaticParams /
  // revalidate export), so this is belt-and-suspenders against any RSC cache,
  // matching that file's own comment.
  let org: { theme: unknown; slug: string | null } | undefined;
  try {
    [org] = await db
      .select({ theme: organizations.theme, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  } catch {
    org = { theme: DEFAULT_ORG_THEME, slug: null };
  }

  const currentTheme = normalizeTheme(org?.theme);

  const nextTheme = mergeThemePatch(currentTheme, patch);

  await db
    .update(organizations)
    .set({
      theme: nextTheme,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
  if (org?.slug) {
    revalidatePath(`/w/${org.slug}`);
    // The subdomain catch-all's home branch (proxy-rewritten root → this
    // path — see app/(public)/s/[orgSlug]/[...slug]/page.tsx's isHomePage).
    revalidatePath(`/s/${org.slug}/home`);
  }

  return nextTheme;
}
