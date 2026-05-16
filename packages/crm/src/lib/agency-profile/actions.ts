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
