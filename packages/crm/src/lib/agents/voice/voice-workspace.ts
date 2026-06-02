// Phase 1 voice — resolve the SINGLE configured test workspace into a
// ToolExecuteContext so a real phone call can look up availability and land a
// REAL booking in that workspace's /bookings.
//
// Per-workspace resolution FROM THE DIALED NUMBER is Phase 2. For Phase 1 we
// read one env var — VOICE_PHASE1_TEST_ORG_SLUG — look up that org's id + a
// representative agent id, and build the same ToolExecuteContext shape the text
// runtime uses (orgId, orgSlug, agentId, conversationId, testMode). testMode is
// FALSE here on purpose: the booking tools then hit the real
// submitPublicBookingAction and the appointment shows up in the operator's
// workspace — that's the Phase 1 payoff.
//
// agentId resolution is best-effort: a website-chatbot agent for the org if one
// exists, else ANY agent row for the org, else the orgId itself as a placeholder
// (the booking tools only require orgId + orgSlug — agentId is used for activity
// attribution on escalate_to_human, which the SDR rarely calls on a quick test
// booking, and a placeholder there is harmless: that path no-ops if the id
// doesn't match a real agent).
//
// The DB reads are behind injectable lookup functions (DI over drizzle-chain
// mocking — the repo's convention, see realtime-tools.spec.ts) so the
// resolution logic (no-slug / org-not-found / the agentId fallback chain) is
// unit-tested without a real Postgres.

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { agents, organizations } from "@/db/schema";
import type { ToolExecuteContext } from "../tools";
import { resolveWorkspaceByPhoneNumber } from "./resolve-workspace-by-number";
import { getOrCreateVoiceAgent } from "./voice-agent";

/** Env var naming the workspace Phase 1 voice calls book into. */
export const VOICE_PHASE1_TEST_ORG_SLUG_ENV = "VOICE_PHASE1_TEST_ORG_SLUG";

export type ResolveVoiceContextResult =
  | { ok: true; ctx: ToolExecuteContext }
  | {
      ok: false;
      /** Machine-readable cause for the log line. */
      reason: "no_slug_configured" | "org_not_found";
      /** The slug we tried (echoed for the log), if any. */
      slug: string | null;
    };

/** Resolved org identity. */
export type VoiceOrg = { id: string; slug: string };

export type VoiceWorkspaceDeps = {
  /** Look up an org by slug → { id, slug } or null. Defaults to a DB read. */
  lookupOrgBySlug: (slug: string) => Promise<VoiceOrg | null>;
  /** Best-effort agentId for an org: prefer a website-chatbot agent, else any
   *  agent, else null. Defaults to a DB read. */
  lookupAgentId: (orgId: string) => Promise<string | null>;
  /** Defaults to process.env[VOICE_PHASE1_TEST_ORG_SLUG_ENV]. */
  slug?: string | undefined;
  /** Defaults to crypto.randomUUID — injectable so tests get a stable id. */
  generateConversationId?: () => string;
};

// ─── default DB-backed lookups ──────────────────────────────────────────────

async function defaultLookupOrgBySlug(slug: string): Promise<VoiceOrg | null> {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return org ?? null;
}

async function defaultLookupAgentId(orgId: string): Promise<string | null> {
  // Prefer a website-chatbot agent for this org.
  const [chatbotAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.archetype, "website-chatbot")))
    .limit(1);
  if (chatbotAgent?.id) return chatbotAgent.id;

  // Fall back to ANY agent row for the org.
  const [anyAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .limit(1);
  return anyAgent?.id ?? null;
}

const DEFAULT_DEPS: VoiceWorkspaceDeps = {
  lookupOrgBySlug: defaultLookupOrgBySlug,
  lookupAgentId: defaultLookupAgentId,
};

/**
 * Resolve the Phase 1 test workspace into a ToolExecuteContext.
 *
 * Never throws — returns a discriminated result the route logs + acts on. A
 * missing env var or an unknown slug yields { ok:false } with a reason so the
 * route can log `voice_call_workspace_unresolved` and still run the call with a
 * tool-less persona (graceful: the caller hears a greeting, just no booking).
 */
// ─── A6: resolveVoiceContextByNumber ────────────────────────────────────────

