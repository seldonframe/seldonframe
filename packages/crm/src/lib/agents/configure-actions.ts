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
