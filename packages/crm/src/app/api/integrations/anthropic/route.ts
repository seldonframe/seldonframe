// packages/crm/src/app/api/integrations/anthropic/route.ts
//
// Thin JSON wrapper around the workspace BYOK save flow. Used by the
// /clients/new form's inline "needs_byok" prompt — when the SSE stream
// emits 412, the form swaps to a key-paste box that POSTs here, then
// retries the create-from-url submission.
//
// Logic mirrors `saveLlmKeyAction` at lib/integrations/llm/actions.ts —
// same encryption, same JSONB merge into organizations.integrations —
// but returns JSON instead of redirecting, so the JSON caller can
// branch on the response shape.
//
// Encryption + storage path is identical to the MCP `configure_llm_provider`
// tool: both write `v1.<ciphertext>` to organizations.integrations.<provider>.apiKey.
// The runtime decrypts uniformly regardless of source via decryptIfNeeded.

import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { encryptValue } from "@/lib/encryption";
import { assertWritable } from "@/lib/demo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  apiKey: z.string().min(10, "apiKey too short").max(500, "apiKey too long"),
});

export async function POST(request: Request) {
  try {
    assertWritable();
  } catch {
    return Response.json({ ok: false, error: "demo_mode_blocked" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Same primary-org resolution as create-from-url/route.ts: the session's
  // `orgId` IS the user's primary org per the agency-identity-on-user-record
  // model. Fall back to `primaryOrgId` if a future session callback renames.
  const orgId =
    (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
    (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
    null;
  if (!orgId) {
    return Response.json({ ok: false, error: "no_primary_org" }, { status: 412 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_payload", detail: parsed.error.message.slice(0, 200) },
      { status: 400 },
    );
  }

  const apiKey = parsed.data.apiKey.trim();

  // Provider-specific key shape sanity check (matches saveLlmKeyAction:102).
  if (!apiKey.startsWith("sk-ant-")) {
    return Response.json(
      { ok: false, error: "invalid_key_shape", detail: "Anthropic keys start with sk-ant-" },
      { status: 400 },
    );
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptValue(apiKey);
  } catch {
    return Response.json(
      {
        ok: false,
        error: "encryption_unavailable",
        detail: "Set ENCRYPTION_KEY env var on the deployment.",
      },
      { status: 500 },
    );
  }

  const [orgRow] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!orgRow) {
    return Response.json({ ok: false, error: "org_not_found" }, { status: 404 });
  }

  const existing = (orgRow.integrations ?? {}) as Record<string, unknown>;
  const last4 = apiKey.slice(-4);
  const hint = `sk-ant-…${last4}`;

  // Mirror saveLlmKeyAction's dynamic-key pattern (lib/integrations/llm/actions.ts:132)
  // so the JSONB merge typechecks against OrganizationIntegrations without cast.
  const provider: "anthropic" = "anthropic";
  const next = {
    ...existing,
    [provider]: {
      ...((existing[provider] as Record<string, unknown>) ?? {}),
      apiKey: encryptedKey,
      hint,
      savedAt: new Date().toISOString(),
    },
  };

  // The OrganizationIntegrations type definition (db/schema/organizations.ts:8)
  // doesn't enumerate `anthropic`/`openai` keys — they're stored via the same
  // JSONB column but typed loosely at the schema level. saveLlmKeyAction
  // exploits the dynamic-key pattern to bypass the strict type; here we cast
  // explicitly since `provider` is statically known.
  await db
    .update(organizations)
    .set({ integrations: next as unknown as typeof organizations.$inferInsert.integrations, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return Response.json({ ok: true, hint }, { status: 200 });
}
