// v1.27.6 — workspace-level LLM provider key management.
//
// SF clients use BYOK — they bring their own Anthropic / OpenAI key and
// the key gets stored encrypted in organizations.integrations[provider].apiKey.
// The agent runtime resolves this key at customer chat time via getAIClient().
//
// Two server actions drive the UI at /settings/integrations/llm:
//   - getLlmIntegrationSettings(): read-only status (configured / hint)
//   - saveLlmKeyAction(formData): encrypts + merges into integrations
//   - removeLlmKeyAction(provider): clears the provider entry
//
// Same encryption + storage path as the MCP `configure_llm_provider` tool
// in /api/v1/agents — both write to the same column with the same v1. prefix
// so the runtime decrypts uniformly regardless of source.

"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { encryptValue } from "@/lib/encryption";
import { assertWritable } from "@/lib/demo/server";

export type LlmProviderStatus = {
  provider: "anthropic" | "openai";
  configured: boolean;
  /** Last 4 chars of the original key, set at save time (NOT decrypted on
   *  read — we never decrypt unless a turn actually needs it). When this
   *  is null but configured=true, the key was saved before v1.27.6 and
   *  the hint isn't available. */
  hint: string | null;
  /** ISO timestamp from the integrations.<provider>.savedAt field. */
  savedAt: string | null;
};

export async function getLlmIntegrationSettings(): Promise<{
  anthropic: LlmProviderStatus;
  openai: LlmProviderStatus;
} | null> {
  const orgId = await getOrgId();
  if (!orgId) return null;

  const [row] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = (row?.integrations ?? {}) as Record<string, unknown>;

  return {
    anthropic: extractStatus("anthropic", integrations),
    openai: extractStatus("openai", integrations),
  };
}

function extractStatus(
  provider: "anthropic" | "openai",
  integrations: Record<string, unknown>,
): LlmProviderStatus {
  const entry = integrations[provider] as
    | { apiKey?: string; hint?: string; savedAt?: string }
    | undefined;
  return {
    provider,
    configured:
      typeof entry?.apiKey === "string" && entry.apiKey.length > 0,
    hint: typeof entry?.hint === "string" ? entry.hint : null,
    savedAt: typeof entry?.savedAt === "string" ? entry.savedAt : null,
  };
}

const SaveSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  apiKey: z.string().min(10).max(500),
});

export type SaveLlmKeyResult = { ok: true; provider: "anthropic" | "openai" } | { ok: false; error: string };

/**
 * Shared validate-encrypt-persist path for a BYOK save. Returns a result
 * object rather than redirecting — callers decide navigation. Used by both
 * `saveLlmKeyAction` (the /settings page — redirects) and
 * `saveLlmKeyInPlaceAction` (the in-place modal — never navigates, see
 * llm-key-dialog.tsx's header comment / record-v3 spec bug #6: the operator
 * must never be bounced off the page they were on to add a key).
 */
async function persistLlmKey(formData: FormData): Promise<SaveLlmKeyResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) {
    return { ok: false, error: "You must be signed in to save a key." };
  }

  const parsed = SaveSchema.safeParse({
    provider: formData.get("provider"),
    apiKey: (formData.get("apiKey") as string | null)?.trim() ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message.slice(0, 200) };
  }

  const { provider, apiKey } = parsed.data;

  // Provider-specific key shape sanity check (best-effort — Anthropic
  // keys start with sk-ant-, OpenAI keys start with sk-).
  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    return { ok: false, error: "Anthropic keys start with sk-ant-" };
  }
  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    return { ok: false, error: "OpenAI keys start with sk-" };
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptValue(apiKey);
  } catch {
    return {
      ok: false,
      error: "Encryption unavailable. Set ENCRYPTION_KEY env var on the deployment.",
    };
  }

  const [orgRow] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const existing = (orgRow?.integrations ?? {}) as Record<string, unknown>;
  const last4 = apiKey.slice(-4);
  const hint = `${provider === "anthropic" ? "sk-ant-" : "sk-"}…${last4}`;

  const next = {
    ...existing,
    [provider]: {
      ...((existing[provider] as Record<string, unknown>) ?? {}),
      apiKey: encryptedKey,
      hint,
      savedAt: new Date().toISOString(),
    },
  };

  await db
    .update(organizations)
    .set({ integrations: next, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return { ok: true, provider };
}

export async function saveLlmKeyAction(formData: FormData): Promise<void> {
  const result = await persistLlmKey(formData);
  if (!result.ok) {
    if (result.error === "You must be signed in to save a key.") {
      redirect("/login");
    }
    redirect(`/settings/integrations/llm?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/settings/integrations/llm?saved=${result.provider}`);
}

/**
 * In-place variant for LlmKeyDialog (record-v3 S4a) — same validation +
 * encryption + persistence as saveLlmKeyAction, but returns a result object
 * instead of ever calling redirect(). Any caller that needs to stay on the
 * current page (studio editor, test sandbox, run-evals, the /record recap)
 * must use this, never saveLlmKeyAction, whose redirect would navigate the
 * browser to /settings/integrations/llm out from under the modal.
 */
export async function saveLlmKeyInPlaceAction(formData: FormData): Promise<SaveLlmKeyResult> {
  return persistLlmKey(formData);
}

const RemoveSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
});

export async function removeLlmKeyAction(formData: FormData): Promise<void> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) {
    redirect("/login");
  }

  const parsed = RemoveSchema.safeParse({
    provider: formData.get("provider"),
  });
  if (!parsed.success) {
    redirect("/settings/integrations/llm?error=invalid_provider");
  }

  const [orgRow] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const existing = (orgRow?.integrations ?? {}) as Record<string, unknown>;
  const next = { ...existing };
  delete next[parsed.data.provider];

  await db
    .update(organizations)
    .set({ integrations: next, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  redirect(`/settings/integrations/llm?removed=${parsed.data.provider}`);
}
