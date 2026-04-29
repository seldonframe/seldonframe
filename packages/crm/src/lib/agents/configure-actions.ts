"use server";

import { eq } from "drizzle-orm";
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

  revalidatePath(`/automations/${input.archetypeId}/configure`);
  revalidatePath("/automations");
  return { ok: true };
}
