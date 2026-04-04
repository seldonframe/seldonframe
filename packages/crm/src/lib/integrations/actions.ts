"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, type OrganizationIntegrations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { decryptValue, encryptValue, redactApiKey } from "@/lib/encryption";

type IntegrationService = "twilio" | "resend" | "kit" | "google";

type IntegrationViewModel = {
  orgId: string;
  orgName: string;
  twilio: { connected: boolean; accountSid: string; fromNumber: string; authTokenHint: string };
  resend: { connected: boolean; fromEmail: string; fromName: string; apiKeyHint: string };
  kit: { connected: boolean; apiKeyHint: string };
  google: { calendarConnected: boolean };
};

function readIntegrations(raw: unknown): OrganizationIntegrations {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as OrganizationIntegrations;
}

function tryDecrypt(value: string | undefined) {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  return decryptValue(value);
}

function serializeResult(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  return query.toString();
}

export async function getIntegrationSettings(): Promise<IntegrationViewModel | null> {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const integrations = readIntegrations(org.integrations);
  const twilioToken = tryDecrypt(integrations.twilio?.authToken);
  const resendKey = tryDecrypt(integrations.resend?.apiKey);
  const kitKey = tryDecrypt(integrations.kit?.apiKey);

  return {
    orgId: org.id,
    orgName: org.name,
    twilio: {
      connected: Boolean(integrations.twilio?.connected),
      accountSid: integrations.twilio?.accountSid ?? "",
      fromNumber: integrations.twilio?.fromNumber ?? "",
      authTokenHint: twilioToken ? "••••••••" : "",
    },
    resend: {
      connected: Boolean(integrations.resend?.connected),
      fromEmail: integrations.resend?.fromEmail ?? "",
      fromName: integrations.resend?.fromName ?? org.name,
      apiKeyHint: redactApiKey(resendKey),
    },
    kit: {
      connected: Boolean(integrations.kit?.connected),
      apiKeyHint: redactApiKey(kitKey),
    },
    google: {
      calendarConnected: Boolean(integrations.google?.calendarConnected),
    },
  };
}

export async function updateIntegration(orgId: string, service: string, credentials: Record<string, string>) {
  const integrationService = service as IntegrationService;

  if (!["twilio", "resend", "kit", "google"].includes(integrationService)) {
    throw new Error("Invalid integration service");
  }

  const [org] = await db
    .select({ id: organizations.id, integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const integrations = readIntegrations(org.integrations);

  if (integrationService === "twilio") {
    const existingToken = tryDecrypt(integrations.twilio?.authToken);
    const authToken = credentials.authToken?.trim() || existingToken;

    integrations.twilio = {
      accountSid: credentials.accountSid?.trim() || integrations.twilio?.accountSid || "",
      authToken: authToken ? encryptValue(authToken) : "",
      fromNumber: credentials.fromNumber?.trim() || integrations.twilio?.fromNumber || "",
      connected: Boolean((credentials.accountSid?.trim() || integrations.twilio?.accountSid) && authToken),
    };
  }

  if (integrationService === "resend") {
    const existingKey = tryDecrypt(integrations.resend?.apiKey);
    const apiKey = credentials.apiKey?.trim() || existingKey;

    integrations.resend = {
      apiKey: apiKey ? encryptValue(apiKey) : "",
      fromEmail: credentials.fromEmail?.trim() || integrations.resend?.fromEmail || "",
      fromName: credentials.fromName?.trim() || integrations.resend?.fromName || "",
      connected: Boolean(apiKey),
    };
  }

  if (integrationService === "kit") {
    const existingKey = tryDecrypt(integrations.kit?.apiKey);
    const apiKey = credentials.apiKey?.trim() || existingKey;

    integrations.kit = {
      apiKey: apiKey ? encryptValue(apiKey) : "",
      connected: Boolean(apiKey),
    };
  }

  if (integrationService === "google") {
    integrations.google = {
      calendarConnected: credentials.calendarConnected === "true" || integrations.google?.calendarConnected || false,
    };
  }

  await db
    .update(organizations)
    .set({ integrations, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  revalidatePath("/settings/integrations");
}

export async function updateIntegrationAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const service = String(formData.get("service") ?? "").trim();

  if (!service) {
    throw new Error("Missing integration service");
  }

  await updateIntegration(orgId, service, {
    accountSid: String(formData.get("accountSid") ?? ""),
    authToken: String(formData.get("authToken") ?? ""),
    fromNumber: String(formData.get("fromNumber") ?? ""),
    apiKey: String(formData.get("apiKey") ?? ""),
    fromEmail: String(formData.get("fromEmail") ?? ""),
    fromName: String(formData.get("fromName") ?? ""),
    calendarConnected: String(formData.get("calendarConnected") ?? "false"),
  });

  const query = serializeResult({ saved: "1", service });
  redirect(`/settings/integrations?${query}`);
}

export async function saveIntegrationFromWizard(service: string, credentials: Record<string, string>) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await updateIntegration(orgId, service, credentials);
  return { success: true };
}

export async function testTwilioConnectionAction(formData: FormData) {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);
  const accountSid = String(formData.get("accountSid") ?? integrations.twilio?.accountSid ?? "").trim();
  const rawAuthToken = String(formData.get("authToken") ?? "").trim();
  const authToken = rawAuthToken || tryDecrypt(integrations.twilio?.authToken);

  if (!accountSid || !authToken) {
    redirect("/settings/integrations?twilioTest=0");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  redirect(`/settings/integrations?twilioTest=${response.ok ? "1" : "0"}`);
}

export async function testResendConnectionAction(formData: FormData) {
  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);
  const rawApiKey = String(formData.get("apiKey") ?? "").trim();
  const apiKey = rawApiKey || tryDecrypt(integrations.resend?.apiKey);
  const fromEmail = String(formData.get("fromEmail") ?? integrations.resend?.fromEmail ?? "").trim();
  const fromName = String(formData.get("fromName") ?? integrations.resend?.fromName ?? "SeldonFrame").trim();

  if (!apiKey) {
    redirect("/settings/integrations?resendTest=0");
  }

  const domainsResponse = await fetch("https://api.resend.com/domains", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!domainsResponse.ok) {
    redirect("/settings/integrations?resendTest=0");
  }

  await updateIntegration(orgId, "resend", {
    apiKey: rawApiKey,
    fromEmail,
    fromName,
  });

  if (fromEmail && user?.email) {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [user.email],
        subject: "Resend integration test",
        html: "<p>Your Resend integration is connected.</p>",
      }),
      cache: "no-store",
    });

    redirect(`/settings/integrations?resendTest=${emailResponse.ok ? "1" : "0"}`);
  }

  redirect("/settings/integrations?resendTest=1");
}

export async function testKitConnectionAction(formData: FormData) {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);
  const rawApiKey = String(formData.get("apiKey") ?? "").trim();
  const apiKey = rawApiKey || tryDecrypt(integrations.kit?.apiKey);

  if (!apiKey) {
    redirect("/settings/integrations?kitTest=0");
  }

  const response = await fetch("https://api.kit.com/v4/account", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  redirect(`/settings/integrations?kitTest=${response.ok ? "1" : "0"}`);
}
