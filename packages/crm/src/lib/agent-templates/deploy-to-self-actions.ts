// Agent lifecycle slice (T11) — Stage 05 "Sell": the "For myself" server
// action. THIN wiring over the tested, pure `deployToSelfCore`
// (lib/agents/lifecycle/deploy-to-self.ts) — resolves the org-guarded
// template + org name, then calls the SAME store.createDeployment /
// store.updateDeployment the client-deploy stepper already uses.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates, organizations } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import {
  createDeployment,
  updateDeployment,
  getDeploymentOrgAndTemplate,
  stampDeploymentTriggerUpgraded,
  countDeploymentsForTemplate,
  persistDeploymentConnectedAccountId,
} from "@/lib/deployments/store";
import { deployToSelfCore, type DeployToSelfDeps } from "@/lib/agents/lifecycle/deploy-to-self";
import { ingestSentMailVoiceProfile } from "@/lib/agents/voice-profile/ingest-sent-mail";
import { buildVoiceIngestDeps } from "@/lib/agents/voice-profile/build-deps";
import { maybeUpgradeInboxTriggerToPush } from "@/lib/deployments/upgrade-inbox-trigger";
import { getAgentTemplate, updateAgentTemplate } from "@/lib/agent-templates/store";
import { createTrigger, listConnections, listConnectedAccountIds } from "@/lib/integrations/composio/client";
import {
  hasDeclaredTemplateVariables,
  TEMPLATE_VARIABLES_DEPLOY_GUARD_MESSAGE,
} from "@/lib/agent-templates/generalize";

export type DeployToSelfActionResult =
  | { ok: true; deploymentId: string; active: boolean; triggerSentence: string }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "template_not_found"
        | "create_failed"
        // Duplicate guard (2026-07-16): this template is already live in the
        // caller's workspace — a second copy would multiply LLM spend on
        // every trigger fire. UI copy: "already deployed — it's live".
        | "already_deployed";
    }
  | { ok: false; error: "template_variables_unfilled"; message: string };

/** "For myself" — one-click self-deploy into the OPERATOR'S OWN workspace. */
export async function deployToSelfAction(templateId: string): Promise<DeployToSelfActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [template] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, templateId), eq(agentTemplates.builderOrgId, orgId)))
    .limit(1);
  if (!template) return { ok: false, error: "template_not_found" };

  // Review fix (2026-07-16) — "Deploy for myself" writes a `deployments` row
  // with NO templateVarValues; resolveDeploymentPersona would then silently
  // DROP every declared token, vanishing the AUTHOR's own details from their
  // OWN live agent (the never-lies invariant inverted). This surface has no
  // fill form (that lives on the studio/agents/[id]/deploy wizard) — reject
  // rather than build a second one here.
  if (hasDeclaredTemplateVariables(template.blueprint as AgentBlueprint | null)) {
    return {
      ok: false,
      error: "template_variables_unfilled",
      message: TEMPLATE_VARIABLES_DEPLOY_GUARD_MESSAGE,
    };
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "unauthorized" };

  const deps: DeployToSelfDeps = {
    createDeployment: async (args) => {
      const result = await createDeployment({
        builderOrgId: args.builderOrgId,
        agentTemplateId: args.agentTemplateId,
        clientName: args.clientName,
        surface: args.surface,
        existingClientOrgId: args.existingClientOrgId,
      });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, deploymentId: result.deployment.id };
    },
    activateDeployment: async (deploymentId) => {
      const result = await updateDeployment({ id: deploymentId, patch: { status: "active" } });
      return { ok: result.ok };
    },
    // Email-agent slice (Part A3) — best-effort voice-profile ingestion,
    // fired only for an email+gmail deploy (deployToSelfCore's own gate).
    // Never blocks/fails the deploy — deployToSelfCore already wraps the
    // call in try/catch.
    ingestVoiceProfile: async ({ orgId: ingestOrgId }) => {
      await ingestSentMailVoiceProfile(buildVoiceIngestDeps(ingestOrgId), {
        orgId: ingestOrgId,
      });
    },
    // Email-agent slice (Part B2) — best-effort poll->push upgrade. The
    // module itself checks ALL conditions; deployToSelfCore already wraps
    // this call in try/catch, so a failure here never fails the deploy.
    maybeUpgradeInboxTrigger: async ({ orgId: upgradeOrgId, deploymentId }) =>
      maybeUpgradeInboxTriggerToPush(
        {
          getDeployment: getDeploymentOrgAndTemplate,
          getTemplateBlueprint: async (agentTemplateId) => {
            const tmpl = await getAgentTemplate(agentTemplateId);
            return (tmpl?.blueprint ?? null) as AgentBlueprint | null;
          },
          countDeploymentsForTemplate,
          hasWebhookSecret: () => Boolean(process.env.COMPOSIO_WEBHOOK_SECRET?.trim()),
          isGmailConnected: async (checkOrgId) => {
            const connections = await listConnections(checkOrgId);
            return connections.some((c) => c.slug === "gmail" && c.connected);
          },
          createTrigger: (triggerOrgId, connectedAccountId) =>
            createTrigger(triggerOrgId, "GMAIL_NEW_GMAIL_MESSAGE", undefined, {
              connectedAccountId,
            }),
          updateTemplateTrigger: async (agentTemplateId, trigger) => {
            const updated = await updateAgentTemplate({
              id: agentTemplateId,
              patch: { trigger },
            });
            if (!updated.ok) throw new Error(updated.error);
          },
          stampUpgraded: stampDeploymentTriggerUpgraded,
          // Agent receipts slice (Task 4) — the connected-account pin.
          listConnectedAccounts: (accountsOrgId) => listConnectedAccountIds(accountsOrgId, "gmail"),
          persistConnectedAccountId: persistDeploymentConnectedAccountId,
        },
        { orgId: upgradeOrgId, deploymentId },
      ),
  };

  const result = await deployToSelfCore(deps, {
    orgId,
    orgName: org.name,
    templateId,
    blueprint: (template.blueprint ?? {}) as AgentBlueprint,
  });
  if (!result.ok) return result;
  return result;
}
