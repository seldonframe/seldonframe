// Agency multi-client deploy — the server action.
//
// An agency installs a marketplace agent TEMPLATE (an `agent_templates` row in
// its builder org) and deploys it as a LIVE agent into MANY of its EXISTING
// client workspaces at once. Each created agent runs grounded by that client's
// OWN soul automatically: the runtime (lib/agents/runtime.ts executeTurn →
// lib/agents/prompt.ts composeSystemPrompt) loads `organizations.soul` for the
// agent's org at every turn. We therefore NEVER copy the soul — one createAgent
// per client (carrying the template's blueprint) is all it takes, and the same
// template speaks each client's business with zero per-client edits.
//
// Flow: org-guard the agency (getOrgId — the builder org) → resolve its
// partner_agencies id → enumerate its client workspaces (parentAgencyId, not
// archived) → INTERSECT with the requested client ids (so a caller can never
// write into an org that isn't this agency's) → find which of those already run
// this template (idempotency) → planClientDeployments → createAgent per client.
// Each client's createAgent is wrapped in try/catch so one failure soft-fails
// that client without aborting the batch. Returns { deployed, skipped }.
//
// "use server" — async exports ONLY (the planner, types, and store helpers live
// in plain sibling modules). NO new migration: the idempotency marker rides in
// the agent's existing jsonb blueprint (sourceTemplateId).

"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { createAgent } from "@/lib/agents/store";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import {
  resolveBuilderAgency,
  listClientOrgsForAgency,
  listClientOrgIdsWithTemplateAgent,
} from "./store";
import {
  planClientDeployments,
  runClientDeployments,
  type DeployedClientResult,
  type SkippedClientResult,
} from "./plan-client-deployments";

export type DeployAgentTemplateToClientsResult =
  | {
      ok: true;
      deployed: DeployedClientResult[];
      skipped: SkippedClientResult[];
    }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "template_not_found"
        | "no_agency"
        | "no_client_workspaces"
        | "no_valid_targets";
    };

/**
 * Deploy one of the agency's agent templates to a chosen set of its EXISTING
 * client workspaces. Idempotent: clients that already run an agent created from
 * this template are skipped (reason 'already_deployed'), never re-created — so a
 * re-run never produces duplicate agents. Per-client failures soft-fail (reason
 * 'create_failed') without aborting the batch.
 *
 * @param templateId    the agency's agent_templates.id to deploy
 * @param clientOrgIds  the client workspaces the agency picked (intersected with
 *                      the agency's actual client orgs — extras are ignored)
 */
export async function deployAgentTemplateToClientsAction(input: {
  templateId: string;
  clientOrgIds: string[];
}): Promise<DeployAgentTemplateToClientsResult> {
  assertWritable();

  const agencyOrgId = await getOrgId();
  if (!agencyOrgId) return { ok: false, error: "unauthorized" };

  // Load + ownership-guard the template (must belong to this builder org).
  const template = await getAgentTemplate(input.templateId);
  if (!template || template.builderOrgId !== agencyOrgId) {
    return { ok: false, error: "template_not_found" };
  }

  // Resolve the partner agency this builder org owns. No agency → this org has
  // no client-workspace hierarchy to deploy into.
  const agencyId = await resolveBuilderAgency(agencyOrgId);
  if (!agencyId) return { ok: false, error: "no_agency" };

  // Enumerate the agency's EXISTING client workspaces (parentAgencyId, active).
  const clientOrgs = await listClientOrgsForAgency(agencyId);
  if (clientOrgs.length === 0) {
    return { ok: false, error: "no_client_workspaces" };
  }

  // INTERSECT the requested ids with the agency's real client orgs — a caller
  // can never deploy into an org that isn't theirs (the requested list is just a
  // selection over the orgs we already authorized).
  const requested = new Set(input.clientOrgIds.filter(Boolean));
  const targets = clientOrgs.filter((o) => requested.has(o.id));
  if (targets.length === 0) return { ok: false, error: "no_valid_targets" };
  const targetIds = targets.map((o) => o.id);
  const nameById = new Map(targets.map((o) => [o.id, o.name]));

  // Idempotency input: which of the targets already run this template.
  const alreadyDeployed = await listClientOrgIdsWithTemplateAgent(
    targetIds,
    template.id,
  );

  // Pure plan: per-client createAgent args, skipping already-deployed clients.
  const plan = planClientDeployments(template, targetIds, alreadyDeployed);

  // Execute the plan. The create seam adapts createAgent → {ok, agentId}; the
  // shared runner records already-deployed clients as skipped (idempotency) and
  // soft-fails per client so one bad org never aborts the batch. Each createAgent
  // writes a LIVE agent into the CLIENT org — its soul is read at runtime, never
  // copied here.
  const { deployed, skipped } = await runClientDeployments({
    targetIds,
    plan,
    alreadyDeployed,
    nameById,
    createOne: async (item) => {
      const result = await createAgent({
        orgId: item.orgId,
        name: item.name,
        archetype: item.archetype,
        channel: item.channel,
        capabilities: item.capabilities,
        faq: item.faq,
        greeting: item.greeting,
        status: item.status, // 'live'
        sourceTemplateId: item.sourceTemplateId,
      });
      return result.ok
        ? { ok: true, agentId: result.agent.id }
        : { ok: false, error: result.error };
    },
  });

  // Refresh the agency's views (the editor + clients screens).
  revalidatePath("/studio/agents");
  revalidatePath(`/studio/agents/${template.id}/deploy-to-clients`);

  return { ok: true, deployed, skipped };
}
