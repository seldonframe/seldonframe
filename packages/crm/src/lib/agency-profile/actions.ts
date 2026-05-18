"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AgencyProfile } from "@/db/schema/agency-profile";
import {
  runSaveAgencyProfile,
  type RunSaveAgencyProfileResult,
} from "./run-save";
// 2026-05-18 — sync the saved profile to partner_agencies so the
// existing white-label chrome substitution (getEffectiveBrandingForWorkspace)
// returns the operator's logo / color / name for every workspace they own.
// Without this, /settings/agency-profile is a dead control panel — the
// data is stored but no public surface reads it.
import { syncAgencyProfileToPartnerAgency } from "./sync-to-partner-agency";

export type { AgencyProfile } from "@/db/schema/agency-profile";

export type SaveResult = RunSaveAgencyProfileResult;

/**
 * Read the current user's agency_profile JSONB. Returns null only if
 * there's no session; an authenticated user with an empty/unset column
 * gets an empty object so the caller can spread defaults safely.
 */
export async function getAgencyProfile(): Promise<AgencyProfile | null> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) return null;

  const [row] = await db
    .select({ profile: users.agencyProfile })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return (row?.profile as AgencyProfile | null) ?? {};
}

/**
 * Server action — validates the form payload, writes the JSONB column,
 * and revalidates the page. Returns a structured result; the form
 * component renders the error string inline.
 */
export async function saveAgencyProfile(formData: FormData): Promise<SaveResult> {
  const session = await auth();
  const sessionUser = session?.user?.id ? { id: session.user.id } : null;

  const result = await runSaveAgencyProfile({
    formData,
    sessionUser,
    deps: {
      updateUserAgencyProfile: async ({ userId, profile }) => {
        await db.update(users).set({ agencyProfile: profile }).where(eq(users.id, userId));
      },
    },
  });

  if (result.ok) {
    // 2026-05-18 — agency-wide white-label sync. Non-fatal — if this
    // fails (e.g. slug collision under a race), the user-profile
    // write still landed; chrome substitution catches up on the
    // next save. We swallow + log rather than failing the user-
    // visible save.
    if (sessionUser?.id) {
      try {
        const syncResult = await syncAgencyProfileToPartnerAgency({
          userId: sessionUser.id,
          profile: result.profile,
        });
        if (!syncResult.ok) {
          console.warn(
            JSON.stringify({
              event: "agency_profile.partner_sync_failed",
              user_id: sessionUser.id,
              error: syncResult.error,
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              event: "agency_profile.partner_sync_ok",
              user_id: sessionUser.id,
              agency_id: syncResult.agencyId,
              attached_workspaces: syncResult.attachedWorkspaces,
              created: syncResult.created,
            }),
          );
          // Revalidate /clients so the agency's workspace list picks
          // up any newly-attached parent_agency_id pointers. Also
          // revalidate /book + /forms + /l so chrome substitution
          // re-renders with the new branding.
          revalidatePath("/clients");
          revalidatePath("/book");
          revalidatePath("/forms");
          revalidatePath("/l");
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "agency_profile.partner_sync_threw",
            user_id: sessionUser.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }

    revalidatePath("/settings/agency-profile");
  }

  return result;
}

/**
 * `<form action={…}>` adapter — throws on failure so React surfaces the
 * error in the boundary. The form component uses {@link saveAgencyProfile}
 * directly so it can render the validation error inline; this adapter
 * exists for callers that prefer throw-on-failure semantics.
 */
export async function saveAgencyProfileAction(formData: FormData): Promise<void> {
  const result = await saveAgencyProfile(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
