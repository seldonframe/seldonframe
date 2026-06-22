// Agency multi-client deploy — the PURE planner.
//
// An agency installs a marketplace agent TEMPLATE (an `agent_templates` row in
// its builder org) and wants to deploy it as a LIVE, Soul-grounded agent into
// MANY of its EXISTING client workspaces at once. The runtime
// (lib/agents/runtime.ts executeTurn → lib/agents/prompt.ts composeSystemPrompt)
// reads each client org's OWN `soul` at every turn, so the SAME template
// running in 100 client orgs speaks each client's business with zero per-client
// edits. We therefore NEVER copy the soul — we only create one `agents` row per
// client carrying the template's blueprint.
//
// This module is PURE (no DB, no I/O) so the mapping + idempotency logic is
// unit-tested in isolation (repo convention — see margin.ts / agent-templates
// store helpers). The DB-touching action (./deploy-to-clients-action.ts) feeds
// it the template, the agency's client orgs, and the set of client orgs that
// already run this template, then calls createAgent for each planned item.

import type { AgentTemplate } from "@/db/schema/agent-templates";
import type { AgentTemplateType } from "@/lib/agent-templates/store";
import type { AgentBlueprint } from "@/db/schema/agents";

// ─── template type → agent archetype + channel ───────────────────────────────
//
// A template's `type` is the product taxonomy (voice_receptionist | chat_assistant);
// a live agent's `archetype` + `channel` are the runtime taxonomy. This is the
// single mapping point. Anything that isn't an explicit chat_assistant maps to
// the voice receptionist (mirrors surfaceForType's voice-default, keeping the
// two taxonomies in lock-step). Pure.

export type AgentArchetype =
  | "website-chatbot"
  | "voice-receptionist"
  | "sms-followup-bot";

export type AgentChannel = "web_chat" | "voice" | "sms" | "email";

/** Map a template type to the (archetype, channel) a live agent uses. Pure. */
export function mapTemplateTypeToAgent(
  type: AgentTemplateType | string,
): { archetype: AgentArchetype; channel: AgentChannel } {
  if (type === "chat_assistant") {
    return { archetype: "website-chatbot", channel: "web_chat" };
  }
  // voice_receptionist (and any unknown legacy type) → voice receptionist.
  return { archetype: "voice-receptionist", channel: "voice" };
}

// ─── the planned createAgent args, per client ────────────────────────────────
//
// A subset of lib/agents/store.ts CreateAgentInput: exactly the fields this
// planner decides. `sourceTemplateId` is the idempotency stamp createAgent
// writes into the agent's blueprint so a re-deploy of the SAME template skips
// clients that already carry it. We deliberately omit `slug` — createAgent
// assigns 'default' to the FIRST agent in an org (so inbound voice/chat routes
// to it via run-channel-turn's loadDefaultAgent) and a unique slug otherwise.

export type PlannedClientDeployment = {
  /** The client workspace to create the live agent in. */
  orgId: string;
  /** Display name (the template's name — the agency's product). */
  name: string;
  archetype: AgentArchetype;
  channel: AgentChannel;
  /** Capabilities carried from the template blueprint (createAgent falls back to
   *  the archetype defaults when undefined). */
  capabilities?: string[];
  /** Knowledge/config carried from the template so each deployed instance
   *  behaves like the agency's tested template. The client's SOUL is NOT here —
   *  it's injected at runtime from the client org. */
  faq?: AgentBlueprint["faq"];
  greeting?: string;
  /** Go live immediately so inbound routes to it. */
  status: "live";
  /** Idempotency marker: the template this agent was deployed from. */
  sourceTemplateId: string;
};

/**
 * Plan the per-client createAgent args for deploying ONE template to a set of
 * the agency's client workspaces.
 *
 * - Maps the template's type → archetype + channel (the single mapping point).
 * - Carries the template's blueprint knowledge (capabilities/faq/greeting) onto
 *   each planned agent — but NEVER the soul (runtime injects each client's own).
 * - IDEMPOTENCY: skips any client already in `alreadyDeployedOrgIds` (clients
 *   that already run an agent created from this template), so a re-deploy is a
 *   no-op for them — no duplicate agents.
 * - Skips falsy / duplicate client org ids defensively (an empty selection or a
 *   doubled id never produces a bad/duplicate plan item).
 *
 * Returns one PlannedClientDeployment per client that should get a NEW agent.
 * Pure — the caller performs the actual createAgent writes.
 */
export function planClientDeployments(
  template: Pick<AgentTemplate, "id" | "name" | "type" | "blueprint">,
  clientOrgIds: string[],
  alreadyDeployedOrgIds: Iterable<string>,
): PlannedClientDeployment[] {
  const skip = new Set(alreadyDeployedOrgIds);
  const { archetype, channel } = mapTemplateTypeToAgent(template.type);

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;
  // Carry only truthy, non-empty knowledge so we never override createAgent's
  // archetype defaults with an empty array.
  const capabilities =
    Array.isArray(blueprint.capabilities) && blueprint.capabilities.length > 0
      ? blueprint.capabilities
      : undefined;
  const faq =
    Array.isArray(blueprint.faq) && blueprint.faq.length > 0
      ? blueprint.faq
      : undefined;
  const greeting =
    typeof blueprint.greeting === "string" && blueprint.greeting.trim().length > 0
      ? blueprint.greeting
      : undefined;

  const seen = new Set<string>();
  const plan: PlannedClientDeployment[] = [];
  for (const orgId of clientOrgIds) {
    if (!orgId) continue; // drop falsy ids
    if (seen.has(orgId)) continue; // de-dupe a doubled selection
    seen.add(orgId);
    if (skip.has(orgId)) continue; // idempotency: already has this template
    plan.push({
      orgId,
      name: template.name,
      archetype,
      channel,
      capabilities,
      faq,
      greeting,
      status: "live",
      sourceTemplateId: template.id,
    });
  }
  return plan;
}
