"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { addDomain, checkDomainStatus, hasVercelDomainEnv, removeDomain } from "@/lib/domains/vercel-domains";

type DomainSettings = {
  customDomain?: string;
  domainVerified?: boolean;
  domainStatus?: string;
};

function readDomainSettings(raw: unknown): DomainSettings {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const settings = raw as Record<string, unknown>;

  return {
    customDomain: typeof settings.customDomain === "string" ? settings.customDomain : undefined,
    domainVerified: typeof settings.domainVerified === "boolean" ? settings.domainVerified : undefined,
    domainStatus: typeof settings.domainStatus === "string" ? settings.domainStatus : undefined,
  };
}

function normalizeDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function isValidDomain(domain: string) {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

function getErrorMessage(payload: Record<string, unknown>) {
  const error = payload.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return String((error as Record<string, unknown>).message);
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  return "Failed to configure domain";
}

function redirectWithError(message: string) {
  redirect(`/settings/domain?saved=0&error=${encodeURIComponent(message)}`);
}

function resolveDomainVerified(payload: Record<string, unknown>) {
  const config = payload.config;
  if (config && typeof config === "object" && typeof (config as Record<string, unknown>).misconfigured === "boolean") {
    return !(config as Record<string, unknown>).misconfigured;
  }

  if (typeof payload.verified === "boolean") {
    return payload.verified;
  }

  const verification = Array.isArray(payload.verification)
    ? (payload.verification as Array<Record<string, unknown>>)
    : [];

  return verification.some((item) => String(item?.status ?? "").toLowerCase() === "valid");
}

function resolveDomainStatus(payload: Record<string, unknown>) {
  const config = payload.config;
  if (config && typeof config === "object") {
    const configRecord = config as Record<string, unknown>;
    if (typeof configRecord.misconfigured === "boolean") {
      return configRecord.misconfigured ? "DNS misconfigured" : "DNS configured";
    }
  }

  const error = payload.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return String((error as Record<string, unknown>).message);
  }

  const verification = Array.isArray(payload.verification)
    ? (payload.verification as Array<Record<string, unknown>>)
    : [];

  const firstStatus = verification
    .map((item) => String(item?.status ?? "").trim())
    .find((status) => status.length > 0);

  return firstStatus || "Pending DNS verification";
}

export async function getCustomDomainSettings() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const [landing] = await db
    .select({ slug: landingPages.slug })
    .from(landingPages)
    .where(eq(landingPages.orgId, orgId))
    .orderBy(desc(landingPages.updatedAt))
    .limit(1);

  const [bookingTemplate] = await db
    .select({ bookingSlug: bookings.bookingSlug })
    .from(bookings)
    .where(eq(bookings.orgId, orgId))
    .orderBy(desc(bookings.updatedAt))
    .limit(1);

  const [form] = await db
    .select({ slug: intakeForms.slug })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, orgId))
    .orderBy(desc(intakeForms.updatedAt))
    .limit(1);

  const settings = readDomainSettings(org.settings as Record<string, unknown>);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://app.seldonframe.com";

  return {
    orgId,
    orgSlug: org.slug,
    defaultUrls: {
      landing: `${appUrl}/l/${org.slug}/${landing?.slug || "home"}`,
      booking: `${appUrl}/book/${org.slug}/${bookingTemplate?.bookingSlug || "default"}`,
      forms: `${appUrl}/forms/${org.slug}/${form?.slug || "intake"}`,
    },
    customDomain: settings.customDomain || "",
    domainVerified: Boolean(settings.domainVerified),
    domainStatus: settings.domainStatus || "Pending DNS verification",
  };
}

export async function saveCustomDomainAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const intent = String(formData.get("intent") ?? "add").trim();
  const inputDomain = normalizeDomain(String(formData.get("domain") ?? ""));

  const [org] = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const currentSettings = (org.settings as Record<string, unknown>) ?? {};
  const domainSettings = readDomainSettings(currentSettings);

  if (!hasVercelDomainEnv()) {
    redirectWithError(
      "Custom domains require VERCEL_API_TOKEN and VERCEL_PROJECT_ID environment variables. Set them in your Vercel project settings."
    );
  }

  if (intent === "remove") {
    const currentDomain = domainSettings.customDomain;

    if (currentDomain) {
      const removeResult = await removeDomain(currentDomain);
      if (!removeResult.ok) {
        redirectWithError(getErrorMessage(removeResult.data));
      }
    }

    await db
      .update(organizations)
      .set({
        settings: {
          ...currentSettings,
          customDomain: null,
          domainVerified: false,
          domainStatus: "Removed",
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    revalidatePath("/settings");
    revalidatePath("/settings/domain");
    redirect("/settings/domain?saved=1&domainAction=removed");
  }

  const domain = inputDomain || domainSettings.customDomain || "";

  if (!domain) {
    redirectWithError("Please enter a custom domain.");
  }

  if (!isValidDomain(domain)) {
    redirectWithError("Please enter a valid domain or subdomain (for example: crm.example.com).");
  }

  if (intent === "check") {
    const statusResult = await checkDomainStatus(domain);
    const statusPayload = statusResult.data;
    const verified = resolveDomainVerified(statusPayload);
    const status = resolveDomainStatus(statusPayload);

    if (!statusResult.ok) {
      redirectWithError(getErrorMessage(statusPayload));
    }

    await db
      .update(organizations)
      .set({
        settings: {
          ...currentSettings,
          customDomain: domain,
          domainVerified: verified,
          domainStatus: status,
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    revalidatePath("/settings");
    revalidatePath("/settings/domain");
    redirect(`/settings/domain?saved=1&domainAction=checked&verified=${verified ? "1" : "0"}`);
  }

  const addResult = await addDomain(domain);
  if (!addResult.ok) {
    redirectWithError(getErrorMessage(addResult.data));
  }

  const statusResult = await checkDomainStatus(domain);
  const statusPayload = statusResult.data;
  if (!statusResult.ok) {
    redirectWithError(getErrorMessage(statusPayload));
  }

  const addPayload = addResult.data;
  const mergedPayload = { ...addPayload, ...statusPayload };
  const verified = resolveDomainVerified(mergedPayload);
  const status = resolveDomainStatus(mergedPayload);

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        customDomain: domain,
        domainVerified: verified,
        domainStatus: status,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings");
  revalidatePath("/settings/domain");
  redirect(`/settings/domain?saved=1&domainAction=added&verified=${verified ? "1" : "0"}`);
}
