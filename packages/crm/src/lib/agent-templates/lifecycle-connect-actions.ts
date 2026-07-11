// Agent lifecycle slice (T9) — Stage 03 "Connected": the connect action.
//
// Thin "use server" wrapper over the SAME managed-OAuth Connect flow
// /integrations already uses (lib/integrations/composio/client.ts
// createConnectLink) — no new connect rail. The callback lands the operator
// back on THIS agent's page (not /integrations) so the Connected stage can
// re-read live status server-side on return.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates } from "@/db/schema/agent-templates";
import { getOrgId, getCurrentUser } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { createConnectLink } from "@/lib/integrations/composio/client";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";
import { requiredToolkitSlugs } from "@/app/(dashboard)/studio/agents/[id]/lifecycle/connected-toolkits";
import type { AgentBlueprint } from "@/db/schema/agents";

export type ConnectLifecycleToolkitResult =
  | { ok: true; redirectUrl: string }
  | {
      ok: false;
      error: "unauthorized" | "unknown_toolkit" | "template_not_found" | "composio_not_configured";
    };

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "https://app.seldonframe.com";

/** Injectable seam (F8, Wave 2 review) so the org-guard is directly unit
 *  tested without a live DB/session — same convention as
 *  set-booking-policy.spec.ts / seller-actions.ts's resolvePublishGuard.
 *  Production wires the real getOrgId/getCurrentUser/db lookup/
 *  createConnectLink; no behavior change. */
/** A loaded template's identity + its own composio toolkit allowlist
 *  (composio live-tool-discovery slice, 2026-07-11) — the widened allowlist
 *  source: catalog ∪ THIS template's own bound toolkits. */
export type LoadedLifecycleTemplate = { id: string; composioToolkits: string[] };

export type ConnectLifecycleToolkitDeps = {
  getOrgId: () => Promise<string | null | undefined>;
  getCurrentUser: () => Promise<{ id: string } | null | undefined>;
  /** Org-guarded template lookup — same pattern as every other template
   *  action (e.g. startSupervisedRunAction): id AND builderOrgId must
   *  match, so a foreign templateId resolves to null. Also returns the
   *  template's own composio toolkit slugs so the operator can connect a
   *  non-catalog toolkit their OWN agent binds (never an arbitrary slug). */
  loadTemplate: (args: { templateId: string; orgId: string }) => Promise<LoadedLifecycleTemplate | null>;
  createConnectLink: typeof createConnectLink;
};

function defaultConnectLifecycleToolkitDeps(): ConnectLifecycleToolkitDeps {
  return {
    getOrgId,
    getCurrentUser,
    loadTemplate: async ({ templateId, orgId }) => {
      const [row] = await db
        .select({ id: agentTemplates.id, blueprint: agentTemplates.blueprint })
        .from(agentTemplates)
        .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
        .limit(1);
      if (!row) return null;
      const blueprint = row.blueprint as AgentBlueprint | null;
      return {
        id: row.id,
        composioToolkits: requiredToolkitSlugs(blueprint?.connectors ?? null),
      };
    },
    createConnectLink,
  };
}

/**
 * Begin a managed-OAuth Connect flow for a toolkit the Connected stage lists
 * as required, redirecting back to `/studio/agents/<templateId>#lc-connected`
 * on completion. Org-guarded on BOTH the session (getOrgId) AND the
 * template (F8, Wave 2 review — a templateId belonging to another org now
 * resolves to `template_not_found`, no link minted, BEFORE the toolkit's
 * allowlist check even matters); the toolkit must be in the curated catalog
 * OR one of THIS template's own bound composio toolkits (composio
 * live-tool-discovery slice, 2026-07-11 — widened from catalog-only so a
 * youtube-only agent can connect youtube) so an arbitrary slug can never be
 * forced through the authorize call.
 */
export async function connectLifecycleToolkitAction(
  input: { templateId: string; toolkit: string },
  deps: ConnectLifecycleToolkitDeps = defaultConnectLifecycleToolkitDeps(),
): Promise<ConnectLifecycleToolkitResult> {
  assertWritable();

  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const templateId = String(input.templateId ?? "").trim();
  if (!templateId) return { ok: false, error: "template_not_found" };

  const template = await deps.loadTemplate({ templateId, orgId });
  if (!template) return { ok: false, error: "template_not_found" };

  const requestedToolkit = String(input.toolkit ?? "").trim().toLowerCase();
  const isOwnToolkit = template.composioToolkits.includes(requestedToolkit);
  if (!getComposioToolkit(input.toolkit) && !isOwnToolkit) {
    return { ok: false, error: "unknown_toolkit" };
  }

  const callbackUrl = `${APP_ORIGIN}/studio/agents/${encodeURIComponent(templateId)}?connected=${encodeURIComponent(input.toolkit)}#lc-connected`;

  const user = await deps.getCurrentUser();
  const { redirectUrl } = await deps.createConnectLink(orgId, input.toolkit, callbackUrl, {
    actorUserId: user?.id ?? null,
  });
  if (!redirectUrl) return { ok: false, error: "composio_not_configured" };
  return { ok: true, redirectUrl };
}
