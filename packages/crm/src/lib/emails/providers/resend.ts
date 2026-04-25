import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";
import {
  EmailProviderSendError,
  type EmailProvider,
  type EmailSendRequest,
  type EmailSendResult,
} from "./interface";

// Per-workspace API key takes priority over the process-level NextAuth key
// so each builder's sends go through their own Resend account. If the
// workspace key is missing, fall back to RESEND_API_KEY (used for
// magic-link auth emails) so local dev + platform-level mail still works.
async function resolveResendApiKey(orgId: string): Promise<string | null> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const resend = integrations.resend as Record<string, unknown> | undefined;
  const rawOrgKey = typeof resend?.apiKey === "string" ? resend.apiKey.trim() : "";

  if (rawOrgKey) {
    if (rawOrgKey.startsWith("v1.")) {
      return decryptValue(rawOrgKey);
    }
    return rawOrgKey;
  }

  const envKey = process.env.RESEND_API_KEY?.trim();
  return envKey || null;
}

export const resendProvider: EmailProvider = {
  id: "resend",

  async isConfigured(orgId: string) {
    const key = await resolveResendApiKey(orgId);
    return Boolean(key);
  },

  async send(request: EmailSendRequest): Promise<EmailSendResult> {
    // SLICE 8 G-8-7: resolver-driven test-mode dispatch passes
    // apiKeyOverride with the test key. When unset, fall through
    // to the workspace's stored live credentials.
    const apiKey = request.apiKeyOverride ?? (await resolveResendApiKey(request.orgId));
    if (!apiKey) {
      throw new EmailProviderSendError("resend", "Resend API key not configured", { retriable: false });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: request.from,
        to: [request.to],
        subject: request.subject,
        html: request.html,
        text: request.text,
        headers: request.headers,
        tags: request.tags,
      }),
    });

    if (!response.ok) {
      const retriable = response.status >= 500 || response.status === 429;
      let details: unknown;
      try {
        details = await response.json();
      } catch {
        details = await response.text();
      }
      throw new EmailProviderSendError("resend", `Resend send failed with ${response.status}`, {
        retriable,
        details,
      });
    }

    const payload = (await response.json()) as { id?: string };
    if (!payload.id) {
      throw new EmailProviderSendError("resend", "Resend returned no message id", { retriable: false });
    }

    return { externalMessageId: payload.id, provider: "resend" };
  },
};
