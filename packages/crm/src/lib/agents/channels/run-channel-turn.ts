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
import type { CalendarBinding } from "@/lib/agents/booking/calendar-backend";
import type { BookingPolicy } from "@/lib/agents/booking/booking-policy";
import { resolveBookingPolicy } from "@/lib/agents/booking/booking-policy";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";
import { resolveDeploymentPersona } from "@/lib/agents/persona/deployment-customization";
import { deploymentToBinding } from "@/lib/deployments/booking-binding";

export type { ChannelAdapter, InboundMessage } from "./channel-adapter";

// ─── resolveInboundAgent ──────────────────────────────────────────────────

/** What the resolver yields: the agent to run + the org its writes land in, plus
 *  the deployment's calendar binding when this resolved via the deployment-first
 *  path (so executeTurn books into the client's calendar exactly like voice).
 *  bookingBinding is absent for the workspace fall-through → ctx.booking stays
 *  undefined (native default, unchanged).
 *
 *  Per-client booking policy (P1): the deployment-first path may also carry the
 *  deployment's own `bookingPolicy` override + the template's `defaultBookingPolicy`
 *  + the client `timezone`. runChannelTurn resolves them with resolveBookingPolicy
 *  and threads the result onto ctx.booking.policy. All optional → the workspace
 *  fall-through (and any resolver that doesn't load them) falls back to system
 *  defaults, unchanged.
 *
 *  Per-deployment persona (P1): the deployment-first path may ALSO carry the
 *  deployment's own `customization` (greeting / business facts) + the template's
 *  default greeting/script + the client name. runChannelTurn resolves them with
 *  resolveDeploymentPersona and threads the EFFECTIVE greeting/prompt to
 *  executeTurn so the client agent speaks as the client and the script's
 *  `{placeholders}` are filled/dropped (no literal "{business name}" leak). Text
 *  channels have no TTS voice, so voiceId is intentionally NOT threaded here. All
 *  optional → the workspace fall-through (and any resolver that doesn't load them)
 *  leaves the prompt exactly as the agent's own blueprint composes it, unchanged. */
export type ResolvedAgent =
  | {
      agentId: string;
      orgId: string;
      bookingBinding?: CalendarBinding;
      bookingPolicy?: Partial<BookingPolicy> | null;
      templateBookingPolicy?: Partial<BookingPolicy> | null;
      timezone?: string;
      /** The deployment's per-client persona override (greeting / business facts). */
      customization?: Partial<DeploymentCustomization> | null;
      /** The template default greeting (carries `{placeholders}`). */
      templateGreeting?: string | null;
      /** The template default script (the operator's verbatim SKILL.md) — the one
       *  place a literal `{business name}` can leak into the prompt. */
      templateScript?: string | null;
      /** The client business name used to fill `{business_name}` when the
       *  customization doesn't carry one. */
      clientName?: string | null;
    }
  | null;

/** The minimal deployment slice the resolver needs: the client-org link (to pick
 *  the agent + retarget writes) plus the booking-config fields deploymentToBinding
 *  reads (so the binding carries the client's connected calendar). */
