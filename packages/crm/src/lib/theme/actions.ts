"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import type { OrgTheme } from "@/lib/theme/types";
import { normalizeTheme } from "@/lib/theme/normalize-theme";

export async function getThemeSettings() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  let org:
    | {
        id: string;
        name: string;
        theme: unknown;
      }
    | undefined;

  try {
    [org] = await db
      .select({ id: organizations.id, name: organizations.name, theme: organizations.theme })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  } catch {
    const [fallbackOrg] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    org = fallbackOrg
      ? {
          ...fallbackOrg,
          theme: null,
        }
      : undefined;
  }

  if (!org) {
    return null;
  }

  return {
    orgId,
    orgName: org.name,
    theme: normalizeTheme(org.theme),
  };
}

export async function getPublicOrgThemeBySlug(orgSlug: string): Promise<OrgTheme> {
  let org:
    | {
        theme: unknown;
      }
    | undefined;

  try {
    [org] = await db
      .select({ theme: organizations.theme })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1);
  } catch {
    org = { theme: null };
  }

  return normalizeTheme(org?.theme);
}

export async function getPublicOrgThemeById(orgId: string): Promise<OrgTheme> {
  let org:
    | {
        theme: unknown;
      }
    | undefined;

  try {
    [org] = await db
      .select({ theme: organizations.theme })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
  } catch {
    org = { theme: null };
  }

  return normalizeTheme(org?.theme);
}

export async function saveThemeSettingsAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const primaryColor = String(formData.get("primaryColor") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  const fontFamily = String(formData.get("fontFamily") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const borderRadius = String(formData.get("borderRadius") ?? "").trim();
  const logoUrlInput = String(formData.get("logoUrl") ?? "").trim();

  const nextTheme = normalizeTheme({
    primaryColor,
    accentColor,
    fontFamily,
    mode,
    borderRadius,
    logoUrl: logoUrlInput || null,
  });

  await db
    .update(organizations)
    .set({
      theme: nextTheme,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings");
  revalidatePath("/settings/theme");
  revalidatePath("/l");
  revalidatePath("/book");
  revalidatePath("/forms");

  redirect("/settings/theme?saved=1");
}
