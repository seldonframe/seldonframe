"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { canRemoveBranding, resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { assertWritable } from "@/lib/demo/server";

type BrandingSettings = {
  removePoweredBy?: boolean;
  publicBrandName?: string;
  logoUrl?: string;
  primaryColor?: string;
};

function readBrandingSettings(raw: unknown): BrandingSettings {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const settings = raw as Record<string, unknown>;
  const branding = settings.branding;

  if (!branding || typeof branding !== "object") {
    return {};
  }

  const value = branding as Record<string, unknown>;

  return {
    removePoweredBy: typeof value.removePoweredBy === "boolean" ? value.removePoweredBy : undefined,
    publicBrandName: typeof value.publicBrandName === "string" ? value.publicBrandName : undefined,
    logoUrl: typeof value.logoUrl === "string" ? value.logoUrl : undefined,
    primaryColor: typeof value.primaryColor === "string" ? value.primaryColor : undefined,
  };
}

export async function getBrandingSettings() {
  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    return null;
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const branding = readBrandingSettings(org.settings as Record<string, unknown>);
  const plan = resolvePlanFromPlanId(user.planId ?? null);
  const canHideBadge = canRemoveBranding(plan);

  return {
    orgId,
    orgName: org.name,
    canHideBadge,
    removePoweredBy: canHideBadge ? Boolean(branding.removePoweredBy ?? true) : false,
    publicBrandName: branding.publicBrandName || org.name,
    logoUrl: branding.logoUrl || "",
    primaryColor: branding.primaryColor || "",
  };
}

export async function saveBrandingSettingsAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ settings: organizations.settings, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const existingSettings = (org.settings as Record<string, unknown>) ?? {};
  const existingBranding = readBrandingSettings(existingSettings);

  const plan = resolvePlanFromPlanId(user.planId ?? null);
  const canHideBadge = canRemoveBranding(plan);

  const removePoweredBy = canHideBadge ? String(formData.get("removePoweredBy") ?? "") === "on" : false;
  const publicBrandName = String(formData.get("publicBrandName") ?? "").trim() || org.name;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const primaryColor = String(formData.get("primaryColor") ?? "").trim();

  await db
    .update(organizations)
    .set({
      settings: {
        ...existingSettings,
        branding: {
          ...existingBranding,
          removePoweredBy,
          publicBrandName,
          logoUrl,
          primaryColor,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings");
  revalidatePath("/settings/branding");
  revalidatePath("/l");
  revalidatePath("/book");
  revalidatePath("/forms");

  redirect("/settings/branding?saved=1");
}
