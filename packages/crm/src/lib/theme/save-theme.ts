// Core theme-write logic, extracted from saveThemeSettingsAction
// (lib/theme/actions.ts) so it can be called from a NON-server-action
// context — specifically the copilot's update_theme tool, which invokes
// it directly (no FormData, no redirect) from an API route handler.
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
import type { OrgTheme } from "@/lib/theme/types";

const REVALIDATE_PATHS = ["/settings", "/settings/theme", "/l", "/book", "/forms"] as const;

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
  const [org] = await db
    .select({ theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentTheme = normalizeTheme(org?.theme);

  const nextTheme = normalizeTheme({
    ...currentTheme,
    ...patch,
  });

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

  return nextTheme;
}
