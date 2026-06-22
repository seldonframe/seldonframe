// Multi-surface runtime — the inbound resolver + the turn orchestrator.
//
// resolveInboundAgent + runChannelTurn are the seam that lets inbound SMS +
// email become real, tool-using agents: each route normalizes its provider
// payload into an InboundMessage, then calls runChannelTurn with the right
// ChannelAdapter. The orchestrator resolves the target agent, gets-or-creates
// the agentConversations thread, runs the canonical agent loop (executeTurn),
// and lets the adapter send the reply.
//
// UNIFIED RESOLVER (the whole point): an inbound "to" handle resolves to ONE
// agent via a fixed precedence —
//   1. resolveDeploymentByNumber(to) → if the number belongs to an ACTIVE
//      deployment WITH a provisioned client workspace (clientOrgId set), use the
//      CLIENT workspace's default agent. Because that agent's orgId = clientOrgId,
//      every write executeTurn drives (booking/contact/message) lands in the
//      CLIENT org — composing with the front-office bridge automatically.
//   2. else resolveOrgByFromNumber(to) → that workspace's default agent.
//   3. else null → the caller falls back to today's behavior (no regression).
//
// SOFT-FAIL EVERYWHERE: a resolver miss or an executeTurn {ok:false} returns
// { handled:false, reason } and sends NO reply. Nothing here throws — an inbound
// webhook must never 5xx because the agent layer hiccuped.
//
// Everything is dependency-injected; the default deps lazily import @/db,
// executeTurn, and the resolvers so unit tests (which inject fakes) never touch
// Postgres / Anthropic. This module is a PLAIN module: it is NOT a route handler
// and NOT a "use server" action; its only async-boundary callees are injected.

import type { ChannelAdapter, InboundMessage } from "./channel-adapter";

export type { ChannelAdapter, InboundMessage } from "./channel-adapter";

// ─── resolveInboundAgent ──────────────────────────────────────────────────

/** What the resolver yields: the agent to run + the org its writes land in. */
export type ResolvedAgent = { agentId: string; orgId: string } | null;

/** The minimal deployment slice the resolver needs (just the client-org link). */
type DeploymentClientSlice = { clientOrgId: string | null } | null;

export type ResolveInboundAgentDeps = {
  /** Match the dialed/texted number to an ACTIVE deployment (client front-office
   *  bridge). Returns at least { clientOrgId } or null. */
  resolveDeploymentByNumber: (toHandle: string) => Promise<DeploymentClientSlice>;
  /** Match the "to" handle to the workspace that owns it (the existing SMS
   *  workspace resolver). Returns the orgId or null. */
  resolveOrgByFromNumber: (toHandle: string) => Promise<string | null>;
  /** Load a workspace's default agent (slug='default') for the given org.
   *  Returns { agentId, orgId } or null when the org has no default agent. */
  loadDefaultAgent: (orgId: string) => Promise<{ agentId: string; orgId: string } | null>;
};

function buildDefaultResolveDeps(): ResolveInboundAgentDeps {
  return {
    resolveDeploymentByNumber: async (toHandle) => {
      const { resolveDeploymentByNumber } = await import(
        "@/lib/agents/voice/resolve-deployment-by-number"
      );
      const row = await resolveDeploymentByNumber(toHandle);
      return row ? { clientOrgId: row.clientOrgId } : null;
    },
    resolveOrgByFromNumber: async (toHandle) => {
      const { db } = await import("@/db");
      const { organizations } = await import("@/db/schema");
      const { toE164 } = await import("@/lib/sms/providers");
      const normalized = toE164(toHandle);
      if (!normalized) return null;
      // Mirror the live SMS route's resolveOrgByFromNumber: a workspace's Twilio
      // integration stores its number at integrations.twilio.fromNumber.
      const rows = await db
        .select({ id: organizations.id, integrations: organizations.integrations })
        .from(organizations);
      for (const row of rows) {
        const integrations = (row.integrations ?? {}) as Record<string, unknown>;
        const twilio = (integrations.twilio ?? {}) as { fromNumber?: string };
        const stored = twilio.fromNumber?.trim() ?? "";
        if (stored && toE164(stored) === normalized) return row.id;
      }
      return null;
    },
    loadDefaultAgent: async (orgId) => {
      const { db } = await import("@/db");
      const { agents } = await import("@/db/schema");
      const { and, eq, sql } = await import("drizzle-orm");
      // Prefer the canonical slug='default' agent (every workspace's first agent
      // gets that short slug). Restrict to live|test so a draft/paused agent
      // never auto-answers. lower(slug) match mirrors the agents_org_slug_uniq
      // index.
      const [row] = await db
        .select({ id: agents.id, orgId: agents.orgId })
        .from(agents)
        .where(
          and(
            eq(agents.orgId, orgId),
            sql`lower(${agents.slug}) = 'default'`,
            sql`${agents.status} in ('live','test')`,
          ),
        )
        .limit(1);
      return row ? { agentId: row.id, orgId: row.orgId } : null;
    },
  };
}

