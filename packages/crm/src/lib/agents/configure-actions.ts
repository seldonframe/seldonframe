"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getArchetype } from "@/lib/agents/archetypes";
import { assertWritable } from "@/lib/demo/server";

/**
 * WS3 — store per-archetype operator-supplied configuration on the
 * org's settings JSON. Schema:
 *
 *   organizations.settings.agentConfigs[archetypeId] = {
 *     placeholders: { $formId: "uuid", $reviewUrl: "https://...", ... },
 *     temperature: 0.7,
 *     model: "claude-sonnet-4",
 *     approvalRequired: true,
 *     maxRunsPerDay: 50,
 *     deployedAt: "2026-04-29T12:00:00Z" | null,
 *     pausedAt: "2026-04-29T13:00:00Z" | null,
 *     systemPromptOverride: string | null,
 *   }
 *
 * Why JSONB on organizations vs. a dedicated table: launch-friendly.
 * The agent-instances table can land later when we need per-tenant
 * versioning / audit trail; for v1 a single doc keyed by archetype id
 * is enough since each org only runs one instance per archetype.
 *
 * On deploy: synthesis isn't wired into this UI yet. The save just
 * persists the config; the actual workflow trigger registration is
 * a follow-up turn (it's where speed-to-lead-spec etc. get filled
 * with $placeholder values from this config).
 */

/**
 * 2026-05-19 — Phase 7 Task 7.3. Edit-history entry. Every save snapshots
 * the OLD editable-field state (the state that was about to be overwritten)
 * into history[], capped at 20 most-recent. Reverting copies a historic
 * entry back onto the current config — and snapshots the pre-revert state
 * too, so a revert can itself be reverted.
 *
 * Why snapshot the BEFORE rather than the AFTER: the operator who wants
 * to revert knows roughly what they had before they broke things. They
 * want the LIST to show "what saves did I make" not "what state is left
 * behind". Storing the pre-edit state makes "revert to this" mean
 * "restore what you had before save #N happened".
 */
export type AgentConfigHistoryEntry = {
  savedAt: string; // ISO
  /** Snapshot of all editable fields BEFORE this save took effect.
   *  Reverting = copy this back onto the current config. */
  placeholders: Record<string, string>;
  systemPromptOverride: string | null;
  model: string;
  temperature: number;
  approvalRequired: boolean;
  maxRunsPerDay: number;
};

export type AgentConfig = {
  placeholders: Record<string, string>;
  temperature: number;
  model: string;
  approvalRequired: boolean;
  maxRunsPerDay: number;
  deployedAt: string | null;
  pausedAt: string | null;
  systemPromptOverride: string | null;
  updatedAt: string;
  /** Most-recent 20 pre-save snapshots, newest first. */
  history?: AgentConfigHistoryEntry[];
};

const DEFAULT_CONFIG: Omit<AgentConfig, "updatedAt"> = {
  placeholders: {},
  temperature: 0.7,
  model: "claude-sonnet-4",
  approvalRequired: true,
  maxRunsPerDay: 50,
  deployedAt: null,
  pausedAt: null,
  systemPromptOverride: null,
};

export async function getAgentConfig(archetypeId: string): Promise<AgentConfig | null> {
  const orgId = await getOrgId();
  if (!orgId) return null;

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const configs =
    settings.agentConfigs && typeof settings.agentConfigs === "object"
      ? (settings.agentConfigs as Record<string, AgentConfig>)
      : {};
  return configs[archetypeId] ?? null;
}

