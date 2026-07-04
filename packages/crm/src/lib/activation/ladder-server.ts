// 2026-07-04 — Task 6 of the win-ladder + SeldonChat plan. Resolves real
// `LadderInputs` (see ladder.ts, Task 5's pure state engine) from the DB /
// Composio, and stamps once-only funnel events as each step completes.
//
// All I/O is dependency-injected (LadderServerDeps / StampLadderEventDeps) so
// this module's own mapping/dedupe logic is testable without a live DB — see
// tests/unit/activation/ladder-server.spec.ts. defaultDeps wires the real
// rails; T7's server component calls resolveLadderInputs + computeLadderState
// + (fire-and-forget) stampLadderEvent for every step that just became done.
//
// Reuse, don't rebuild (CLAUDE.md rule): every dep below calls an EXISTING
// pipeline rather than re-deriving it —
//   hasBooking            — a cheap select mirroring lib/bookings/actions.ts's
//                            own non-template booking existence checks (NOT
//                            listBookings, which reconciles against GCal).
//   landingVersionCount   — listLandingVersions from lib/landing/r1-customize.
//   calendarConnected     — listConnections from lib/integrations/composio/client,
//                            filtered to the googlecalendar/outlook toolkits.
//   copilotEverUsed       — the workspace_copilot agent's conversation(s) via
//                            the same archetype constant ensure-agent.ts owns.
//   domainAttached/shareUsed — one organizations.settings read.
//   extraAgentCount       — agents excluding the default website-chatbot
//                            archetype (auto-create-website-chatbot.ts) AND
//                            workspace_copilot (ensure-agent.ts), so neither
//                            the default chatbot nor copilot use alone can
//                            ever satisfy hire_agent.

import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentConversations, agentTurns, agents, bookings, organizations } from "@/db/schema";
import { listLandingVersions } from "@/lib/landing/r1-customize";
import { listConnections } from "@/lib/integrations/composio/client";
import { COPILOT_ARCHETYPE } from "@/lib/agents/copilot/ensure-agent";
import { captureServerEvent } from "@/lib/analytics/capture";
import type { LadderInputs, LadderStepId } from "@/lib/activation/ladder";

/** The default website-chatbot agent's archetype — pinned here from
 *  lib/agents/auto-create-website-chatbot.ts so hire_agent counts only
 *  agents beyond both defaults. */
const DEFAULT_WEBSITE_CHATBOT_ARCHETYPE = "website-chatbot";

const CALENDAR_TOOLKIT_SLUGS = new Set(["googlecalendar", "outlook"]);

export type LadderServerDeps = {
  hasBooking: (orgId: string) => Promise<boolean>;
  landingVersionCount: (orgId: string) => Promise<number>;
  calendarConnected: (orgId: string) => Promise<boolean>;
  copilotEverUsed: (orgId: string) => Promise<boolean>;
  readActivationSettings: (orgId: string) => Promise<{ domainAttached: boolean; shareUsed: boolean }>;
  extraAgentCount: (orgId: string) => Promise<number>;
};

async function defaultHasBooking(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), ne(bookings.status, "template")))
    .limit(1);
  return Boolean(row);
}

async function defaultLandingVersionCount(orgId: string): Promise<number> {
  const rows = await listLandingVersions(orgId, 1);
  return rows.length;
}

async function defaultCalendarConnected(orgId: string): Promise<boolean> {
  try {
    const connections = await listConnections(orgId);
    return connections.some((c) => c.connected && CALENDAR_TOOLKIT_SLUGS.has(c.slug));
  } catch {
    // Fail-soft: Composio being unreachable/unconfigured must never surface
    // as a ladder-resolution error — treat as "not connected".
    return false;
  }
}

async function defaultCopilotEverUsed(orgId: string): Promise<boolean> {
  const [copilotAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.archetype, COPILOT_ARCHETYPE)))
    .limit(1);
  if (!copilotAgent) return false;

  const [row] = await db
    .select({ id: agentTurns.id })
    .from(agentTurns)
    .innerJoin(agentConversations, eq(agentTurns.conversationId, agentConversations.id))
    .where(
      and(
        eq(agentConversations.orgId, orgId),
        eq(agentConversations.agentId, copilotAgent.id),
        eq(agentTurns.role, "user"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function defaultReadActivationSettings(
  orgId: string,
): Promise<{ domainAttached: boolean; shareUsed: boolean }> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as {
    customDomain?: unknown;
    activation?: { shareUsedAt?: unknown };
  };

  return {
    domainAttached: Boolean(settings.customDomain),
    shareUsed: Boolean(settings.activation?.shareUsedAt),
  };
}

async function defaultExtraAgentCount(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.orgId, orgId),
        notInArray(agents.archetype, [DEFAULT_WEBSITE_CHATBOT_ARCHETYPE, COPILOT_ARCHETYPE]),
      ),
    );
  return rows.length;
}

