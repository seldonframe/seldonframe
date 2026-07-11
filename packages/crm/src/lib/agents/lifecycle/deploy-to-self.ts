// Agent lifecycle slice (T11) — Stage 05 "Sell", the "For myself" card.
//
// Pure(-ish) orchestration, every I/O injected — mirrors the
// continue-interview / supervised-run split so this module is directly
// unit-testable with fakes (no DB, no session). The thin "use server" wrapper
// (lib/agent-templates/deploy-to-self-actions.ts) resolves the real org id +
// wires the real store calls.
//
// REUSE, not a new rail: `deps.createDeployment` is the SAME
// lib/deployments/store.ts createDeployment the client-deploy stepper calls
// (via createDeploymentAction) — just invoked directly with
// `existingClientOrgId` set to the OPERATOR'S OWN org id, so the deployment's
// clientOrgId resolves to the caller's own org rather than a separate client
// workspace. `deps.activateDeployment` is the SAME store.updateDeployment
// status flip activateOutboundDeploymentAction already performs for a
// phone-less agent.
//
// Money-safe / security invariant: this NEVER targets any org other than the
// caller's own — `builderOrgId` and `existingClientOrgId` are BOTH always
// `input.orgId`, asserted at the deps boundary (never a caller-supplied
// target org). A phone-owning trigger (inbound voice/sms, or the
// missed_call event) is left in `draft` — self-deploy activates ONLY the
// phone-less kinds, honestly reporting `active:false` + a next-step hint
// rather than silently activating a receptionist with no line.

import { resolveAgentTrigger, type AgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import { agentNeedsNumber } from "@/lib/agents/triggers/agent-trigger";
import type { AgentBlueprint } from "@/db/schema/agents";

export type DeploymentSurfaceLike = "phone" | "embed" | "link" | "sms" | "email";

/** Map a resolved trigger onto the deployment `surface` column. Pure. */
export function deploymentSurfaceForTrigger(trigger: AgentTrigger): DeploymentSurfaceLike {
  switch (trigger.kind) {
    case "inbound":
      if (trigger.channel === "voice") return "phone";
      if (trigger.channel === "chat") return "embed";
      if (trigger.channel === "email") return "email";
      return "sms";
    case "event":
      return trigger.channel === "email" ? "email" : "sms";
    case "schedule":
      return "email";
  }
}

/** A plain-words sentence describing what firing this trigger means for the
 *  operator — the Sell stage's "checks your inbox every hour" success copy.
 *  Pure; never throws. */
export function triggerSentence(trigger: AgentTrigger): string {
  switch (trigger.kind) {
    case "inbound":
      if (trigger.channel === "voice") return "answers your phone.";
      if (trigger.channel === "chat") return "answers chat on your site.";
      if (trigger.channel === "email") return "answers your inbox.";
      return "answers your texts.";
    case "event":
      return `runs automatically after "${trigger.event}".`;
    case "schedule":
      return "checks in on a schedule.";
  }
}

export type DeployToSelfDeps = {
  /** The SAME lib/deployments/store.ts createDeployment. Called with
   *  builderOrgId === existingClientOrgId === the caller's own org — never a
   *  different target. */
  createDeployment: (args: {
    builderOrgId: string;
    agentTemplateId: string;
    clientName: string;
    surface: DeploymentSurfaceLike;
    existingClientOrgId: string;
  }) => Promise<{ ok: true; deploymentId: string } | { ok: false; error: string }>;
  /** The SAME store.updateDeployment status flip (no phone number) — only
   *  called for a phone-less trigger. */
  activateDeployment: (deploymentId: string) => Promise<{ ok: boolean }>;
};

export type DeployToSelfResult =
  | { ok: true; deploymentId: string; active: boolean; triggerSentence: string }
  | { ok: false; error: "create_failed" };

/**
 * Deploy this template into the OPERATOR'S OWN workspace ("For myself").
 * Phone-less triggers (chat/email/sms inbound, pure-outbound events,
 * schedule) activate immediately — the schedule cron / event bus already
 * fires for an `active` deployment, no new infrastructure. A phone-owning
 * trigger is created as `draft` (self-deploy never buys/claims a number on
 * the operator's behalf) and reported honestly as `active:false`.
 */
export async function deployToSelfCore(
  deps: DeployToSelfDeps,
  input: {
    orgId: string;
    orgName: string;
    templateId: string;
    blueprint: AgentBlueprint;
  },
): Promise<DeployToSelfResult> {
  const trigger = resolveAgentTrigger(input.blueprint.trigger);
  const surface = deploymentSurfaceForTrigger(trigger);

  const created = await deps.createDeployment({
    builderOrgId: input.orgId,
    agentTemplateId: input.templateId,
    clientName: input.orgName,
    surface,
    // Self-target: the "client" this deployment attaches to IS the caller's
    // own org — never any other org id.
    existingClientOrgId: input.orgId,
  });
  if (!created.ok) return { ok: false, error: "create_failed" };

  const needsNumber = agentNeedsNumber(trigger);
  let active = false;
  if (!needsNumber) {
    const activated = await deps.activateDeployment(created.deploymentId);
    active = activated.ok;
  }

  return {
    ok: true,
    deploymentId: created.deploymentId,
    active,
    triggerSentence: triggerSentence(trigger),
  };
}
