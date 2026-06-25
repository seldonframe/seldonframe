// ICP-3 — assemble the voice context for an inbound call that matched an active
// DEPLOYMENT (a builder's agent template deployed to a no-login SMB client).
//
// This is the genuinely-new piece of the deployment voice path. It is built
// ENTIRELY from existing, unchanged primitives:
//   - persona via composeVoicePersona using the agent TEMPLATE's blueprint
//     (greeting / voice / customSkillMd / capabilities) — the product the
//     builder shaped and sells. FAQ comes from the template UNLESS the client
//     supplied their own (deployment.clientContext.faq), which then wins.
//   - business IDENTITY + FACTS = the deployment's CLIENT. The deployed
//     receptionist speaks AS THE CLIENT, not as the builder. The persona soul is
//     built from deployment.clientContext (the client's OWN description +
//     services), with the business name defaulting to deployment.clientName. The
//     builder's own soul (industry / services / facts) is deliberately NOT used,
//     so the agent never pitches the builder's business to the client's callers.
//     No clientContext captured → a name-only soul (the original behavior).
//   - timezone + appointment intake fields from the BUILDER's org
//     (loadVoicePersonaInputs(builderOrgId)) — booking needs them.
//   - a ToolExecuteContext whose orgId/orgSlug + transcriptOrgId RETARGET to the
//     deployment's provisioned CLIENT workspace (deployment.clientOrgId) when set
//     (front-office bridge), so bookings/contacts/messages/transcripts all land
//     in the client's own front office. When clientOrgId is null (legacy
//     deployments + before activation provisions), all three fall back to the
//     BUILDER org — byte-for-byte the original behavior. testMode:false (a real
//     booking — the ICP-3 payoff).
//
// TEST-scope simplifications (future refinements, NOT built here):
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
import { deploymentToBinding } from "@/lib/deployments/booking-binding";
import { bindingToCtxBooking } from "@/lib/agents/booking/binding-ctx";
import { resolveBookingPolicy } from "@/lib/agents/booking/booking-policy";
import { resolveDeploymentPersona } from "@/lib/agents/persona/deployment-customization";

/** What the webhook needs to run a deployment-routed call. Mirrors the fields
 *  the workspace path threads into runVoiceCall + startVoiceConversation. */
export type DeploymentVoiceContext = {
  /** Tool-execution context. orgId/orgSlug target the CLIENT org when the
   *  deployment is provisioned (clientOrgId set), else the builder org. */
  ctx: ToolExecuteContext;
  /** Composed persona (template blueprint + CLIENT identity + builder-org intake). */
  instructions: string;
  /** Per-call TTS voice from the TEMPLATE blueprint. */
  audioVoice: string | undefined;
  /** Opening line from the TEMPLATE blueprint. */
  greeting: string | undefined;
  /** Where the transcript is persisted — the CLIENT org when provisioned, else
   *  the builder org (with the builder's voice agent id). */
  transcriptOrgId: string;
  transcriptAgentId: string;
};

