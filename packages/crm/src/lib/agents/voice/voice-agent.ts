// Task A3 — getOrCreateVoiceAgent: per-workspace voice-receptionist agent.
//
// Accepts optional `deps` for dependency injection so the function can be
// tested without a real DB. Default deps query and insert via Drizzle.

import type { AgentBlueprint } from "@/db/schema/agents";

type MinimalAgent = { id: string; blueprint: unknown; status: string };

export type VoiceAgentDeps = {
  findExisting: (orgId: string) => Promise<MinimalAgent | null>;
  insert: (values: Record<string, unknown>) => Promise<MinimalAgent>;
};

/** Shape returned by getOrCreateVoiceAgent (blueprint is typed). */
type VoiceAgentResult = {
  id: string;
  blueprint: AgentBlueprint;
  status: string;
};

function buildDefaultDeps(): VoiceAgentDeps {
  // Lazily import DB so tests never touch Neon.
  return {
    findExisting: async (orgId) => {
      const { db } = await import("@/db");
      const { agents } = await import("@/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(agents)
        .where(and(eq(agents.orgId, orgId), eq(agents.archetype, "voice-receptionist")))
        .limit(1);
      return rows[0] ?? null;
    },
    insert: async (values) => {
      const { db } = await import("@/db");
      const { agents } = await import("@/db/schema");
      const [created] = await db
        .insert(agents)
        .values(values as Parameters<typeof db.insert>[0] extends infer T ? T : never)
        .returning();
      if (!created) throw new Error("voice-agent insert returned no row");
      return created;
    },
  };
}

export async function getOrCreateVoiceAgent({
  orgId,
  deps,
}: {
  orgId: string;
  deps?: Partial<VoiceAgentDeps>;
}): Promise<VoiceAgentResult> {
  const defaults = buildDefaultDeps();
  const findExisting = deps?.findExisting ?? defaults.findExisting;
  const insert = deps?.insert ?? defaults.insert;

  const existing = await findExisting(orgId);
  if (existing) {
    return {
      id: existing.id,
      blueprint: existing.blueprint as AgentBlueprint,
      status: existing.status,
    };
  }

  const blueprint: AgentBlueprint = { voice: "alloy" };
  const values: Record<string, unknown> = {
    orgId,
    channel: "voice",
    archetype: "voice-receptionist",
    slug: "voice-receptionist",
    status: "draft",
    name: "Voice Receptionist",
    blueprint,
  };

  const created = await insert(values);
  return {
    id: created.id,
    blueprint: created.blueprint as AgentBlueprint,
    status: created.status,
  };
}
