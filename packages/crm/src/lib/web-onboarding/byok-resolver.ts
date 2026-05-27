// packages/crm/src/lib/web-onboarding/byok-resolver.ts
// Resolves the operator's BYOK Anthropic key for the web-onboarding extraction
// endpoint. Mirrors the existing pattern in lib/ai/client.ts:107 and
// lib/integrations/newsletter-sync.ts:16, but factored out so the SSE route
// stays thin and the resolver is unit-testable without a DB.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue, encryptValue } from "@/lib/encryption";

export type ByokResolverResult = {
  key: string | null;
  source: "byok" | "missing" | "undecryptable";
};

type IntegrationsBlob = {
  anthropic?: { apiKey?: string | null } | null;
} | null | undefined;

function decryptIfNeeded(value: string): string {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  return decryptValue(value);
}

/**
 * Pure function — accepts the decoded integrations JSONB and returns the
 * resolved key + source label. No DB calls. Unit-tested.
 */
export function resolveByokKeyFromIntegrationsBlob(integrations: IntegrationsBlob): ByokResolverResult {
  if (!integrations || typeof integrations !== "object") {
    return { key: null, source: "missing" };
  }

  const raw = integrations.anthropic?.apiKey;
  if (typeof raw !== "string" || raw.length === 0) {
    return { key: null, source: "missing" };
  }

  try {
    const plain = decryptIfNeeded(raw).trim();
    if (!plain) {
      return { key: null, source: "missing" };
    }
    return { key: plain, source: "byok" };
  } catch {
    return { key: null, source: "undecryptable" };
  }
}

/**
 * DB wrapper — loads the integrations blob for the given org and delegates
 * to resolveByokKeyFromIntegrationsBlob. Used by the route handler.
 */
export async function getOperatorByokAnthropicKey(params: { orgId: string }): Promise<ByokResolverResult> {
  const [row] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  return resolveByokKeyFromIntegrationsBlob(row?.integrations as IntegrationsBlob);
}

export type StoreByokResult =
  | { ok: true; hint: string }
  | { ok: false; reason: "invalid_key_shape" | "encryption_unavailable" | "org_not_found" };

/**
 * Pure helper — given the current integrations blob and an encrypted key
 * value, returns the merged blob the DB write should set. Extracted from
 * setOperatorByokAnthropicKey so the merge shape is unit-testable without
 * a DB round trip. Mirrors the dynamic-key pattern from
 * lib/integrations/llm/actions.ts:132 + /api/integrations/anthropic:111
 * so any future caller (signup, settings, MCP) produces the exact same
 * JSONB shape and the runtime decrypter doesn't have to special-case.
 */
export function mergeAnthropicKeyIntoIntegrations(
  existing: Record<string, unknown> | null | undefined,
  encryptedKey: string,
  hint: string,
  nowIso: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = existing ?? {};
  const provider = "anthropic" as const;
  return {
    ...base,
    [provider]: {
      ...((base[provider] as Record<string, unknown>) ?? {}),
      apiKey: encryptedKey,
      hint,
      savedAt: nowIso,
    },
  };
}

/** Pure helper — given the raw plaintext key the user pasted, returns the
 *  last-4 hint string we display in /settings/integrations/llm. Centralised
 *  so the format ("sk-ant-…XXXX") stays consistent across save sites. */
export function buildAnthropicKeyHint(rawKey: string): string {
  const last4 = rawKey.slice(-4);
  return `sk-ant-…${last4}`;
}

/**
 * 2026-05-27 — Setter companion to getOperatorByokAnthropicKey. Encrypts the
 * raw Anthropic key and merges it into organizations.integrations.anthropic
 * at the operator's agency-org level (the org passed in as `orgId`). All
 * client workspaces inherit this key through the same JSONB column at
 * extraction time.
 *
 * Identical encryption + JSONB merge shape to:
 *   - /api/integrations/anthropic POST (lib/clients/new BYOK retry path)
 *   - lib/integrations/llm/actions.ts saveLlmKeyAction (/settings page)
 *
 * Centralised here so the new /signup/connect-ai action and any future
 * caller writes through one path. The runtime decrypts uniformly regardless
 * of source via decryptIfNeeded() above.
 *
 * Returns a discriminated union so callers can branch on the failure mode
 * (env-missing vs invalid shape vs org-not-found) and surface the right
 * inline error without an extra round trip.
 */
export async function setOperatorByokAnthropicKey(params: {
  orgId: string;
  apiKey: string;
}): Promise<StoreByokResult> {
  const apiKey = params.apiKey.trim();

  // Provider-specific key shape sanity check. Matches saveLlmKeyAction:102
  // and /api/integrations/anthropic:73. Anthropic keys all start with sk-ant-.
  if (!apiKey.startsWith("sk-ant-")) {
    return { ok: false, reason: "invalid_key_shape" };
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptValue(apiKey);
  } catch {
    return { ok: false, reason: "encryption_unavailable" };
  }

  const [orgRow] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  if (!orgRow) {
    return { ok: false, reason: "org_not_found" };
  }

  const existing = (orgRow.integrations ?? {}) as Record<string, unknown>;
  const hint = buildAnthropicKeyHint(apiKey);
  const next = mergeAnthropicKeyIntoIntegrations(existing, encryptedKey, hint);

  // The OrganizationIntegrations type doesn't enumerate anthropic/openai
  // keys; same cast pattern as /api/integrations/anthropic:128.
  await db
    .update(organizations)
    .set({
      integrations: next as unknown as typeof organizations.$inferInsert.integrations,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));

  return { ok: true, hint };
}

/**
 * Convenience read used by the /signup/connect-ai page to decide whether
 * to skip the form for a returning user who already connected their key.
 * Returns a plain boolean — keeps the page server-component lean (no need
 * to import the discriminated union just to ask "is there a key?").
 */
export async function operatorHasByokAnthropicKey(orgId: string): Promise<boolean> {
  const result = await getOperatorByokAnthropicKey({ orgId });
  return result.source === "byok" && typeof result.key === "string" && result.key.length > 0;
}
