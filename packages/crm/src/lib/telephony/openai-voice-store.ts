// packages/crm/src/lib/telephony/openai-voice-store.ts
//
// Tier-2 voice-deploy metered billing (spec 2026-07-01 §3, Task 8) — storage
// for the builder's OWN OpenAI project credentials, used by the per-org
// webhook route (app/api/v1/voice/openai/webhook/[orgId]). This is the
// BYO-everything tier: $0 SF fees, the call runs on the builder's key against
// the builder's OpenAI project, never metered.
//
// Persistence mirrors lib/telephony/sf-managed.ts (itself mirroring BYO
// Twilio in lib/telephony/config.ts): read organizations.integrations
// (jsonb), decode a typed sub-blob (here: `openaiVoice`), and — for writes —
// merge + write back via db.update(organizations).set({ integrations,
// updatedAt }). apiKey + webhookSecret are encrypted with the SAME "v1."
// scheme (encryptValue/decryptValue from lib/encryption.ts) as sfTelephony's
// authToken; projectId is plaintext (an identifier, not a secret).
//
// Unlike sf-managed.ts this module has no reverse-jsonb-lookup case — every
// caller already has the orgId (the route param, or an org-scoped settings
// action), so there's a single row filter (eq(organizations.id, orgId)), no
// DI seam, and no Twilio client. Kept as two small, directly-testable
// functions rather than a fake-injected orchestration layer since there's no
// pure "money brain" logic here to isolate — just an encrypt/decrypt read and
// a merge-write, exactly like resolveBuilderTelephony/pickTelephonyFromIntegrations.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, type OrganizationIntegrations } from "@/db/schema";
import { decryptValue, encryptValue } from "@/lib/encryption";

export type OrgOpenAiVoice = {
  projectId: string;
  apiKey: string;
  webhookSecret: string;
};

/** Decrypt a "v1."-prefixed stored secret. Mirrors sf-managed.ts's
 *  decryptStoredToken: a legacy/malformed value that doesn't carry the
 *  prefix is returned as-is (tolerant of any future migration), and a
 *  decrypt failure (wrong key, corrupted payload) degrades to "" rather than
 *  throwing — the caller treats an empty secret as absent, never crashes the
 *  webhook route on a stray malformed row. */
function decryptStoredSecret(stored: string): string {
  if (!stored.startsWith("v1.")) {
    return stored;
  }
  try {
    return decryptValue(stored);
  } catch {
    return "";
  }
}

/**
 * Reads this org's Tier-2 OpenAI voice credentials (decrypted). Returns null
 * when the org has never configured Tier-2 voice (no `openaiVoice` blob) OR
 * when any required field is missing/blank after decryption (a malformed row
 * degrades to "not configured", not a thrown error) — the caller
 * (the webhook route) treats null as `storedKeyPresent: false` and lets the
 * signature-verify-with-undefined-secret path produce the 401, never a 500.
 */
export async function getOrgOpenAiVoice(orgId: string): Promise<OrgOpenAiVoice | null> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as OrganizationIntegrations;
  const stored = integrations.openaiVoice;
  if (!stored?.projectId || !stored.apiKey || !stored.webhookSecret) {
    return null;
  }

  const apiKey = decryptStoredSecret(stored.apiKey);
  const webhookSecret = decryptStoredSecret(stored.webhookSecret);
  if (!apiKey || !webhookSecret) {
    return null;
  }

  return { projectId: stored.projectId, apiKey, webhookSecret };
}

/**
 * Encrypts apiKey + webhookSecret (same "v1." scheme as sfTelephony's
 * authToken) and persists them under integrations.openaiVoice, merged with
 * the org's existing integrations blob (shallow merge — every other
 * integration sub-key, e.g. twilio/resend/sfTelephony, is preserved
 * untouched). projectId is stored plaintext.
 *
 * Throws when the org row itself can't be found — same "fail closed rather
 * than write an orphan row" stance as sf-managed.ts's patchOrgIntegrations;
 * this is only ever called from an org-scoped settings action where the org
 * is already known to exist.
 */
export async function setOrgOpenAiVoice(
  orgId: string,
  value: OrgOpenAiVoice,
): Promise<void> {
  const [org] = await db
    .select({ id: organizations.id, integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error(`openai-voice-store: setOrgOpenAiVoice found no org for orgId=${orgId}`);
  }

  const integrations = (org.integrations ?? {}) as OrganizationIntegrations;

  const merged: OrganizationIntegrations = {
    ...integrations,
    openaiVoice: {
      projectId: value.projectId,
      apiKey: encryptValue(value.apiKey),
      webhookSecret: encryptValue(value.webhookSecret),
    },
  };

  await db
    .update(organizations)
    .set({ integrations: merged, updatedAt: new Date() })
    .where(eq(organizations.id, org.id));
}
