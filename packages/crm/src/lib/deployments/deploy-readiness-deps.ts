// The deploy verb's IMPURE readiness resolver — resolves the four inputs
// `computeDeployReadiness` (deploy-readiness.ts, pure) merges into one
// DeployReadiness. Not "use server": a plain async helper the bearer route
// (api/v1/build/deploy) calls directly with an orgId it already resolved from
// the workspace bearer token, so every read below is explicitly orgId-scoped —
// nothing here reads the interactive session.

import { computeDeployReadiness, type DeployReadiness } from "@/lib/deployments/deploy-readiness";
import { normalizeBlueprintForOnboarding, buildOnboardingSteps } from "@/lib/marketplace/onboarding/steps";
import { computeToolConnectionStatuses } from "@/lib/agents/mcp/tool-connection";
import { isBindingConnectedForOrg } from "@/lib/agents/mcp/binding-connection";
import { deploymentNeedsNumber } from "@/lib/deployments/margin";
import { surfaceForType, type AgentTemplateType } from "@/lib/agent-templates/store";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { buyerSetupPath } from "@/lib/marketplace/buyer/buyer-routes";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { Deployment } from "@/db/schema/deployments";

export async function resolveDeployReadiness(args: {
  orgId: string;
  templateType: AgentTemplateType | string;
  blueprint: AgentBlueprint;
  deployment: Pick<Deployment, "id" | "phoneNumber" | "customization">;
}): Promise<DeployReadiness> {
  const { orgId, templateType, blueprint, deployment } = args;

  const normalized = normalizeBlueprintForOnboarding(templateType, blueprint);
  const steps = buildOnboardingSteps(normalized);

  const toolStatuses = await computeToolConnectionStatuses(
    blueprint.connectors ?? [],
    (binding) => isBindingConnectedForOrg(orgId, binding),
  );

  const surface = surfaceForType(templateType as AgentTemplateType);
  const telephonyNeeded = deploymentNeedsNumber(blueprint.trigger, surface);
  // telephony is "connected enough" if a number is already attached OR the org
  // has BYO Twilio creds so the deploy verb can provision/forward one.
  const telephony = await resolveBuilderTelephony(orgId);
  const telephonyConnected = Boolean(deployment.phoneNumber) || telephony.ok === true;

  // progress lives on the deployment customization (onboardingProgress); tolerate absence.
  const progress = deployment.customization?.onboardingProgress ?? null;

  // buyerSetupPath returns null when the deployment id is somehow blank; fall
  // back to the buyer home route rather than emit a broken wizard link.
  const wizardPath = buyerSetupPath(deployment.id) ?? "/agent";

  return computeDeployReadiness({
    steps, toolStatuses, telephonyNeeded, telephonyConnected, progress,
    wizardPath,
  });
}