type DeploymentClientSlice =
  | {
      clientOrgId: string | null;
      // The booking-config fields deploymentToBinding reads. Optional so existing
      // resolver test-deps that only return { clientOrgId } still satisfy the
      // type; the call site fills the bookingMode key before mapping.
      // id (the Composio entity) + builderOrgId (the Composio key org) are
      // carried so book_external's calendarRef can re-open the session.
      id?: string;
      builderOrgId?: string;
      bookingMode?: string | null;
      externalBookingUrl?: string | null;
      calendarRef?: { provider?: string | null; accountId?: string | null; calendarId?: string | null } | null;
      // Per-deployment persona (P1). Optional so existing resolver test-deps that
      // only return { clientOrgId } still satisfy the type; the call site carries
      // them onto ResolvedAgent so runChannelTurn can resolve the effective persona.
      customization?: Partial<DeploymentCustomization> | null;
      clientName?: string | null;
    }
  | null;

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
      return row
        ? {
            id: row.id,
            builderOrgId: row.builderOrgId,
            clientOrgId: row.clientOrgId,
            bookingMode: row.bookingMode,
            externalBookingUrl: row.externalBookingUrl,
            calendarRef: row.calendarRef,
          }
        : null;
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
      if (agent) {
        // Carry the deployment's calendar binding so chat/SMS/email book into the
        // client's connected calendar exactly like voice. deploymentToBinding
        // falls back to native when the calendar isn't connected, so this is safe
        // even before OAuth completes. Construct an explicit BindingSource (the
        // bookingMode key is always present, value may be null) so the mapper
        // accepts it regardless of the slice's optional fields.
        const bookingBinding = deploymentToBinding({
          // id (Composio entity) + builderOrgId (Composio key org) carry into the
          // book_external calendarRef; the resolver only reached here on a matched
          // deployment row, so both are present (fallbacks satisfy the structural
          // optionality of DeploymentClientSlice).
          id: deployment.id ?? "",
          builderOrgId: deployment.builderOrgId ?? "",
          bookingMode: deployment.bookingMode ?? null,
          externalBookingUrl: deployment.externalBookingUrl ?? null,
          calendarRef: deployment.calendarRef ?? null,
        });
        // Carry the deployment's per-client persona override + client name onto
        // the resolved agent so runChannelTurn resolves the EFFECTIVE greeting/
        // prompt (placeholders filled). Both optional on the slice → when a
        // resolver doesn't load them they're undefined and runChannelTurn falls
        // back to the agent's own blueprint (workspace path unchanged).
        return {
          ...agent,
          bookingBinding,
          ...(deployment.customization !== undefined
            ? { customization: deployment.customization }
            : {}),
          ...(deployment.clientName !== undefined
            ? { clientName: deployment.clientName }
            : {}),
        };
      }
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
  /** The canonical agent loop. bookingBinding is threaded for deployment-resolved
   *  agents so chat/SMS/email book into the client's calendar like voice;
   *  bookingPolicy is the RESOLVED per-client policy threaded onto ctx.booking.
   *  persona is the RESOLVED per-deployment greeting/prompt (placeholders filled)
   *  threaded so the deployed client agent speaks AS the client without a literal
   *  `{token}` leak; absent for workspace agents (prompt = the agent's own
   *  blueprint, unchanged). */
  executeTurn: (input: {
    conversationId: string;
    userMessage: string;
    bookingBinding?: CalendarBinding;
    bookingPolicy?: BookingPolicy;
    persona?: { greeting: string | null; prompt: string | null };
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
      // Deployment-resolved agents carry the client's calendar binding; workspace
      // agents omit it entirely → executeTurn input is byte-for-byte unchanged and
      // ctx.booking stays undefined (native default). Conditional spread keeps the
      // key absent (not `undefined`) when there's no binding.
      ...(agent.bookingBinding ? { bookingBinding: agent.bookingBinding } : {}),
      // Per-client booking policy (P1): only the deployment path sets a binding, so
      // resolve + thread the policy alongside it (deployment override → template
      // default → system defaults, in the client tz). Omitted on the workspace path
      // so that input stays byte-for-byte unchanged there.
      ...(agent.bookingBinding
        ? {
            bookingPolicy: resolveBookingPolicy(
              agent.bookingPolicy ?? null,
              agent.templateBookingPolicy ?? null,
              agent.timezone,
            ),
          }
        : {}),
      // Per-deployment persona (P1): on the deployment path, resolve the EFFECTIVE
      // greeting + prompt (deployment override OR template default with its
      // `{placeholders}` filled/dropped) and thread them so the client agent
      // greets as the client and the script never leaks a literal `{business
      // name}`. Text channels carry no TTS voice, so voiceId is dropped here.
      // Gated on the binding (the deployment-first marker) so the workspace path
      // stays byte-for-byte unchanged (prompt = the agent's own blueprint).
      ...(agent.bookingBinding
        ? {
            persona: (() => {
              const p = resolveDeploymentPersona({
                templateGreeting: agent.templateGreeting ?? null,
                templateScript: agent.templateScript ?? null,
                templateVoiceId: null, // text channels have no TTS voice
                customization: agent.customization ?? null,
                clientName: agent.clientName ?? null,
              });
              return { greeting: p.greeting, prompt: p.prompt };
            })(),
          }
        : {}),
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