/** Injectable seam — DI so the assembly is unit-tested without DB / network. */
export type DeploymentVoiceDeps = {
  /** Load the agent template (its blueprint is the persona source). */
  getAgentTemplate: (id: string) => Promise<AgentTemplate | null>;
  /** Builder-org persona inputs — only `timezone` + `intakeFields` are used (the
   *  blueprint is overridden by the template's, and the soul is replaced by the
   *  client identity). agentId is irrelevant to the result, but the underlying
   *  loader still needs one — the default supplies the builder's voice agent id. */
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
  deployment: Pick<
    Deployment,
    | "id"
    | "builderOrgId"
    | "agentTemplateId"
    | "clientName"
    | "clientContext"
    | "bookingMode"
    | "externalBookingUrl"
    | "bookingPolicy"
    | "customization"
    | "clientOrgId"
  > & {
    /** The client org's slug, left-joined by resolveDeploymentByNumber. The
     *  booking tools resolve the workspace by slug, so the retarget needs it.
     *  Optional/null → fall back to the client org id (or the builder org). */
    clientOrgSlug?: string | null;
  };
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

  // 2. Builder-org persona inputs. We take ONLY the timezone + appointment intake
  //    fields (booking needs them, and book_appointment lands in the builder's
  //    calendar). We DISCARD the builder's own agent blueprint (the template's is
  //    used instead) AND the builder's soul (so the agent never speaks the
  //    builder's business facts — see step 4).
  const personaInputs = await deps.loadVoicePersonaInputs(builderOrgId);

  // 3. The builder org's voice agent id — for the tool ctx + transcript row.
  const agentId = await deps.getVoiceAgentId(builderOrgId);

  // 4. Compose the persona: TEMPLATE blueprint + the CLIENT's identity AND
  //    business facts. The deployed receptionist speaks AS THE CLIENT, so the
  //    soul is built from the deployment's captured clientContext (the client's
  //    OWN business — description + services), NEVER from personaInputs.soul (the
  //    builder's business). When no clientContext was captured we fall back to a
  //    name-only soul (today's behavior). The client's business name defaults to
  //    deployment.clientName when the captured soul doesn't override it.
  //
  //    FAQ: when the client supplied their own FAQ we compose with it INSTEAD of
  //    the template's (the client's answers win — they're the ones on the phone),
  //    by shallow-overriding blueprint.faq. Absent → the template's FAQ stands.
  const clientContext = args.deployment.clientContext ?? null;
  const clientSoul = {
    ...(clientContext?.soul ?? {}),
    businessName: clientContext?.soul?.businessName || args.deployment.clientName,
  };

  // Per-deployment persona (P1). Resolve the EFFECTIVE greeting / TTS voice /
  // script the deployed agent speaks AS the client, from the TEMPLATE defaults
  // + the deployment's customization. Each field is null when its source is null
  // → we fall back to today's template value below. The script (the operator's
  // verbatim customSkillMd) is the one place a literal "{business name}" /
  // "{time of day}" can leak into the spoken prompt; resolveDeploymentPersona
  // fills/drops those tokens, which is what fixes the live placeholder leak. The
  // platform default skill body uses `{{double}}` tokens (rendered elsewhere) and
  // is NOT touched — so we only override customSkillMd when there WAS one to fill.
  const persona = resolveDeploymentPersona({
    templateGreeting: templateBlueprint.greeting ?? null,
    templateScript: templateBlueprint.customSkillMd ?? null,
    templateVoiceId: templateBlueprint.voice ?? null,
    customization: args.deployment.customization,
    clientName: args.deployment.clientName,
  });

  const baseBlueprint: AgentBlueprint =
    clientContext?.faq && clientContext.faq.length > 0
      ? { ...templateBlueprint, faq: clientContext.faq }
      : templateBlueprint;
  // Inject the placeholder-filled script as customSkillMd so composeVoicePersona
  // emits the FILLED operator prose (leak killed). null → the template had no
  // customSkillMd; leave it so the default skill body renders, unchanged.
  const personaBlueprint: AgentBlueprint =
    persona.prompt !== null
      ? { ...baseBlueprint, customSkillMd: persona.prompt }
      : baseBlueprint;
  const instructions = composeVoicePersona({
    soul: clientSoul,
    blueprint: personaBlueprint,
    timezone: personaInputs.timezone,
    now: args.now,
    intakeFields: personaInputs.intakeFields,
  });

  // 5. RETARGET (front-office bridge — the one load-bearing routing change).
  //    Every agent write keys off these three fields: bookings via ctx.orgSlug
  //    (the booking tools resolve the workspace by SLUG → organizations.slug),
  //    contacts/leads/messages via ctx.orgId, transcripts via transcriptOrgId.
  //    When the deployment has been provisioned a CLIENT workspace
  //    (clientOrgId set), point ALL THREE at the client org so the deployed
  //    agent's entire output lands in the client's own front office.
  //
  //    Fallback: clientOrgId null → builderOrgId for all three (legacy
  //    deployments + the window before activation provisions). This is the
  //    BYTE-FOR-BYTE-UNCHANGED path — when clientOrgId is null, orgId/orgSlug/
  //    transcriptOrgId are exactly what they were before this change. The
  //    persona (clientContext) + bookingMode already describe the client, so
  //    targeting the client org is consistent with them.
  //
  //    orgSlug uses the joined clientOrgSlug; if that's somehow missing (join
  //    miss / since-deleted org) we fall back to the client org id, then to the
  //    builder org id — never empty.
  const clientOrgId = args.deployment.clientOrgId ?? null;
  const targetOrgId = clientOrgId ?? builderOrgId;
  const targetOrgSlug = clientOrgId
    ? args.deployment.clientOrgSlug ?? clientOrgId
    : builderOrgId;

  const ctx: ToolExecuteContext = {
    orgId: targetOrgId,
    // The booking tools resolve the workspace by slug (organizations.slug), so
    // this must be the real client org slug when retargeted. On the legacy path
    // (clientOrgId null) it stays the builder org id, unchanged.
    orgSlug: targetOrgSlug,
    agentId,
    conversationId: deps.generateConversationId(),
    testMode: false,
    timezone: personaInputs.timezone,
    // 6. Per-deployment booking ctx (ICP-3). Built through the SAME
    //    deploymentToBinding → bindingToCtxBooking pipeline as chat/SMS/email so
    //    every surface maps identically: a connected client calendar
    //    (book_external) lands as mode:"native" + binding, which routes the
    //    booking tools through resolveCalendarBackend → the Composio adapter.
    //    Setting mode:"api_mcp" here was the bug — it hit the legacy "followup"
    //    handoff branch (tools.ts) and the agent took a message instead of
    //    booking into Google. external_link still maps to its handoff. Only the
    //    DEPLOYMENT path sets ctx.booking; workspace agents leave it undefined.
    //
    //    Per-client booking policy (P1): resolve the effective policy
    //    (deployment override → template default → system defaults) in the
    //    workspace timezone, and thread it onto ctx.booking so the booking tools
    //    shape their slots + required-fields gate from the client's real rules.
    booking: bindingToCtxBooking(
      deploymentToBinding(args.deployment),
      resolveBookingPolicy(
        args.deployment.bookingPolicy,
        templateBlueprint.defaultBookingPolicy ?? null,
        personaInputs.timezone,
      ),
    ),
  };

  return {
    ctx,
    instructions,
    // Per-deployment overrides (P1): the client's own TTS voice + spoken greeting
    // when set, else the template default (null → fall back, byte-for-byte today).
    audioVoice: persona.voiceId ?? templateBlueprint.voice,
    greeting: persona.greeting ?? templateBlueprint.greeting,
    // Transcript persists to the SAME org the writes target — the client org
    // when provisioned, else the builder org (unchanged).
    transcriptOrgId: targetOrgId,
    transcriptAgentId: agentId,
  };
}
