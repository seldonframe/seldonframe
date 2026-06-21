// Per-client context Phase 1 — server-only key resolution for the
// generateClientContextAction default compile path.
//
// PLAIN module (NOT "use server") — it's a helper the action imports, not an
// action itself. It touches the DB + decryption, so it never runs in the
// network-free unit tests; the action DI's the compile call instead, so this is
// only exercised on the real server path.
//
// Resolves the BUILDER org's Claude API key in the same order as getAIClient in
// lib/ai/client.ts: a decryptable BYOK Anthropic key first, then the platform
// `ANTHROPIC_API_KEY` env fallback. Returns "" when nothing resolves (the action
// maps that to a 'no_key' error rather than calling the compiler with a blank
// key).

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

/** Decrypt a stored key value if it looks encrypted (v1.<ciphertext>), else pass
 *  it through. Returns "" on failure. Mirrors decryptIfNeeded in ai/client.ts. */
function decryptIfNeeded(value: string | undefined): string {
  if (!value) return "";
  if (!value.startsWith("v1.")) return value;
  try {
    return decryptValue(value);
  } catch {
    return "";
  }
}

/**
 * Resolve a usable plaintext Claude API key for `orgId`: the org's BYOK
 * Anthropic key if present + decryptable, otherwise the platform env key,
 * otherwise "".
 */
export async function resolveBuilderClaudeKey(orgId: string): Promise<string> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as {
    anthropic?: { apiKey?: string };
  };

  const byok = decryptIfNeeded(integrations.anthropic?.apiKey);
  if (byok) return byok;

  return process.env.ANTHROPIC_API_KEY?.trim() ?? "";
}
