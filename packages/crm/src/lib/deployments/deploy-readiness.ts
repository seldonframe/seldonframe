// The deploy verb's requirement detector. PURE + sync: the impure caller (the
// /api/v1/build/deploy route) resolves the four inputs and this merges them into
// one readiness object. Reuses the buyer onboarding engine's language so the IDE
// deploy verb and the web wizard agree on what "ready" means.
//
//   steps            = buildOnboardingSteps(normalizeBlueprintForOnboarding(type, blueprint))
//   toolStatuses     = computeToolConnectionStatuses(blueprint.connectors, isBindingConnectedForOrg(orgId, …))  [LIVE]
//   telephonyNeeded  = deploymentNeedsNumber(blueprint.trigger, surfaceForType(type))
//   telephonyConnected = the org has Twilio creds OR the deployment already has a number  [LIVE]
//   progress         = the deployment's onboarding progress (business_info etc.)

import type { OnboardingStep } from "@/lib/marketplace/onboarding/steps";
import type { ToolConnectionStatus } from "@/lib/agents/mcp/tool-connection";
import type { OnboardingProgress } from "@/lib/marketplace/onboarding/progress";
import { goLiveBlockers } from "@/lib/marketplace/buyer/buyer-onboarding";

export type DeployRequirement =
  | { kind: "calendar_oauth"; toolkit: string; met: boolean; label: string }
  | { kind: "other_connector"; toolkit: string; met: boolean; label: string }
  | { kind: "telephony"; met: boolean; label: string }
  | { kind: "business_info"; met: boolean; label: string };

export type DeployReadiness = {
  ready: boolean;
  requirements: DeployRequirement[];
  missing: DeployRequirement[];
  wizardPath: string;
};

const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

export function computeDeployReadiness(input: {
  steps?: OnboardingStep[];
  toolStatuses?: ToolConnectionStatus[];
  telephonyNeeded?: boolean;
  telephonyConnected?: boolean;
  progress?: OnboardingProgress | null;
  wizardPath: string;
}): DeployReadiness {
  const requirements: DeployRequirement[] = [];

  // 1. Required non-connector, non-phone steps (business_info / brand_info) —
  //    from the progress-based go-live blockers.
  const blockers = goLiveBlockers(input.steps ?? [], input.progress ?? null);
  const blockedKinds = new Set(blockers.map((b) => b.kind));
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.some((s) => s.kind === "business_info" || s.kind === "brand_info")) {
    const met = !blockedKinds.has("business_info") && !blockedKinds.has("brand_info");
    requirements.push({ kind: "business_info", met, label: "Business info" });
  }

  // 2. Connectors — LIVE connectedness (a calendar toolkit vs any other).
  for (const s of input.toolStatuses ?? []) {
    if (CALENDAR_TOOLKITS.has(s.key)) {
      requirements.push({ kind: "calendar_oauth", toolkit: s.key, met: s.connected, label: s.label });
    } else {
      requirements.push({ kind: "other_connector", toolkit: s.key, met: s.connected, label: s.label });
    }
  }

  // 3. Telephony — only when the agent needs a phone line.
  if (input.telephonyNeeded) {
    requirements.push({ kind: "telephony", met: Boolean(input.telephonyConnected), label: "Phone number" });
  }

  const missing = requirements.filter((r) => !r.met);
  return { ready: missing.length === 0, requirements, missing, wizardPath: input.wizardPath };
}
