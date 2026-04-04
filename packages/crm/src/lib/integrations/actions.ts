"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, type OrganizationIntegrations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { decryptValue, encryptValue, redactApiKey } from "@/lib/encryption";

type NewsletterProvider = "kit" | "mailchimp" | "beehiiv";
type IntegrationService = "twilio" | "resend" | "kit" | "mailchimp" | "beehiiv" | "google";

type IntegrationViewModel = {
  orgId: string;
  orgName: string;
  twilio: { connected: boolean; accountSid: string; fromNumber: string; authTokenHint: string };
  newsletter: {
    provider: NewsletterProvider | null;
    connected: boolean;
    subscriberCount: number | null;
    listId: string;
    publicationId: string;
    kit: { connected: boolean; apiKeyHint: string; disabled: boolean };
    mailchimp: { connected: boolean; apiKeyHint: string; disabled: boolean };
    beehiiv: { connected: boolean; apiKeyHint: string; disabled: boolean };
  };
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
  const newsletterProvider = integrations.newsletter?.provider ?? (integrations.kit?.connected ? "kit" : null);
  const newsletterKey = tryDecrypt(
    integrations.newsletter?.apiKey || (newsletterProvider === "kit" ? integrations.kit?.apiKey : "")
  );

  const activeProvider = newsletterProvider as NewsletterProvider | null;
  const providerIsActive = (provider: NewsletterProvider) => activeProvider === provider;
  const providerIsDisabled = (provider: NewsletterProvider) => Boolean(activeProvider && activeProvider !== provider);

  return {
    orgId: org.id,
    orgName: org.name,
    twilio: {
      connected: Boolean(integrations.twilio?.connected),
      accountSid: integrations.twilio?.accountSid ?? "",
      fromNumber: integrations.twilio?.fromNumber ?? "",
      authTokenHint: twilioToken ? "••••••••" : "",
    },
    newsletter: {
      provider: activeProvider,
      connected: Boolean(integrations.newsletter?.connected || integrations.kit?.connected),
      subscriberCount:
        typeof integrations.newsletter?.subscriberCount === "number" ? integrations.newsletter.subscriberCount : null,
      listId: integrations.newsletter?.listId ?? "",
      publicationId: integrations.newsletter?.publicationId ?? "",
      kit: {
        connected: providerIsActive("kit") && Boolean(integrations.newsletter?.connected || integrations.kit?.connected),
        apiKeyHint: providerIsActive("kit") ? redactApiKey(newsletterKey) : "",
        disabled: providerIsDisabled("kit"),
      },
      mailchimp: {
        connected: providerIsActive("mailchimp") && Boolean(integrations.newsletter?.connected),
        apiKeyHint: providerIsActive("mailchimp") ? redactApiKey(newsletterKey) : "",
        disabled: providerIsDisabled("mailchimp"),
      },
      beehiiv: {
        connected: providerIsActive("beehiiv") && Boolean(integrations.newsletter?.connected),
        apiKeyHint: providerIsActive("beehiiv") ? redactApiKey(newsletterKey) : "",
        disabled: providerIsDisabled("beehiiv"),
      },
    },
    google: {
      calendarConnected: Boolean(integrations.google?.calendarConnected),
    },
  };
}

export async function updateIntegration(orgId: string, service: string, credentials: Record<string, string>) {
  const integrationService = service as IntegrationService;

  if (!["twilio", "resend", "kit", "mailchimp", "beehiiv", "google"].includes(integrationService)) {
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

  if (["kit", "mailchimp", "beehiiv"].includes(integrationService)) {
    const provider = integrationService as NewsletterProvider;
    const existingProvider = integrations.newsletter?.provider;
    const existingKey = tryDecrypt(integrations.newsletter?.apiKey || (provider === "kit" ? integrations.kit?.apiKey : ""));
    const apiKey = credentials.apiKey?.trim() || existingKey;

    integrations.newsletter = {
      provider,
      apiKey: apiKey ? encryptValue(apiKey) : "",
      connected: Boolean(apiKey),
      subscriberCount:
        credentials.subscriberCount && Number.isFinite(Number(credentials.subscriberCount))
          ? Number(credentials.subscriberCount)
          : integrations.newsletter?.subscriberCount,
      listId: provider === "mailchimp" ? credentials.listId?.trim() || integrations.newsletter?.listId || "" : undefined,
      publicationId: provider === "beehiiv" ? credentials.publicationId?.trim() || integrations.newsletter?.publicationId || "" : undefined,
    };

    if (provider === "kit") {
      integrations.kit = {
        apiKey: apiKey ? encryptValue(apiKey) : integrations.kit?.apiKey || "",
        connected: Boolean(apiKey),
      };
    }

    if (existingProvider && existingProvider !== provider) {
      integrations.kit = provider === "kit" ? integrations.kit : undefined;
    }
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
    listId: String(formData.get("listId") ?? ""),
    publicationId: String(formData.get("publicationId") ?? ""),
    subscriberCount: String(formData.get("subscriberCount") ?? ""),
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
  const apiKey = rawApiKey || tryDecrypt(integrations.newsletter?.apiKey || integrations.kit?.apiKey);

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

  if (response.ok) {
    await updateIntegration(orgId, "kit", { apiKey: rawApiKey || apiKey });
  }

  redirect(`/settings/integrations?kitTest=${response.ok ? "1" : "0"}`);
}

function resolveMailchimpApiRoot(apiKey: string) {
  const parts = apiKey.split("-");
  const dc = parts[parts.length - 1];
  if (!dc) {
    return null;
  }
  return `https://${dc}.api.mailchimp.com/3.0`;
}

export async function testMailchimpConnectionAction(formData: FormData) {
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
  const apiKey = rawApiKey || tryDecrypt(integrations.newsletter?.apiKey);
  const listId = String(formData.get("listId") ?? integrations.newsletter?.listId ?? "").trim();
  const apiRoot = apiKey ? resolveMailchimpApiRoot(apiKey) : null;

  if (!apiKey || !apiRoot) {
    redirect("/settings/integrations?mailchimpTest=0");
  }

  const auth = Buffer.from(`anystring:${apiKey}`).toString("base64");
  const response = await fetch(`${apiRoot}/ping`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.ok) {
    await updateIntegration(orgId, "mailchimp", { apiKey: rawApiKey || apiKey, listId });
  }

  redirect(`/settings/integrations?mailchimpTest=${response.ok ? "1" : "0"}`);
}

export async function testBeehiivConnectionAction(formData: FormData) {
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
  const apiKey = rawApiKey || tryDecrypt(integrations.newsletter?.apiKey);
  const publicationId = String(formData.get("publicationId") ?? integrations.newsletter?.publicationId ?? "").trim();

  if (!apiKey) {
    redirect("/settings/integrations?beehiivTest=0");
  }

  const response = await fetch("https://api.beehiiv.com/v2/publications", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  let subscriberCount = "";
  if (response.ok) {
    const json = (await response.json()) as { data?: Array<{ id?: string; stats?: { active_subscriptions?: number } }> };
    const matched = publicationId
      ? json.data?.find((item) => item.id === publicationId)
      : json.data?.[0];
    subscriberCount = matched?.stats?.active_subscriptions ? String(matched.stats.active_subscriptions) : "";
    await updateIntegration(orgId, "beehiiv", {
      apiKey: rawApiKey || apiKey,
      publicationId: publicationId || matched?.id || "",
      subscriberCount,
    });
  }

  redirect(`/settings/integrations?beehiivTest=${response.ok ? "1" : "0"}`);
}
