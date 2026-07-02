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
import { voiceManagedEnabled, TIER0_READY_FLOOR_MICROS } from "@/lib/telephony/voice-metering";
import { resolveMasterTwilio } from "@/lib/telephony/sf-managed";
import { getWalletBalanceMicros, resolveWalletStripeMode } from "@/lib/build/wallet-store";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { Deployment } from "@/db/schema/deployments";

/**
 * Task 10 — whether SF's Tier-0 (zero-connect) instant-number path can
 * satisfy this org's telephony requirement RIGHT NOW: the feature is on, SF
 * has master Twilio creds configured, and the org's wallet (the SAME
 * stripeMode-resolved wallet every metered path debits) holds at least
 * TIER0_READY_FLOOR_MICROS. Short-circuits on the cheap env checks before
 * ever touching the DB for a balance read.
 *
 * T10 review, F5 — the balance read fails CLOSED (`.catch(() => 0)`): a
 * wallet/DB hiccup here must degrade to "Tier-0 unavailable"
 * (needs_connect/phone_required, the pre-Task-10 experience), never to a
 * false "available" that could offer a purchase path on bad data. This
 * mirrors this same file's `readiness.ready` gate, which already fails safe
 * on any thrown error upstream — money-safety means erring toward "ask the
 * builder to connect BYO Twilio" over "silently assume they're funded."
 */
async function resolveTier0Available(orgId: string): Promise<boolean> {
  if (!voiceManagedEnabled(process.env) || !resolveMasterTwilio(process.env)) {
    return false;
  }
  const stripeMode = resolveWalletStripeMode(process.env);
  const balanceMicros = await getWalletBalanceMicros(orgId, stripeMode).catch(() => 0);
  return balanceMicros >= TIER0_READY_FLOOR_MICROS;
}

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
  // Tier-0 (Task 10) — only worth a wallet-balance read when telephony is
  // actually needed and BYO didn't already satisfy it; skips the DB round
  // trip entirely for chat-only deploys and already-connected voice deploys.
  const tier0Available =
    telephonyNeeded && !telephonyConnected ? await resolveTier0Available(orgId) : false;

  // progress lives on the deployment customization (onboardingProgress); tolerate absence.
  const progress = deployment.customization?.onboardingProgress ?? null;

  // buyerSetupPath returns null when the deployment id is somehow blank; fall
  // back to the buyer home route rather than emit a broken wizard link.
  const wizardPath = buyerSetupPath(deployment.id) ?? "/agent";

  return computeDeployReadiness({
    steps, toolStatuses, telephonyNeeded, telephonyConnected, tier0Available, progress,
    wizardPath,
  });
}
