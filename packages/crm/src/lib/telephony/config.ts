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
  /** SMS sender number — same field lib/sms/providers/twilio.ts:15 reads. */
  fromNumber?: string;
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

// ─── SMS-live predicate (review fix, commit 6e5a31bb0) ────────────────────────
//
// "SMS is live" must NOT require voiceTrunkSid — that field is voice-only
// (used to provision numbers for client deployments). An SMS-only operator
// (accountSid + authToken + fromNumber, no trunk) is the common case and
// must read as "live" consistently across the nav gate, the /conversations
// empty state, and /settings/features. This predicate is the single source
// of truth for all three; it mirrors lib/sms/providers/twilio.ts:isConfigured
// exactly (accountSid && authToken && fromNumber), just without decrypting
// authToken (presence-check only, same as the nav gate already did).

/**
 * Pure function — true iff the twilio integration blob has accountSid,
 * authToken, and fromNumber all present (non-empty). Never requires
 * voiceTrunkSid. Unit-tested in tests/unit/telephony/has-live-sms.spec.ts.
 */
export function hasLiveSms(integrations: unknown): boolean {
  if (!integrations || typeof integrations !== "object") {
    return false;
  }

  const blob = integrations as Record<string, unknown>;
  if (!blob.twilio || typeof blob.twilio !== "object") {
    return false;
  }

  const twilio = blob.twilio as TwilioIntegrationBlob;

  const accountSid = typeof twilio.accountSid === "string" && twilio.accountSid.trim();
  const authTokenRaw = typeof twilio.authToken === "string" && twilio.authToken.trim();
  const fromNumber = typeof twilio.fromNumber === "string" && twilio.fromNumber.trim();

  return Boolean(accountSid && authTokenRaw && fromNumber);
}

/**
 * DB wrapper for hasLiveSms — loads the org's integrations blob and applies
 * the same presence-only predicate. Soft-fails to false on error/not-found
 * so a DB hiccup never fabricates a "live" state.
 */
export async function hasLiveSmsForOrg(orgId: string): Promise<boolean> {
  try {
    const [org] = await db
      .select({ integrations: organizations.integrations })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return hasLiveSms(org?.integrations ?? null);
  } catch {
    return false;
  }
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
