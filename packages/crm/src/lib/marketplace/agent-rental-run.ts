// Agent-marketplace MCP rental — the runtime bridge.
//
// Resolves a kind:'agent' marketplace listing by slug → its creator org's
// identity (name / slug / soul / timezone) + BYOK Anthropic client → runs the
// listing's blueprint through the agent runtime and returns the reply text.
//
// WHY runStatelessAgentTurn (not executeTurn directly): the public-turn path
// (app/api/v1/public/agent/[slug]/turn) calls executeTurn, which is DB-COUPLED
// — it loads a persisted `agents` row + an `agentConversations` row and
// persists turns. A MARKETPLACE LISTING is different: it carries an INLINE
// `agentBlueprint` (cloned from a Studio agent_templates row at publish time),
// NOT a deployed `agents` row, and a rental call has no persisted conversation.
// runStatelessAgentTurn is the SAME runtime loop lifted DB-free (same
// composeSystemPrompt, same getToolsForCapabilities, same MODEL + iteration
// cap) — exactly the seam built for "run a blueprint that has no agents row".
// So we reuse the runtime brain; we don't rebuild it.
//
// The agent runs on the CREATOR org's workspace + BYOK key (the builder who
// listed it pays the LLM bill and owns the tools the delegate drives). The
// renter just sends a message and gets a reply — "rent the whole agent as a
// delegate". testMode is FALSE: a rented agent does real work (its
// book_appointment etc. actually run against the creator's workspace), which is
// the entire value of renting it.
//
// conversation_id: stateless turns are independent. v1 echoes a stable id back
// so a renter can thread their own UI, but server-side cross-turn history is a
// FOLLOW-ON (it needs the conversation persistence executeTurn has). Each call
// is a fresh single-turn delegation today.

import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { marketplaceListings, organizations } from "@/db/schema";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { OrgSoul } from "@/lib/soul/types";
import { getAIClient } from "@/lib/ai/client";
import { runStatelessAgentTurn } from "@/lib/agents/stateless-turn";

/** The resolved rental target: the listing's agent + its creator-org context. */
export type RentalAgent = {
  listingId: string;
  slug: string;
  /** Display name for the MCP serverInfo + the `ask` tool description. */
  agentName: string;
  /** Capability allowlist (drives the `ask` description + the tools the turn
   *  may call). */
  capabilities: string[];
  /** The creator org the agent runs as (workspace + BYOK + soul). */
  creatorOrgId: string;
  creatorOrgName: string;
  creatorOrgSlug: string;
  soul: OrgSoul | null;
  timezone: string;
  blueprint: AgentBlueprint;
};

/**
 * Resolve a PUBLISHED kind:'agent' listing by slug into a runnable RentalAgent.
 * Returns null when the slug doesn't resolve to a published agent listing (the
 * route maps that to a JSON-RPC error). Joins the creator org so the turn has
 * the org's name/soul/timezone and the MCP server can name itself.
 */
export async function resolveRentalAgent(slug: string): Promise<RentalAgent | null> {
  const [row] = await db
    .select({
      listingId: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      kind: marketplaceListings.kind,
      agentBlueprint: marketplaceListings.agentBlueprint,
      isPublished: marketplaceListings.isPublished,
      creatorOrgId: marketplaceListings.creatorOrgId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      soul: organizations.soul,
      timezone: organizations.timezone,
    })
    .from(marketplaceListings)
    .innerJoin(organizations, eq(organizations.id, marketplaceListings.creatorOrgId))
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!row || row.kind !== "agent" || !row.agentBlueprint) return null;

  const blueprint = row.agentBlueprint;
  return {
    listingId: row.listingId,
    slug: row.slug,
    agentName: row.name,
    capabilities: Array.isArray(blueprint.capabilities) ? blueprint.capabilities : [],
    creatorOrgId: row.creatorOrgId,
    creatorOrgName: row.orgName,
    creatorOrgSlug: row.orgSlug,
    soul: (row.soul as OrgSoul | null) ?? null,
    timezone: row.timezone ?? "UTC",
    blueprint,
  };
}

export type RentalTurnResult =
  | { ok: true; reply: string; conversationId: string }
  | { ok: false; reason: string; message: string };

/**
 * Run ONE delegated turn against a resolved rental agent. Resolves the creator
 * org's BYOK client, then drives the blueprint through runStatelessAgentTurn
 * (the runtime loop). Returns the assistant reply text + a conversation id to
 * echo back. Never throws — a degraded LLM / missing key maps to a clean
 * { ok:false } the route surfaces as an MCP tool error.
 */
export async function runAgentRentalTurn(input: {
  agent: RentalAgent;
  message: string;
  conversationId?: string;
}): Promise<RentalTurnResult> {
  const conversationId = input.conversationId ?? `rental_${randomUUID()}`;

  const ai = await getAIClient({ orgId: input.agent.creatorOrgId });
  if (!ai.client) {
    return {
      ok: false,
      reason: "llm_not_configured",
      message:
        "This agent isn't available to rent right now — its workspace hasn't finished setup. Please try again later.",
    };
  }

  const result = await runStatelessAgentTurn({
    orgId: input.agent.creatorOrgId,
    orgSlug: input.agent.creatorOrgSlug,
    orgName: input.agent.creatorOrgName,
    soul: input.agent.soul,
    timezone: input.agent.timezone,
    blueprint: input.agent.blueprint,
    messages: [{ role: "user", content: input.message }],
    // A rented agent does REAL work — its write tools run against the creator's
    // workspace (the point of renting it). Not a sandbox preview.
    testMode: false,
    client: ai.client,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, message: result.message };
  }
  return { ok: true, reply: result.reply, conversationId };
}
