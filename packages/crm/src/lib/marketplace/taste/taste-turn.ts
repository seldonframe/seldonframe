// packages/crm/src/lib/marketplace/taste/taste-turn.ts
//
// Taste mode — ONE anonymous demo turn. FOUNDER ECONOMICS (final): the seller
// pays for taste (it's their CAC — they keep 95% of listing revenue), resolved
// exactly like paid rentals (getAIClient, BYOK-first). MONEY INVARIANT: if the
// creator org falls through to the PLATFORM key (provider === "platform",
// lib/ai/client.ts) and is NOT in SF_FLAGSHIP_ORG_IDS, we REFUSE — an
// anonymous stranger never burns the platform key for a third-party seller.
// Flagship (SF-owned) listings are the one intended exception.
//
// Seller-spend protection regardless of key: haiku pin + 400-token ceiling +
// testMode:true + capability intersection (design D2/D3). DI'd for node:test.

import type Anthropic from "@anthropic-ai/sdk";
import type { RentalAgent, RentalTurnResult } from "../agent-rental-run";
import type { TasteGrounding } from "@/db/schema/agent-taste-sessions";
import type { OrgSoul } from "@/lib/soul/types";
import { getAIClient } from "@/lib/ai/client";
import {
  runStatelessAgentTurn,
  type RunStatelessAgentTurnInput,
  type RunStatelessAgentTurnResult,
} from "@/lib/agents/stateless-turn";
import { TASTE_MODEL, TASTE_MAX_TOKENS, TASTE_CAPABILITY_ALLOWLIST } from "./taste-policy";
import { randomUUID } from "node:crypto";

export type TasteTurnDeps = {
  /** Resolution seam — REAL binding is getAIClient({orgId: creatorOrgId}).
   *  Only {client, provider} are read. */
  getClient: (args: { orgId: string }) => Promise<{ client: Anthropic | null; provider: string }>;
  runTurn: (input: RunStatelessAgentTurnInput) => Promise<RunStatelessAgentTurnResult>;
  flagshipOrgIds: Set<string>;
};

export const REAL_TASTE_TURN_DEPS: Omit<TasteTurnDeps, "flagshipOrgIds"> = {
  getClient: (args) => getAIClient({ orgId: args.orgId }),
  runTurn: runStatelessAgentTurn,
};

const NOT_AVAILABLE: RentalTurnResult = {
  ok: false,
  reason: "no_taste_key",
  message: "Free tasting isn't available for this agent right now.",
};

export async function runTasteTurn(
  input: { agent: RentalAgent; message: string; grounding: TasteGrounding | null },
  deps: TasteTurnDeps,
): Promise<RentalTurnResult> {
  const { agent, grounding } = input;

  const resolution = await deps.getClient({ orgId: agent.creatorOrgId });

  // ── MONEY INVARIANT (design §4.1): platform key only for flagship sellers.
  if (resolution.provider === "platform" && !deps.flagshipOrgIds.has(agent.creatorOrgId)) {
    return NOT_AVAILABLE;
  }
  if (!resolution.client) {
    return NOT_AVAILABLE;
  }

  // Two fences: capability intersection + testMode. The blueprint's capability
  // list drives getToolsForCapabilities inside the loop, so intersecting here
  // removes creator-workspace readers and every side-effect tool.
  const allow = new Set<string>(TASTE_CAPABILITY_ALLOWLIST);
  const tasteBlueprint = {
    ...agent.blueprint,
    capabilities: (agent.blueprint.capabilities ?? []).filter((c) => allow.has(c)),
  };

  // The taste pitch: the seller's agent, wearing the VISITOR's business.
  const orgName = grounding?.businessName?.trim() || agent.creatorOrgName;
  const soul: OrgSoul | null = grounding
    ? ({
        // Minimal OrgSoul-shaped grounding; unknown fields are simply absent.
        business_name: grounding.businessName,
        industry: grounding.industry,
        tagline: grounding.tagline,
        soul_description: grounding.description,
        services: grounding.services,
        voice: grounding.voiceTone,
      } as unknown as OrgSoul)
    : agent.soul;

  const result = await deps.runTurn({
    orgId: agent.creatorOrgId,
    orgSlug: agent.creatorOrgSlug,
    orgName,
    soul,
    timezone: agent.timezone,
    blueprint: tasteBlueprint,
    messages: [{ role: "user", content: input.message }],
    testMode: true, // second fence: every write tool short-circuits, no DB path
    client: resolution.client,
    modelOverride: TASTE_MODEL,
    maxTokensOverride: TASTE_MAX_TOKENS,
  });

  if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
  return { ok: true, reply: result.reply, conversationId: `taste_${randomUUID()}` };
}