/** All injectable deps for resolveVoiceContextByNumber. */
export type ResolveByNumberDeps = {
  /** Map a dialed E.164 number to an orgId, or null if unrecognised. */
  resolveOrgIdByNumber: (n: string) => Promise<string | null>;
  /** Look up an org's slug by its id. Returns null if not found. */
  lookupOrgSlug: (orgId: string) => Promise<string | null>;
  /** Get (or create) the voice receptionist agent id for an org. */
  getVoiceAgentId: (orgId: string) => Promise<string>;
  /** Phase-1 env-based fallback. Defaults to resolvePhase1VoiceContext. */
  envFallback: () => Promise<ResolveVoiceContextResult>;
  /** Defaults to crypto.randomUUID. */
  generateConversationId: () => string;
};

// Lazy defaults — only touch DB / resolve-workspace-by-number at call time so
// tests that inject all deps never trigger the imports.
function buildDefaultByNumberDeps(): ResolveByNumberDeps {
  return {
    resolveOrgIdByNumber: resolveWorkspaceByPhoneNumber,
    lookupOrgSlug: async (orgId: string) => {
      const [row] = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      return row?.slug ?? null;
    },
    getVoiceAgentId: async (orgId: string) => {
      const { id } = await getOrCreateVoiceAgent({ orgId });
      return id;
    },
    envFallback: () => resolvePhase1VoiceContext(),
    generateConversationId: randomUUID,
  };
}

/**
 * Phase 2 voice context resolution: try to resolve from the dialed number
 * first, then fall back to the Phase 1 env-var mechanism.
 *
 * Never throws. Returns a discriminated union augmented with `resolvedBy`:
 *   - "number"       — number matched an org in the DB
 *   - "env_fallback" — fell back to Phase 1 env-var AND it succeeded
 *   - "none"         — both paths failed
 */
export async function resolveVoiceContextByNumber(args: {
  dialedNumber: string | null;
  deps?: Partial<ResolveByNumberDeps>;
}): Promise<ResolveVoiceContextResult & { resolvedBy: "number" | "env_fallback" | "none" }> {
  const defaults = buildDefaultByNumberDeps();
  const resolveOrgIdByNumber = args.deps?.resolveOrgIdByNumber ?? defaults.resolveOrgIdByNumber;
  const lookupOrgSlug = args.deps?.lookupOrgSlug ?? defaults.lookupOrgSlug;
  const getVoiceAgentId = args.deps?.getVoiceAgentId ?? defaults.getVoiceAgentId;
  const envFallback = args.deps?.envFallback ?? defaults.envFallback;
  const generateConversationId = args.deps?.generateConversationId ?? defaults.generateConversationId;

  // Step 1 — try number-based lookup when a dialed number was supplied.
  if (args.dialedNumber !== null) {
    const orgId = await resolveOrgIdByNumber(args.dialedNumber);
    if (orgId !== null) {
      const orgSlug = await lookupOrgSlug(orgId);
      if (orgSlug !== null) {
        const agentId = await getVoiceAgentId(orgId);
        return {
          ok: true,
          ctx: {
            orgId,
            orgSlug,
            agentId,
            conversationId: generateConversationId(),
            testMode: false,
          },
          resolvedBy: "number",
        };
      }
    }
  }

  // Step 2 — fall back to the Phase 1 env-var mechanism.
  const fallbackResult = await envFallback();
  if (fallbackResult.ok) {
    return { ...fallbackResult, resolvedBy: "env_fallback" };
  }
  return { ...fallbackResult, resolvedBy: "none" };
}

// ─── resolvePhase1VoiceContext ───────────────────────────────────────────────

export async function resolvePhase1VoiceContext(
  deps?: Partial<VoiceWorkspaceDeps>,
): Promise<ResolveVoiceContextResult> {
  const lookupOrgBySlug = deps?.lookupOrgBySlug ?? DEFAULT_DEPS.lookupOrgBySlug;
  const lookupAgentId = deps?.lookupAgentId ?? DEFAULT_DEPS.lookupAgentId;
  const generateConversationId = deps?.generateConversationId ?? randomUUID;
  const slug = (
    deps?.slug ?? process.env[VOICE_PHASE1_TEST_ORG_SLUG_ENV]
  )?.trim();

  if (!slug) {
    return { ok: false, reason: "no_slug_configured", slug: null };
  }

  const org = await lookupOrgBySlug(slug);
  if (!org) {
    return { ok: false, reason: "org_not_found", slug };
  }

  // Best-effort agentId; orgId is the last-resort placeholder (booking tools
  // need only orgId + orgSlug).
  const agentId = (await lookupAgentId(org.id)) ?? org.id;

  return {
    ok: true,
    ctx: {
      orgId: org.id,
      orgSlug: org.slug,
      agentId,
      conversationId: generateConversationId(),
      // REAL booking — the Phase 1 payoff.
      testMode: false,
    },
  };
}
