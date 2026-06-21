// ICP-3 — assemble the voice context for an inbound call that matched an active
// DEPLOYMENT (a builder's agent template deployed to a no-login SMB client).
//
// This is the genuinely-new piece of the deployment voice path. It is built
// ENTIRELY from existing, unchanged primitives:
//   - persona via composeVoicePersona using the agent TEMPLATE's blueprint
//     (greeting / voice / FAQ / customSkillMd / capabilities) — the product the
//     builder shaped and sells.
//   - soul + timezone + appointment intake fields from the BUILDER's org
//     (loadVoicePersonaInputs(builderOrgId)) — so the receptionist speaks the
//     builder's business facts and collects the builder's intake fields, and so
//     book_appointment lands in the builder's workspace calendar.
//   - a ToolExecuteContext scoped to the BUILDER's org (orgId = builderOrgId),
//     testMode:false (a real booking — the ICP-3 payoff).
//
// TEST-scope simplifications (future refinements, NOT built here):
//   - book into the builder org (per-client calendar via deployment.calendarRef
//     is a LATER refinement).
//   - transcript persisted to the builder org (no deployment_id column yet).
//   - the call runs on the platform OpenAI Realtime key (BYOK-for-voice later).
//
// All DB / template access is behind injectable `deps` (repo convention) so the
// assembly is unit-tested with no Postgres / network.

import { randomUUID } from "node:crypto";

import type { Deployment } from "@/db/schema/deployments";
import type { AgentTemplate } from "@/db/schema/agent-templates";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ToolExecuteContext } from "../tools";
import { composeVoicePersona } from "./persona";
import {
  loadVoicePersonaInputs,
  type VoicePersonaInputs,
} from "./voice-workspace";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import { getOrCreateVoiceAgent } from "./voice-agent";

/** What the webhook needs to run a deployment-routed call. Mirrors the fields
 *  the workspace path threads into runVoiceCall + startVoiceConversation. */
export type DeploymentVoiceContext = {
  /** Tool-execution context scoped to the BUILDER's org (real booking). */
  ctx: ToolExecuteContext;
  /** Composed persona (template blueprint + builder-org soul/intake). */
  instructions: string;
  /** Per-call TTS voice from the TEMPLATE blueprint. */
  audioVoice: string | undefined;
  /** Opening line from the TEMPLATE blueprint. */
  greeting: string | undefined;
  /** Where the transcript is persisted (builder org + its voice agent). */
  transcriptOrgId: string;
  transcriptAgentId: string;
};

/** Injectable seam — DI so the assembly is unit-tested without DB / network. */
export type DeploymentVoiceDeps = {
  /** Load the agent template (its blueprint is the persona source). */
  getAgentTemplate: (id: string) => Promise<AgentTemplate | null>;
  /** Builder-org persona inputs (soul / timezone / intake). agentId is irrelevant
   *  to the result because we OVERRIDE the blueprint with the template's, but the
   *  underlying loader still needs one — the default supplies the builder's voice
   *  agent id. */
  loadVoicePersonaInputs: (orgId: string) => Promise<VoicePersonaInputs>;
  /** The builder org's voice-receptionist agent id (ctx.agentId + transcript). */
  getVoiceAgentId: (orgId: string) => Promise<string>;
  /** Defaults to crypto.randomUUID — injectable so tests get a stable id. */
  generateConversationId: () => string;
};

function buildDefaultDeps(): DeploymentVoiceDeps {
  return {
    getAgentTemplate: (id) => getAgentTemplate(id),
    // The builder's voice agent id grounds the persona inputs loader; the
    // blueprint it returns is overridden by the template's below.
    loadVoicePersonaInputs: async (orgId) => {
      const { id } = await getOrCreateVoiceAgent({ orgId });
      return loadVoicePersonaInputs(orgId, id);
    },
    getVoiceAgentId: async (orgId) => {
      const { id } = await getOrCreateVoiceAgent({ orgId });
      return id;
    },
    generateConversationId: randomUUID,
  };
}

/**
 * Build the voice context for a matched deployment. Returns null when the
 * template can't be loaded (the deployment references a missing/deleted
 * template) so the webhook degrades to the existing fall-through rather than
 * dropping the call.
 *
 * Never throws on persona-input misses — loadVoicePersonaInputs is itself
 * best-effort (safe defaults), exactly as on the workspace path.
 */
export async function loadDeploymentVoiceContext(args: {
  deployment: Pick<Deployment, "builderOrgId" | "agentTemplateId">;
  now: Date;
  deps?: DeploymentVoiceDeps;
}): Promise<DeploymentVoiceContext | null> {
  const deps = args.deps ?? buildDefaultDeps();
  const builderOrgId = args.deployment.builderOrgId;

  // 1. The agent TEMPLATE blueprint is the persona source. No template → bail to
  //    the existing fall-through (don't drop the call).
  const template = await deps.getAgentTemplate(args.deployment.agentTemplateId);
  if (!template) return null;
  const templateBlueprint = (template.blueprint ?? {}) as AgentBlueprint;

  // 2. Builder-org soul / timezone / intake fields. We DISCARD the builder's own
  //    agent blueprint and use the template's instead.
  const personaInputs = await deps.loadVoicePersonaInputs(builderOrgId);

  // 3. The builder org's voice agent id — for the tool ctx + transcript row.
  const agentId = await deps.getVoiceAgentId(builderOrgId);

  // 4. Compose the persona: TEMPLATE blueprint + builder-org soul/timezone/intake.
  const instructions = composeVoicePersona({
    soul: personaInputs.soul,
    blueprint: templateBlueprint,
    timezone: personaInputs.timezone,
    now: args.now,
    intakeFields: personaInputs.intakeFields,
  });

  // 5. Tool context scoped to the BUILDER org → real booking in the builder's
  //    workspace calendar (per-client calendar is a later refinement).
  const ctx: ToolExecuteContext = {
    orgId: builderOrgId,
    // The builder org's slug isn't needed for booking (orgId drives it); the
    // public-booking action keys off orgId. Use the builder org id as a stable
    // non-empty placeholder so the ctx shape is satisfied.
    orgSlug: builderOrgId,
    agentId,
    conversationId: deps.generateConversationId(),
    testMode: false,
    timezone: personaInputs.timezone,
  };

  return {
    ctx,
    instructions,
    audioVoice: templateBlueprint.voice,
    greeting: templateBlueprint.greeting,
    transcriptOrgId: builderOrgId,
    transcriptAgentId: agentId,
  };
}
