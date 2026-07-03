// packages/crm/src/lib/marketplace/taste/taste-real-deps.ts
//
// Taste mode — binds the pure taste modules to the real platform services and
// hands the handler ONE optional TasteDeps object. buildTasteDeps returns
// UNDEFINED whenever SF_AGENT_TASTE_MODE != "1" — that single return is the
// global inertness switch (design D7): no deps object, no taste code path.

import type { TasteDeps } from "../agent-mcp-handler";
import type { RentalAgent } from "../agent-rental-run";
import { resolveAgentKeyStatus, type AgentKeyStatus } from "@/lib/ai/client";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { trackEvent } from "@/lib/analytics/track";
import { getRentalSigningSecret } from "../rental-secret";
import { mintTasteToken, verifyTasteToken } from "./taste-token";
import { createTasteSession, getTasteSession } from "./taste-session-store";
import { groundOnBusiness, REAL_GROUND_DEPS } from "./ground-business";
import { runTasteTurn, REAL_TASTE_TURN_DEPS } from "./taste-turn";
import {
  isTasteFlagOn,
  parseFlagshipOrgIds,
  resolveTasteBudget,
  hashTasteIp,
  buildTasteDoorsText,
  buildTasteInstructions,
} from "./taste-policy";

type KeyStatusFn = (orgId: string) => Promise<AgentKeyStatus>;

/** Listing-level activation: seller budget > 0 AND the key predicate passes
 *  (anthropic BYOK, or flagship with any key). Pure over its deps. */
export async function resolveTastePolicyForAgent(
  agent: RentalAgent,
  deps: { keyStatus: KeyStatusFn; flagshipOrgIds: Set<string> },
): Promise<{ active: false } | { active: true; visitorLimit: number; dailyCap: number }> {
  const budget = resolveTasteBudget(agent.sellerPreferences ?? null);
  if (budget.optedOut) return { active: false };

  const status = await deps.keyStatus(agent.creatorOrgId);
  const keyOk =
    (status.mode === "byok" && status.provider === "anthropic") ||
    (deps.flagshipOrgIds.has(agent.creatorOrgId) && status.hasKey);
  if (!keyOk) return { active: false };

  return { active: true, visitorLimit: budget.visitorLimit, dailyCap: budget.dailyCap };
}

export function buildTasteDeps(input: {
  request: { headers: { get(name: string): string | null } };
  env: Record<string, string | undefined>;
  /** DI seam: getRentalSigningSecret() reads env directly (no params), so
   *  specs override this rather than mutating process.env. Defaults to the
   *  real resolver. */
  secretResolver?: () => string;
}): TasteDeps | undefined {
  if (!isTasteFlagOn(input.env)) return undefined;

  const flagshipOrgIds = parseFlagshipOrgIds(input.env);
  const clientIp =
    input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret = safeSecret(input.secretResolver ?? getRentalSigningSecret);
  if (!secret) return undefined;
  const ipHash = hashTasteIp(clientIp, secret);

  return {
    ipHash,
    policyFor: (agent) =>
      resolveTastePolicyForAgent(agent, { keyStatus: resolveAgentKeyStatus, flagshipOrgIds }),
    checkLimit: (key, limit, windowMs) => checkRateLimit(key, limit, windowMs),
    ground: async ({ agent, url, ipHash: ih }) => {
      const now = new Date();
      const outcome = await groundOnBusiness(
        { url, creatorOrgId: agent.creatorOrgId },
        { ...REAL_GROUND_DEPS, flagshipOrgIds },
      );
      if (!outcome.ok) return { ok: false, text: outcome.message };
      const { sessionId } = await createTasteSession({
        listingId: agent.listingId,
        slug: agent.slug,
        sourceUrl: url,
        grounding: outcome.grounding,
        ipHash: ih,
        now,
      });
      const token = mintTasteToken({ slug: agent.slug, sessionId, secret, now });
      // NOTE: log sid only, never the token (Global Constraints).
      console.log(`[taste] grounded slug=${agent.slug} sid=${sessionId}`);
      return {
        ok: true,
        text:
          `Grounded on ${outcome.grounding.businessName} (${outcome.grounding.sourceDomain}). ` +
          `Now ask me anything — I'll answer as ${agent.agentName} working for YOUR business.\n\n` +
          `taste_session: ${token}\n(Include taste_session on your next ask calls. Expires in 1 hour.)`,
      };
    },
    runTasteTurn: async ({ agent, message, tasteSession }) => {
      const now = new Date();
      let grounding = null;
      if (tasteSession) {
        const verdict = verifyTasteToken({ token: tasteSession, slug: agent.slug, secret, now });
        if (verdict.kind === "valid") {
          grounding = await getTasteSession({ sessionId: verdict.sessionId, slug: agent.slug, now });
        }
        // Invalid/expired => run ungrounded; the reply text naturally invites
        // re-grounding (never a hard error — design D11).
      }
      return runTasteTurn({ agent, message, grounding }, { ...REAL_TASTE_TURN_DEPS, flagshipOrgIds });
    },
    doorsText: ({ agent, visitorLimit, reason }) =>
      buildTasteDoorsText({ agentName: agent.agentName, slug: agent.slug, visitorLimit, reason, env: input.env }),
    instructions: ({ agent, visitorLimit }) =>
      buildTasteInstructions({ agentName: agent.agentName, capabilities: agent.capabilities, visitorLimit }),
    track: (event, props, creatorOrgId) => {
      trackEvent(event, props, { orgId: creatorOrgId });
    },
  };
}

/** The rental secret is required for the endpoint anyway; if unresolvable we
 *  disable taste rather than throw (the paid path surfaces its own error). */
function safeSecret(resolver: () => string): string {
  try {
    return resolver();
  } catch {
    return "";
  }
}
