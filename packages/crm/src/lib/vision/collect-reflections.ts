// The /dream loop's "Collect" step (docs/superpowers/specs/2026-07-06-dream-loop-design.md):
// query the last 24h (or any window) of agent_reflection_events so the daily
// dream routine can cluster failures + compute the day's vision pass-rate.
// DI'd for testing — the dream skill (built separately) calls
// collectRecentReflections(sinceIso).

import { desc, gte } from "drizzle-orm";

import { db } from "@/db";
import { agentReflectionEvents } from "@/db/schema";

export type ReflectionRow = {
  id: string;
  orgId: string;
  surface: string;
  instructionSummary: string | null;
  triggerTool: string | null;
  pass: boolean;
  skipped: string | null;
  gaps: string[];
  createdAt: Date;
};

export type CollectReflectionsDeps = {
  select: (sinceIso: string) => Promise<ReflectionRow[]>;
};

const DEFAULT: CollectReflectionsDeps = {
  select: async (sinceIso) => {
    const rows = await db
      .select({
        id: agentReflectionEvents.id,
        orgId: agentReflectionEvents.orgId,
        surface: agentReflectionEvents.surface,
        instructionSummary: agentReflectionEvents.instructionSummary,
        triggerTool: agentReflectionEvents.triggerTool,
        pass: agentReflectionEvents.pass,
        skipped: agentReflectionEvents.skipped,
        gaps: agentReflectionEvents.gaps,
        createdAt: agentReflectionEvents.createdAt,
      })
      .from(agentReflectionEvents)
      .where(gte(agentReflectionEvents.createdAt, new Date(sinceIso)))
      .orderBy(desc(agentReflectionEvents.createdAt));

    return rows.map((row) => ({
      ...row,
      gaps: row.gaps ?? [],
    }));
  },
};

export async function collectRecentReflections(
  sinceIso: string,
  deps: CollectReflectionsDeps = DEFAULT
): Promise<ReflectionRow[]> {
  return deps.select(sinceIso);
}
