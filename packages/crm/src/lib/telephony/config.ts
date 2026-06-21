// packages/crm/src/lib/telephony/config.ts
// Resolves the builder's BYO Twilio credentials + Elastic SIP Trunk SID for
// voice-number provisioning. Mirrors the DI / pure-helper pattern from
// lib/web-onboarding/byok-resolver.ts and lib/sms/providers/twilio.ts.
//
// Phase 0 — data foundation only. The provisioning client (Phase 1) and
// the Settings UI for voiceTrunkSid (later UI phase) build on top of this.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TelephonyPickResult = {
  accountSid: string | null;
  authTokenRaw: string | null;
  voiceTrunkSid: string | null;
};

export type ResolveBuilderTelephonySuccess = {
  ok: true;
  accountSid: string;
  authToken: string;
  voiceTrunkSid: string;
};

export type ResolveBuilderTelephonyFailure = {
  ok: false;
  /** What is missing. 'twilio' = no accountSid or authToken configured.
   *  'trunk' = no voiceTrunkSid configured in the Twilio integration. */
  missing: ("twilio" | "trunk")[];
};

export type ResolveBuilderTelephonyResult =
  | ResolveBuilderTelephonySuccess
  | ResolveBuilderTelephonyFailure;

// ─── Pure picker (no DB) ───────────────────────────────────────────────────────

type TwilioIntegrationBlob = {
  accountSid?: string;
  authToken?: string;
  voiceTrunkSid?: string;
  [key: string]: unknown;
};

/**
 * Pure function — accepts the decoded integrations JSONB and returns the raw
 * (potentially encrypted) twilio fields needed for telephony. No DB calls.
 * Unit-tested in tests/unit/telephony/config.spec.ts.
 *
 * Raw authToken is returned as-is; decryption happens in resolveBuilderTelephony,
 * mirroring the pattern in lib/sms/providers/twilio.ts:resolveTwilioAuth.
 */
export function pickTelephonyFromIntegrations(integrations: unknown): TelephonyPickResult {
  const nullResult: TelephonyPickResult = {
    accountSid: null,
    authTokenRaw: null,
    voiceTrunkSid: null,
  };

  if (!integrations || typeof integrations !== "object") {
    return nullResult;
  }

  const blob = integrations as Record<string, unknown>;
  if (!blob.twilio || typeof blob.twilio !== "object") {
    return nullResult;
  }

  const twilio = blob.twilio as TwilioIntegrationBlob;

  const accountSid =
    typeof twilio.accountSid === "string" && twilio.accountSid.trim()
      ? twilio.accountSid.trim()
      : null;

  const authTokenRaw =
    typeof twilio.authToken === "string" && twilio.authToken.trim()
      ? twilio.authToken.trim()
      : null;

  const voiceTrunkSid =
    typeof twilio.voiceTrunkSid === "string" && twilio.voiceTrunkSid.trim()
      ? twilio.voiceTrunkSid.trim()
      : null;

  return { accountSid, authTokenRaw, voiceTrunkSid };
}

// ─── DB wrapper ───────────────────────────────────────────────────────────────

/**
 * Loads the builder org's integrations blob, picks Twilio telephony fields,
 * decrypts the authToken (v1.-prefix pattern, same as resolveTwilioAuth in
 * lib/sms/providers/twilio.ts lines ~33-40), and returns a discriminated
 * union so callers can show actionable "connect Twilio / set your voice trunk"
 * messages without extra round trips.
 */
export async function resolveBuilderTelephony(
  orgId: string,
): Promise<ResolveBuilderTelephonyResult> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const { accountSid, authTokenRaw, voiceTrunkSid } = pickTelephonyFromIntegrations(integrations);

  // Decrypt authToken — same pattern as resolveTwilioAuth in twilio.ts:33-40.
  let authToken = authTokenRaw ?? "";
  if (authToken.startsWith("v1.")) {
    try {
      authToken = decryptValue(authToken);
    } catch {
      authToken = "";
    }
  }

  const missing: ("twilio" | "trunk")[] = [];

  if (!accountSid || !authToken) {
    missing.push("twilio");
  }
  if (!voiceTrunkSid) {
    missing.push("trunk");
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    accountSid: accountSid as string,
    authToken,
    voiceTrunkSid: voiceTrunkSid as string,
  };
}
