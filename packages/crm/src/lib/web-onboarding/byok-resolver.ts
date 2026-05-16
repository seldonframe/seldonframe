// packages/crm/src/lib/web-onboarding/byok-resolver.ts
// Resolves the operator's BYOK Anthropic key for the web-onboarding extraction
// endpoint. Mirrors the existing pattern in lib/ai/client.ts:107 and
// lib/integrations/newsletter-sync.ts:16, but factored out so the SSE route
// stays thin and the resolver is unit-testable without a DB.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

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