export const defaultDeps: LadderServerDeps = {
  hasBooking: defaultHasBooking,
  landingVersionCount: defaultLandingVersionCount,
  calendarConnected: defaultCalendarConnected,
  copilotEverUsed: defaultCopilotEverUsed,
  readActivationSettings: defaultReadActivationSettings,
  extraAgentCount: defaultExtraAgentCount,
};

/**
 * Resolve real `LadderInputs` for `orgId` via the injected deps (defaultDeps
 * wires the real DB/Composio rails). Pure mapping beyond that — Task 5's
 * computeLadderState turns this into the rendered ladder state.
 */
export async function resolveLadderInputs(orgId: string, deps: LadderServerDeps = defaultDeps): Promise<LadderInputs> {
  const [hasBooking, landingVersionCount, calendarConnected, copilotEverUsed, activationSettings, extraAgentCount] =
    await Promise.all([
      deps.hasBooking(orgId),
      deps.landingVersionCount(orgId),
      // calendarConnected is fail-soft at this call site too — even a dep
      // that doesn't guard its own Composio call (defaultCalendarConnected
      // already does) must never fail ladder resolution as a whole.
      deps.calendarConnected(orgId).catch(() => false),
      deps.copilotEverUsed(orgId),
      deps.readActivationSettings(orgId),
      deps.extraAgentCount(orgId),
    ]);

  return {
    hasBooking,
    calendarConnected,
    landingVersionCount,
    copilotEverUsed,
    domainAttached: activationSettings.domainAttached,
    shareUsed: activationSettings.shareUsed,
    extraAgentCount,
  };
}

export type StampLadderEventDeps = {
  /** True when `settings.activation.<step>At` is already set for this org. */
  wasStepStamped: (orgId: string, step: LadderStepId) => Promise<boolean>;
  /** COALESCE-merge `settings.activation.<step>At = ISO now` — caller only
   *  invokes this when wasStepStamped resolved false. */
  stampStep: (orgId: string, step: LadderStepId, stampedAtIso: string) => Promise<void>;
  captureEvent: (input: { event: string; distinctId: string; properties: Record<string, string> }) => void;
};

function activationSettingsKey(step: LadderStepId): string {
  return `${step}At`;
}

async function defaultWasStepStamped(orgId: string, step: LadderStepId): Promise<boolean> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as { activation?: Record<string, unknown> };
  return Boolean(settings.activation?.[activationSettingsKey(step)]);
}

async function defaultStampStep(orgId: string, step: LadderStepId, stampedAtIso: string): Promise<void> {
  const key = activationSettingsKey(step);
  // Mirrors mark-operator-onboarded.ts:80's COALESCE || idiom: merge a single
  // activation.<step>At key into settings without clobbering any other keys
  // (including sibling activation.* stamps), safe even when settings/
  // activation is still absent on a fresh org.
  await db
    .update(organizations)
    .set({
      settings: sql`COALESCE(${organizations.settings}, '{}'::jsonb) || jsonb_build_object('activation',
        COALESCE(${organizations.settings}->'activation', '{}'::jsonb) || jsonb_build_object(${key}, ${stampedAtIso}::text))`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export const defaultStampLadderEventDeps: StampLadderEventDeps = {
  wasStepStamped: defaultWasStepStamped,
  stampStep: defaultStampStep,
  captureEvent: captureServerEvent,
};

/**
 * Stamp `settings.activation.<step>At` for `orgId` ONLY if it isn't already
 * set, and — ONLY when it was previously absent — fire the
 * "activation_step_completed" funnel event exactly once. Safe to call
 * fire-and-forget on every step that just became done; a step that was
 * already stamped is a complete no-op (no write, no capture).
 */
export async function stampLadderEvent(
  orgId: string,
  step: LadderStepId,
  deps: StampLadderEventDeps = defaultStampLadderEventDeps,
): Promise<void> {
  const alreadyStamped = await deps.wasStepStamped(orgId, step);
  if (alreadyStamped) return;

  await deps.stampStep(orgId, step, new Date().toISOString());
  deps.captureEvent({
    event: "activation_step_completed",
    distinctId: orgId,
    properties: { step },
  });
}
