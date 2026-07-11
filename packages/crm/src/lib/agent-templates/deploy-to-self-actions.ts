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
import { createDeployment, updateDeployment } from "@/lib/deployments/store";
import { deployToSelfCore, type DeployToSelfDeps } from "@/lib/agents/lifecycle/deploy-to-self";

export type DeployToSelfActionResult =
  | { ok: true; deploymentId: string; active: boolean; triggerSentence: string }
  | { ok: false; error: "unauthorized" | "template_not_found" | "create_failed" };

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