/**
 * Resolve an inbound "to" handle to exactly one agent, applying the fixed
 * deployment-first precedence. A deployment with no provisioned client workspace
 * (clientOrgId null — legacy) falls through to the workspace resolver, so it
 * never silently drops the message. Soft-fails to null on any thrown error
 * (a webhook must keep working even if a resolver query blows up).
 */
export async function resolveInboundAgent(
  deps: ResolveInboundAgentDeps,
  toHandle: string,
): Promise<ResolvedAgent> {
  try {
    // 1. Deployment number → client workspace's default agent (writes → client org).
    const deployment = await deps.resolveDeploymentByNumber(toHandle);
    if (deployment?.clientOrgId) {
      const agent = await deps.loadDefaultAgent(deployment.clientOrgId);
      if (agent) return agent;
      // Deployment matched but the client org has no default agent yet — fall
      // through to the workspace resolver below rather than dropping the message.
    }

    // 2. Workspace number → that workspace's default agent.
    const orgId = await deps.resolveOrgByFromNumber(toHandle);
    if (orgId) {
      const agent = await deps.loadDefaultAgent(orgId);
      if (agent) return agent;
    }

    // 3. Nothing matched.
    return null;
  } catch (err) {
    console.error(
      `[run-channel-turn] resolveInboundAgent_error to=${toHandle} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

// ─── runChannelTurn ────────────────────────────────────────────────────────

/** What get-or-create receives — enough to find/seed the right thread. */
export type GetOrCreateConversationArgs = {
  agentId: string;
  orgId: string;
  channel: InboundMessage["channel"];
  fromHandle: string;
  contactId?: string | null;
};

/** The executeTurn surface the orchestrator depends on (matches
 *  lib/agents/runtime.ts executeTurn). */
type ExecuteTurnResult =
  | { ok: true; assistantMessage: string }
  | { ok: false; reason: string; fallbackMessage: string };

export type RunChannelTurnDeps = {
  resolveInboundAgent: (toHandle: string) => Promise<ResolvedAgent>;
  /** Get-or-create the active agentConversations thread, returning its id. */
  getOrCreateConversation: (args: GetOrCreateConversationArgs) => Promise<string>;
  /** The canonical agent loop. */
  executeTurn: (input: {
    conversationId: string;
    userMessage: string;
  }) => Promise<ExecuteTurnResult>;
};

export type RunChannelTurnResult =
  | { handled: true; conversationId: string }
  | { handled: false; reason: string };

function buildDefaultRunDeps(): RunChannelTurnDeps {
  const resolveDeps = buildDefaultResolveDeps();
  return {
    resolveInboundAgent: (toHandle) => resolveInboundAgent(resolveDeps, toHandle),
    getOrCreateConversation: (args) => defaultGetOrCreateConversation(args),
    executeTurn: async (input) => {
      const { executeTurn } = await import("@/lib/agents/runtime");
      return executeTurn(input);
    },
  };
}

/**
 * Default DB-backed get-or-create for an agentConversations thread. Reuses the
 * most recent ACTIVE thread for (agentId, channel, fromHandle) so a back-and-
 * forth SMS/email conversation stays one thread; otherwise inserts a new row
 * carrying channelMeta { channel, fromHandle, contactId } + the agent's current
 * version + org. Mirrors the public-turn route's insert shape.
 */
async function defaultGetOrCreateConversation(
  args: GetOrCreateConversationArgs,
): Promise<string> {
  const { db } = await import("@/db");
  const { agentConversations, agents } = await import("@/db/schema");
  const { and, desc, eq, sql } = await import("drizzle-orm");

  // Reuse the latest active thread for this (agent, channel, sender). channelMeta
  // is jsonb; match on its channel + fromHandle keys so distinct senders to the
  // same agent keep distinct threads.
  const [existing] = await db
    .select({ id: agentConversations.id })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.agentId, args.agentId),
        eq(agentConversations.status, "active"),
        sql`${agentConversations.channelMeta}->>'channel' = ${args.channel}`,
        sql`${agentConversations.channelMeta}->>'fromHandle' = ${args.fromHandle}`,
      ),
    )
    .orderBy(desc(agentConversations.lastTurnAt))
    .limit(1);
  if (existing) return existing.id;

  const [agentRow] = await db
    .select({ currentVersion: agents.currentVersion })
    .from(agents)
    .where(eq(agents.id, args.agentId))
    .limit(1);

  const [created] = await db
    .insert(agentConversations)
    .values({
      agentId: args.agentId,
      agentVersion: agentRow?.currentVersion ?? 1,
      orgId: args.orgId,
      contactId: args.contactId ?? null,
      channelMeta: {
        channel: args.channel,
        fromHandle: args.fromHandle,
        contactId: args.contactId ?? null,
      },
      status: "active",
    })
    .returning({ id: agentConversations.id });

  if (!created) throw new Error("agent_conversations insert returned no row");
  return created.id;
}

/**
 * Route ONE inbound message through the agent loop:
 *   resolve agent → get-or-create thread → executeTurn → adapter.sendReply.
 *
 * Returns { handled:true, conversationId } when the turn ran, or
 * { handled:false, reason } when there's no target agent or the turn degraded.
 * SOFT-FAIL throughout — the reply is only sent on a non-empty ok turn, and a
 * send failure does NOT undo the turn (it already persisted), so we still report
 * handled. Nothing throws to the caller.
 */
export async function runChannelTurn(
  deps: RunChannelTurnDeps,
  inbound: InboundMessage,
  adapter: ChannelAdapter,
): Promise<RunChannelTurnResult> {
  // 1. Resolve the target agent (deployment-first; soft-fails to null).
  const agent = await deps.resolveInboundAgent(inbound.toHandle);
  if (!agent) return { handled: false, reason: "no_agent" };

  // 2. Get-or-create the conversation thread. A failure here is soft.
  let conversationId: string;
  try {
    conversationId = await deps.getOrCreateConversation({
      agentId: agent.agentId,
      orgId: agent.orgId,
      channel: inbound.channel,
      fromHandle: inbound.fromHandle,
      contactId: inbound.contactId ?? null,
    });
  } catch (err) {
    console.error(
      `[run-channel-turn] get_or_create_failed channel=${inbound.channel} to=${inbound.toHandle} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { handled: false, reason: "conversation_error" };
  }

  // 3. Run the canonical agent loop. A thrown error or {ok:false} is soft.
  let result: ExecuteTurnResult;
  try {
    result = await deps.executeTurn({
      conversationId,
      userMessage: inbound.text,
    });
  } catch (err) {
    console.error(
      `[run-channel-turn] execute_turn_threw convId=${conversationId} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { handled: false, reason: "execute_error" };
  }

  if (!result.ok) {
    // Degraded turn (llm not configured, conversation gone, etc.). Don't text a
    // fallback on inbound SMS/email — the operator sees it unread in the inbox.
    console.warn(
      `[run-channel-turn] turn_degraded convId=${conversationId} reason=${result.reason}`,
    );
    return { handled: false, reason: result.reason };
  }

  // 4. Send the reply (only when there's something to send). The send is best-
  //    effort: the turn already persisted, so a transport failure must NOT
  //    re-run it or report no_agent — log + still report handled.
  const reply = result.assistantMessage?.trim() ?? "";
  if (reply) {
    try {
      await adapter.sendReply(
        {
          fromHandle: inbound.fromHandle,
          toHandle: inbound.toHandle,
          orgId: agent.orgId,
          contactId: inbound.contactId ?? null,
          metadata: inbound.metadata,
        },
        result.assistantMessage,
      );
    } catch (err) {
      console.error(
        `[run-channel-turn] send_reply_failed channel=${inbound.channel} convId=${conversationId} err=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { handled: true, conversationId };
}

/** The default, fully-wired deps (resolver + DB get-or-create + executeTurn).
 *  Routes import this so they don't re-assemble the wiring. */
export function buildRealChannelTurnDeps(): RunChannelTurnDeps {
  return buildDefaultRunDeps();
}
