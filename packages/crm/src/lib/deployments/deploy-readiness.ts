// The deploy verb's requirement detector. PURE + sync: the impure caller (the
// /api/v1/build/deploy route) resolves the four inputs and this merges them into
// one readiness object. Reuses the buyer onboarding engine's language so the IDE
// deploy verb and the web wizard agree on what "ready" means.
//
//   steps            = buildOnboardingSteps(normalizeBlueprintForOnboarding(type, blueprint))
//   toolStatuses     = computeToolConnectionStatuses(blueprint.connectors, isBindingConnectedForOrg(orgId, …))  [LIVE]
//   telephonyNeeded  = deploymentNeedsNumber(blueprint.trigger, surfaceForType(type))
//   telephonyConnected = the org has Twilio creds OR the deployment already has a number  [LIVE]
//   tier0Available   = voiceManagedEnabled(env) && master creds present && wallet ≥
//                      TIER0_READY_FLOOR_MICROS (Task 10 — SF's zero-connect
//                      instant-number path; resolved upstream, this fn only ORs
//                      it against telephonyConnected)
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

/** Shown as the telephony requirement's label whenever it's unmet — i.e.
 *  neither BYO Twilio nor SF's Tier-0 instant-number path can satisfy it
 *  (Task 10). Replaces the old static "Phone number" label so the operator
 *  sees BOTH ways to unblock it, not just "connect Twilio". */
const TELEPHONY_UNMET_LABEL =
  "Top up your wallet for an instant SF number, or connect your own Twilio.";

export function computeDeployReadiness(input: {
  steps?: OnboardingStep[];
  toolStatuses?: ToolConnectionStatus[];
  telephonyNeeded?: boolean;
  telephonyConnected?: boolean;
  /** SF's Tier-0 (zero-connect, wallet-funded) instant-number path is
   *  available (Task 10) — resolved upstream from voiceManagedEnabled(env) &&
   *  master Twilio creds && wallet balance ≥ TIER0_READY_FLOOR_MICROS.
   *  Absent/false ⇒ byte-identical prior behavior (telephony met solely by
   *  telephonyConnected). */
  tier0Available?: boolean;
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

  // 3. Telephony — only when the agent needs a phone line. Met by BYO Twilio
  //    OR SF's Tier-0 instant-number path (Task 10) — either unblocks deploy,
  //    so this is a plain OR. The label communicates BOTH paths only when
  //    unmet (met:true never surfaces a label to the operator downstream).
  if (input.telephonyNeeded) {
    const met = Boolean(input.telephonyConnected) || Boolean(input.tier0Available);
    requirements.push({
      kind: "telephony",
      met,
      label: met ? "Phone number" : TELEPHONY_UNMET_LABEL,
    });
  }

  const missing = requirements.filter((r) => !r.met);
  return { ready: missing.length === 0, requirements, missing, wizardPath: input.wizardPath };
}
