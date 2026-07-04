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
//                            ever satisfy hire_agent, PLUS the org's
//                            agentTemplates rows whose blueprint carries an
//                            event trigger — Task 10's one-click starter
//                            agents (agent-picks-actions.ts) write ONLY
//                            agent_templates, never `agents`, so without this
//                            second count hire_agent could never flip.

import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentConversations, agentTurns, agents, bookings, organizations } from "@/db/schema";
import { agentTemplates } from "@/db/schema/agent-templates";
import { listLandingVersions } from "@/lib/landing/r1-customize";
import { listConnections } from "@/lib/integrations/composio/client";
import { COPILOT_ARCHETYPE } from "@/lib/agents/copilot/ensure-agent";
import { captureServerEvent, type CaptureServerEventInput } from "@/lib/analytics/capture";
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
  /** Count now includes BOTH (a) `agents` rows excluding the default
   *  website-chatbot + workspace_copilot archetypes AND (b) the org's
   *  agentTemplates rows whose blueprint carries an event trigger (Task 10's
   *  one-click starters write ONLY agent_templates — see
   *  agent-picks-actions.ts's idempotency probe, whose trigger-presence check
   *  this mirrors). Without (b), enabling a starter agent could never flip
   *  hire_agent. */
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

/** True when a template row's blueprint carries an event trigger — mirrors
 *  agent-picks-actions.ts's own idempotency probe (the in-memory
 *  `blueprint.trigger.kind === "event"` check) so the two call sites never
 *  drift on what counts as "this template is a live event-triggered agent". */
function hasEventTrigger(blueprint: unknown): boolean {
  const trigger = (blueprint as { trigger?: unknown } | null)?.trigger as
    | { kind?: string }
    | undefined;
  return trigger?.kind === "event";
}

async function defaultExtraAgentCount(orgId: string): Promise<number> {
  const [agentRows, templateRows] = await Promise.all([
    db
      .select({ id: agents.id })
      .from(agents)
      .where(
        and(
          eq(agents.orgId, orgId),
          notInArray(agents.archetype, [DEFAULT_WEBSITE_CHATBOT_ARCHETYPE, COPILOT_ARCHETYPE]),
        ),
      ),
    // The hire_agent-relevant slice of agent_templates: Task 10's one-click
    // starters (review-requester / speed-to-lead) write ONLY this table, never
    // `agents` — see enableStarterAgentAction — so without this second count
    // enabling a starter could never flip hire_agent.
    db
      .select({ blueprint: agentTemplates.blueprint })
      .from(agentTemplates)
      .where(eq(agentTemplates.builderOrgId, orgId)),
  ]);

  const eventTemplateCount = templateRows.filter((row) => hasEventTrigger(row.blueprint)).length;

  return agentRows.length + eventTemplateCount;
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
  captureEvent: (input: CaptureServerEventInput) => void;
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

export type MarkShareUsedDeps = {
  /** True when `settings.activation.shareUsedAt` is already set for this org. */
  wasShareUsedStamped: (orgId: string) => Promise<boolean>;
  /** COALESCE-merge `settings.activation.shareUsedAt = ISO now` into settings
   *  without clobbering any other keys — same merge idiom as defaultStampStep. */
  stampShareUsed: (orgId: string, stampedAtIso: string) => Promise<void>;
};

const SHARE_USED_KEY = "shareUsedAt";

async function defaultWasShareUsedStamped(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as { activation?: Record<string, unknown> };
  return Boolean(settings.activation?.[SHARE_USED_KEY]);
}

async function defaultStampShareUsed(orgId: string, stampedAtIso: string): Promise<void> {
  // Mirrors mark-operator-onboarded.ts:80's COALESCE || idiom (same as
  // defaultStampStep above): merge a single activation.shareUsedAt key into
  // settings without clobbering any other keys, safe even when settings/
  // activation is still absent on a fresh org.
  await db
    .update(organizations)
    .set({
      settings: sql`COALESCE(${organizations.settings}, '{}'::jsonb) || jsonb_build_object('activation',
        COALESCE(${organizations.settings}->'activation', '{}'::jsonb) || jsonb_build_object(${SHARE_USED_KEY}, ${stampedAtIso}::text))`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

export const defaultMarkShareUsedDeps: MarkShareUsedDeps = {
  wasShareUsedStamped: defaultWasShareUsedStamped,
  stampShareUsed: defaultStampShareUsed,
};

/**
 * Guarded write of `settings.activation.shareUsedAt` — the SAME key
 * defaultReadActivationSettings resolves `shareUsed` from (line 117) — set
 * ONLY if absent, with NO capture call. The go_live funnel event still fires
 * exactly once, but from the dashboard render loop's stampLadderEvent once
 * computeLadderState sees the step actually flip to done — the same
 * once-only path every other step uses, so share doesn't get a second,
 * earlier, phantom firing of its own.
 */
export async function markShareUsed(orgId: string, deps: MarkShareUsedDeps = defaultMarkShareUsedDeps): Promise<void> {
  const alreadyStamped = await deps.wasShareUsedStamped(orgId);
  if (alreadyStamped) return;

  await deps.stampShareUsed(orgId, new Date().toISOString());
}

/**
 * Stamp `settings.activation.<step>At` for `orgId` ONLY if it isn't already
 * set, and — ONLY when it was previously absent — fire the
 * "activation_step_completed" funnel event exactly once. Safe to call
 * fire-and-forget on every step that just became done; a step that was
 * already stamped is a complete no-op (no write, no capture).
 *
 * KNOWN RACE: The check-then-write pattern (lines 231–234) has a race window:
 * two concurrent renders can both see the step unstamped and double-fire the
 * activation_step_completed capture. This is accepted for v1 — funnel
 * dashboards tolerate rare dupes. Revisit with a jsonb-path conditional update
 * (e.g. `UPDATE ... SET settings = ... WHERE settings->'activation'->... IS NULL`)
 * if duplicate events ever matter.
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