export async function saveAgentConfigAction(input: {
  archetypeId: string;
  placeholders: Record<string, string>;
  temperature: number;
  model: string;
  approvalRequired: boolean;
  maxRunsPerDay: number;
  systemPromptOverride: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Workspace not found." };

  const archetype = getArchetype(input.archetypeId);
  if (!archetype) return { ok: false, error: "Unknown archetype." };

  // Validate every required placeholder has a value (optional ones
  // can be empty and synthesis will fill from soul / defaults).
  for (const [key, meta] of Object.entries(archetype.placeholders)) {
    if (meta.kind !== "user_input") continue;
    const value = input.placeholders[key];
    if (!value || !value.trim()) {
      return { ok: false, error: `${key.replace(/^\$/, "")} is required.` };
    }
  }

  const temperature = Math.max(0, Math.min(1, input.temperature));
  const maxRunsPerDay = Math.max(1, Math.min(10000, input.maxRunsPerDay));

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const currentConfigs =
    currentSettings.agentConfigs && typeof currentSettings.agentConfigs === "object"
      ? (currentSettings.agentConfigs as Record<string, AgentConfig>)
      : {};
  const previous = currentConfigs[input.archetypeId];

  // 2026-05-19 — Phase 7 Task 7.3. Snapshot the pre-save editable fields
  // into history[] (capped at 20). First-time save creates no history
  // entry — there's nothing to revert TO yet.
  const newHistoryEntry: AgentConfigHistoryEntry | null = previous
    ? {
        savedAt: new Date().toISOString(),
        placeholders: previous.placeholders ?? {},
        systemPromptOverride: previous.systemPromptOverride ?? null,
        model: previous.model ?? DEFAULT_CONFIG.model,
        temperature: previous.temperature ?? DEFAULT_CONFIG.temperature,
        approvalRequired: previous.approvalRequired ?? DEFAULT_CONFIG.approvalRequired,
        maxRunsPerDay: previous.maxRunsPerDay ?? DEFAULT_CONFIG.maxRunsPerDay,
      }
    : null;
  const existingHistory: AgentConfigHistoryEntry[] = Array.isArray(previous?.history)
    ? (previous!.history as AgentConfigHistoryEntry[])
    : [];
  const newHistory = newHistoryEntry
    ? [newHistoryEntry, ...existingHistory].slice(0, 20)
    : existingHistory;

  const next: AgentConfig = {
    ...DEFAULT_CONFIG,
    ...previous,
    placeholders: input.placeholders,
    temperature,
    model: input.model,
    approvalRequired: input.approvalRequired,
    maxRunsPerDay,
    systemPromptOverride: input.systemPromptOverride ?? null,
    updatedAt: new Date().toISOString(),
    history: newHistory,
  };

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        agentConfigs: { ...currentConfigs, [input.archetypeId]: next },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath(`/automations/${input.archetypeId}/configure`);
  revalidatePath("/automations");
  return { ok: true };
}

export async function setAgentDeployStateAction(input: {
  archetypeId: string;
  state: "deployed" | "paused";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Workspace not found." };

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const currentSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const currentConfigs =
    currentSettings.agentConfigs && typeof currentSettings.agentConfigs === "object"
      ? (currentSettings.agentConfigs as Record<string, AgentConfig>)
      : {};
  const previous = currentConfigs[input.archetypeId];
  if (!previous) {
    return { ok: false, error: "Configure the agent before deploying." };
  }

  const now = new Date().toISOString();
  const next: AgentConfig = {
    ...previous,
    deployedAt: input.state === "deployed" ? now : previous.deployedAt,
    pausedAt: input.state === "paused" ? now : null,
    updatedAt: now,
  };

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        agentConfigs: { ...currentConfigs, [input.archetypeId]: next },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  // 2026-05-18 — when an agent that handles form.submitted (speed-to-lead,
  // missed-call-text-back, etc.) is DEPLOYED, auto-disable the basic
  // outbound_message_triggers on the same event. Operator was getting
  // TWO replies on every form submission (one from the agent's
  // conversation, one from the intake-auto-reply trigger). Restoring
  // the triggers when the agent is PAUSED keeps the safety net active
  // when the agent isn't running.
  try {
    const archetypeEventType = await resolveArchetypeTriggerEventType(input.archetypeId);
    if (archetypeEventType) {
      const { outboundMessageTriggers } = await import("@/db/schema");
      await db
        .update(outboundMessageTriggers)
        .set({
          enabled: input.state !== "deployed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(outboundMessageTriggers.orgId, orgId),
            eq(outboundMessageTriggers.eventType, archetypeEventType),
          ),
        );
    }
  } catch (err) {
    // Soft-fail — the agent state change still landed; the trigger
    // toggle is a UX nicety, not a correctness boundary.
    console.warn(
      JSON.stringify({
        event: "setAgentDeployStateAction.trigger_toggle_failed",
        orgId,
        archetypeId: input.archetypeId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  revalidatePath(`/automations/${input.archetypeId}/configure`);
  revalidatePath("/automations");
  revalidatePath("/emails");
  return { ok: true };
}

// 2026-05-18 — lookup the trigger event type for an archetype. Used to
// know which outbound_message_triggers to disable when an agent deploys
// (so we don't double-send on the same event).
async function resolveArchetypeTriggerEventType(archetypeId: string): Promise<string | null> {
  const { getArchetype } = await import("@/lib/agents/archetypes");
  const { getTriggerEventType } = await import("@/lib/agents/synthesis");
  const archetype = getArchetype(archetypeId);
  if (!archetype) return null;
  try {
    return getTriggerEventType(archetype.specTemplate) ?? null;
  } catch {
    return null;
  }
}

/**
 * 2026-05-18 — dispatch-time guard helper.
 *
 * Called by the outbound message dispatcher to ask "is there a
 * currently-deployed agent that owns this event?" If yes, the
 * dispatcher skips the basic intake-auto-reply trigger so the
 * customer doesn't get two SMS / two emails for the same event.
 *
 * Why this matters more than the auto-disable in
 * setAgentDeployStateAction: agents that were deployed BEFORE the
 * auto-disable code shipped never had their conflicting triggers
 * disabled. This runtime check covers them too. The auto-disable is
 * still useful as a UX nicety (so the operator sees the trigger
 * actually disabled in /emails after deploying), but it's no longer
 * load-bearing.
 *
 * Returns the archetype id of the first deployed agent owning the
 * event, or null if none. We don't need the full config — the caller
 * just needs to know "skip or fire".
 */
export async function findDeployedAgentForEvent(
  orgId: string,
  eventType: string,
): Promise<string | null> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const configs =
    settings.agentConfigs && typeof settings.agentConfigs === "object"
      ? (settings.agentConfigs as Record<string, AgentConfig>)
      : {};

  if (Object.keys(configs).length === 0) return null;

  const { listArchetypes } = await import("@/lib/agents/archetypes");
  const { getTriggerEventType } = await import("@/lib/agents/synthesis");

  for (const archetype of listArchetypes()) {
    const archetypeEvent = (() => {
      try {
        return getTriggerEventType(archetype.specTemplate) ?? null;
      } catch {
        return null;
      }
    })();
    if (archetypeEvent !== eventType) continue;
    const cfg = configs[archetype.id];
    if (!cfg) continue;
    // Deployed-and-not-paused = currently active.
    if (cfg.deployedAt && !cfg.pausedAt) return archetype.id;
  }
  return null;
}

/**
 * 2026-05-19 — Phase 7 Task 7.3. Revert config to a historic snapshot.
 *
 * The pre-revert state is itself snapshotted into history[] BEFORE the
 * revert lands, so an accidental revert can be undone with another
 * revert (operator picks the new top-of-history entry).
 *
 * Only the editable fields move — `deployedAt` / `pausedAt` / `updatedAt`
 * stay current. Reverting prompt edits should not silently undeploy a
 * running agent.
 */
export async function revertAgentConfigToHistoryEntry(
  archetypeId: string,
  historyIndex: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "Workspace not found." };

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return { ok: false, error: "Workspace not found." };

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const agentConfigs =
    settings.agentConfigs && typeof settings.agentConfigs === "object"
      ? (settings.agentConfigs as Record<string, AgentConfig>)
      : {};
  const config = agentConfigs[archetypeId];
  if (!config) return { ok: false, error: "No saved config to revert." };

  const history = Array.isArray(config.history) ? config.history : [];
  const target = history[historyIndex];
  if (!target) return { ok: false, error: "History entry not found." };

  // Snapshot the CURRENT (pre-revert) state into history first, so the
  // operator can re-revert if they change their mind.
  const preRevertSnapshot: AgentConfigHistoryEntry = {
    savedAt: new Date().toISOString(),
    placeholders: config.placeholders ?? {},
    systemPromptOverride: config.systemPromptOverride ?? null,
    model: config.model ?? DEFAULT_CONFIG.model,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    approvalRequired: config.approvalRequired ?? DEFAULT_CONFIG.approvalRequired,
    maxRunsPerDay: config.maxRunsPerDay ?? DEFAULT_CONFIG.maxRunsPerDay,
  };
  const newHistory = [preRevertSnapshot, ...history].slice(0, 20);

  const reverted: AgentConfig = {
    ...config,
    placeholders: target.placeholders,
    systemPromptOverride: target.systemPromptOverride,
    model: target.model,
    temperature: target.temperature,
    approvalRequired: target.approvalRequired,
    maxRunsPerDay: target.maxRunsPerDay,
    history: newHistory,
    updatedAt: new Date().toISOString(),
  };

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        agentConfigs: { ...agentConfigs, [archetypeId]: reverted },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath(`/automations/${archetypeId}/configure`);
  revalidatePath("/automations");
  return { ok: true };
}

/**
 * 2026-05-19 — Phase 7 Task 7.3. FormData wrapper around
 * revertAgentConfigToHistoryEntry. Plain `<form action={fn.bind(...)}>` can
 * be brittle in server-action serialization; this lets the JSX pass the
 * args via hidden inputs which is simpler and avoids the .bind() ceremony.
 */
export async function revertAgentConfigFormAction(formData: FormData): Promise<void> {
  const archetypeId = String(formData.get("archetypeId") ?? "");
  const historyIndexRaw = String(formData.get("historyIndex") ?? "");
  const historyIndex = Number.parseInt(historyIndexRaw, 10);
  if (!archetypeId || !Number.isFinite(historyIndex)) return;
  await revertAgentConfigToHistoryEntry(archetypeId, historyIndex);
}
