// Agent lifecycle slice (T9) — Stage 03 "Connected": the connect action.
//
// Thin "use server" wrapper over the SAME managed-OAuth Connect flow
// /integrations already uses (lib/integrations/composio/client.ts
// createConnectLink) — no new connect rail. The callback lands the operator
// back on THIS agent's page (not /integrations) so the Connected stage can
// re-read live status server-side on return.

"use server";

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { createConnectLink } from "@/lib/integrations/composio/client";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";
import { getCurrentUser } from "@/lib/auth/helpers";

export type ConnectLifecycleToolkitResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: "unauthorized" | "unknown_toolkit" | "composio_not_configured" };

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "https://app.seldonframe.com";

/**
 * Begin a managed-OAuth Connect flow for a toolkit the Connected stage lists
 * as required, redirecting back to `/studio/agents/<templateId>#lc-connected`
 * on completion. Org-guarded; the toolkit must be in the curated catalog
 * (same allowlist /integrations enforces) so an arbitrary slug can never be
 * forced through the authorize call.
 */
export async function connectLifecycleToolkitAction(input: {
  templateId: string;
  toolkit: string;
}): Promise<ConnectLifecycleToolkitResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  if (!getComposioToolkit(input.toolkit)) {
    return { ok: false, error: "unknown_toolkit" };
  }

  const templateId = String(input.templateId ?? "").trim();
  const callbackUrl = `${APP_ORIGIN}/studio/agents/${encodeURIComponent(templateId)}?connected=${encodeURIComponent(input.toolkit)}#lc-connected`;

  const user = await getCurrentUser();
  const { redirectUrl } = await createConnectLink(orgId, input.toolkit, callbackUrl, {
    actorUserId: user?.id ?? null,
  });
  if (!redirectUrl) return { ok: false, error: "composio_not_configured" };
  return { ok: true, redirectUrl };
}
