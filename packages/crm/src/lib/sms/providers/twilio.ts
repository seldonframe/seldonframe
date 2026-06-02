import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";
import {
  SmsProviderSendError,
  type SmsProvider,
  type SmsSendRequest,
  type SmsSendResult,
} from "./interface";

type TwilioIntegration = {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  connected?: boolean;
};

async function resolveTwilioAuth(orgId: string) {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const twilio = (integrations.twilio ?? {}) as TwilioIntegration;

  const accountSid = twilio.accountSid?.trim() ?? "";
  const rawToken = twilio.authToken?.trim() ?? "";
  const fromNumber = twilio.fromNumber?.trim() ?? "";

  let authToken = rawToken;
  if (rawToken.startsWith("v1.")) {
    try {
      authToken = decryptValue(rawToken);
    } catch {
      authToken = "";
    }
  }

  return { accountSid, authToken, fromNumber };
}

export const twilioProvider: SmsProvider = {
  id: "twilio",

  async isConfigured(orgId: string) {
    const { accountSid, authToken, fromNumber } = await resolveTwilioAuth(orgId);
    return Boolean(accountSid && authToken && fromNumber);
  },

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    // SLICE 8 G-8-7: resolver-driven test-mode dispatch passes
    // authOverride with test credentials. When unset, fall through
    // to the workspace's stored live credentials.
    const { accountSid, authToken } = request.authOverride
      ? request.authOverride
      : await resolveTwilioAuth(request.orgId);
    if (!accountSid || !authToken) {
      throw new SmsProviderSendError("twilio", "Twilio credentials not configured", {
        retriable: false,
      });
    }

    const form = new URLSearchParams();
    form.set("From", request.from);
    form.set("To", request.to);
    form.set("Body", request.body);
    if (request.statusCallback) {
      form.set("StatusCallback", request.statusCallback);
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const retriable = response.status >= 500 || response.status === 429;
      let details: unknown;
      let code: string | null = null;
      try {
        const body = (await response.json()) as { code?: number; message?: string };
        details = body;
        code = body.code !== undefined ? String(body.code) : null;
      } catch {
        details = await response.text().catch(() => "");
      }
      throw new SmsProviderSendError("twilio", `Twilio send failed with ${response.status}`, {
        retriable,
        code,
        details,
      });
    }

    const payload = (await response.json()) as {
      sid?: string;
      num_segments?: string;
    };
    if (!payload.sid) {
      throw new SmsProviderSendError("twilio", "Twilio returned no message sid", { retriable: false });
    }

    const segments = Number(payload.num_segments ?? "1");
    return {
      externalMessageId: payload.sid,
      provider: "twilio",
      segments: Number.isFinite(segments) && segments > 0 ? segments : 1,
    };
  },
};
