"use server";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";

const KIT_V4_BASE_URL = "https://api.kit.com/v4";

type KitSettings = {
  apiKey?: string;
  apiTokenEncrypted?: string;
  apiTokenLast4?: string;
  version?: "v4";
  defaultTagId?: string;
  defaultSequenceId?: string;
  tagMap?: Record<string, string>;
  sequenceMap?: Record<string, string>;
  enabled?: boolean;
};

function getKitCredentialsSecret() {
  const secret = process.env.SELDON_CREDENTIALS_SECRET || process.env.PORTAL_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Credential encryption secret missing. Set SELDON_CREDENTIALS_SECRET.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredential(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKitCredentialsSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptCredential(payload: string) {
  const [ivRaw, authTagRaw, ciphertextRaw] = payload.split(".");
  if (!ivRaw || !authTagRaw || !ciphertextRaw) {
    throw new Error("Invalid encrypted credential payload");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKitCredentialsSecret(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}

function resolveKitApiToken(settings: KitSettings) {
  if (settings.apiTokenEncrypted) {
    return decryptCredential(settings.apiTokenEncrypted);
  }

  if (settings.apiKey) {
    return settings.apiKey;
  }

  return "";
}

async function kitV4Request(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${KIT_V4_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

function readKitSettings(settings: Record<string, unknown> | null | undefined): KitSettings {
  const raw = settings?.kitIntegration;

  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as KitSettings;
}

export async function getKitIntegrationSettings() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const settings = readKitSettings(org.settings as Record<string, unknown>);

  return {
    enabled: Boolean(settings.enabled),
    version: "v4" as const,
    hasApiToken: Boolean(settings.apiTokenEncrypted || settings.apiKey),
    apiTokenHint: settings.apiTokenLast4 ? `••••${settings.apiTokenLast4}` : null,
    defaultTagId: settings.defaultTagId ?? "",
    defaultSequenceId: settings.defaultSequenceId ?? "",
    tagMap: settings.tagMap ?? {},
    sequenceMap: settings.sequenceMap ?? {},
  };
}

export async function saveKitIntegrationAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const existing = readKitSettings(org.settings as Record<string, unknown>);
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const defaultTagId = String(formData.get("defaultTagId") ?? "").trim();
  const defaultSequenceId = String(formData.get("defaultSequenceId") ?? "").trim();
  const contactCreatedTag = String(formData.get("contactCreatedTag") ?? "").trim();
  const bookingCompletedTag = String(formData.get("bookingCompletedTag") ?? "").trim();
  const existingEncryptedToken = existing.apiTokenEncrypted || (existing.apiKey ? encryptCredential(existing.apiKey) : "");
  const nextEncryptedToken = apiKey ? encryptCredential(apiKey) : existingEncryptedToken;
  const nextTokenLast4 = apiKey
    ? apiKey.slice(-4)
    : existing.apiTokenLast4 || (existing.apiKey ? existing.apiKey.slice(-4) : "");

  const nextSettings = {
    ...(org.settings as Record<string, unknown>),
    kitIntegration: {
      ...existing,
      version: "v4" as const,
      enabled: Boolean(nextEncryptedToken),
      apiTokenEncrypted: nextEncryptedToken,
      apiTokenLast4: nextTokenLast4,
      apiKey: undefined,
      defaultTagId,
      defaultSequenceId,
      tagMap: {
        ...(existing.tagMap ?? {}),
        "contact.created": contactCreatedTag,
        "booking.completed": bookingCompletedTag,
      },
    },
  };

  await db.update(organizations).set({ settings: nextSettings, updatedAt: new Date() }).where(eq(organizations.id, orgId));

  redirect("/settings/integrations/kit?saved=1");
}

export async function testKitConnectionAction(formData: FormData) {
  const submittedApiKey = String(formData.get("apiKey") ?? "").trim();
  let token = submittedApiKey;

  if (!token) {
    const orgId = await getOrgId();
    if (orgId) {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      token = resolveKitApiToken(readKitSettings((org?.settings ?? {}) as Record<string, unknown>));
    }
  }

  if (!token) {
    redirect("/settings/integrations/kit?tested=0");
  }

  const response = await kitV4Request(token, "/account", { method: "GET" });

  redirect(`/settings/integrations/kit?tested=${response.ok ? "1" : "0"}`);
}

async function sendKitTagSubscription(params: {
  apiToken: string;
  tagId: string;
  email: string;
  firstName: string;
}) {
  if (!params.tagId) {
    return;
  }

  const response = await kitV4Request(params.apiToken, `/tags/${params.tagId}/subscribers`, {
    method: "POST",
    body: JSON.stringify({
      email_address: params.email,
      first_name: params.firstName,
    }),
  });

  if (!response.ok) {
    throw new Error("Kit tag subscription request failed");
  }
}

async function sendKitSequenceSubscription(params: {
  apiToken: string;
  sequenceId: string;
  email: string;
  firstName: string;
}) {
  if (!params.sequenceId) {
    return;
  }

  const response = await kitV4Request(params.apiToken, `/sequences/${params.sequenceId}/subscribers`, {
    method: "POST",
    body: JSON.stringify({
      email_address: params.email,
      first_name: params.firstName,
    }),
  });

  if (!response.ok) {
    throw new Error("Kit sequence subscription request failed");
  }
}

export async function syncKitForContactEvent(params: {
  eventType: "contact.created" | "booking.completed";
  contactId: string;
}) {
  const [contact] = await db
    .select({
      orgId: contacts.orgId,
      email: contacts.email,
      firstName: contacts.firstName,
    })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact?.email) {
    return;
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, contact.orgId))
    .limit(1);

  const kit = readKitSettings((org?.settings ?? {}) as Record<string, unknown>);
  const apiToken = resolveKitApiToken(kit);

  if (!kit.enabled || !apiToken) {
    return;
  }

  const mappedTagId = kit.tagMap?.[params.eventType] || kit.defaultTagId || "";
  const mappedSequenceId = kit.sequenceMap?.[params.eventType] || kit.defaultSequenceId || "";

  try {
    await Promise.all([
      sendKitTagSubscription({
        apiToken,
        tagId: mappedTagId,
        email: contact.email,
        firstName: contact.firstName,
      }),
      sendKitSequenceSubscription({
        apiToken,
        sequenceId: mappedSequenceId,
        email: contact.email,
        firstName: contact.firstName,
      }),
    ]);
  } catch {
    return;
  }
}
