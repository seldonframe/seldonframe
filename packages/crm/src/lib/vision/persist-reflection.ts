// Dual-write persistence for the /dream loop's signal (2026-07-06). Every
// vision_check verdict computed in app/api/copilot/turn/route.ts's
// runVisionCheck is still logged via logEvent("vision_check", ...) for Vercel
// log observability, AND now also persisted here as a row in
// agent_reflection_events so the daily dream routine has a queryable collect
// source (docs/superpowers/specs/2026-07-06-dream-loop-design.md).
//
// Fail-soft by construction: this runs on the hot copilot turn path, so a
// persistence failure (DB hiccup, etc.) must NEVER throw or slow the reply.
// The whole body is wrapped in try/catch; callers can treat this as fire-and-
// forget.
//
// Privacy: `instruction` is truncated to <=200 chars before it's stored as
// `instructionSummary` — a summary, never a raw end-customer PII body (same
// stance as the PostHog "no prompt bodies" rule).

import { db } from "@/db";
import { agentReflectionEvents } from "@/db/schema";

const INSTRUCTION_SUMMARY_MAX_CHARS = 200;

export type ReflectionVerdict = {
  pass: boolean;
  gaps: string[];
  skipped?: string;
};

export type ReflectionInput = {
  orgId: string;
  surface: string;
  instruction: string | null;
  triggerTool: string | null;
  verdict: ReflectionVerdict;
};

export type ReflectionRowInsert = {
  orgId: string;
  surface: string;
  instructionSummary: string | null;
  triggerTool: string | null;
  pass: boolean;
  skipped: string | null;
  gaps: string[];
};

export type PersistReflectionDeps = {
  insert: (row: ReflectionRowInsert) => Promise<void>;
};

function truncateInstructionSummary(instruction: string | null): string | null {
  if (!instruction) return null;
  const trimmed = instruction.trim();
  if (!trimmed) return null;
  return trimmed.length > INSTRUCTION_SUMMARY_MAX_CHARS
    ? trimmed.slice(0, INSTRUCTION_SUMMARY_MAX_CHARS)
    : trimmed;
}

const DEFAULT: PersistReflectionDeps = {
  insert: async (row) => {
    await db.insert(agentReflectionEvents).values({
      orgId: row.orgId,
      surface: row.surface,
      instructionSummary: row.instructionSummary,
      triggerTool: row.triggerTool,
      pass: row.pass,
      skipped: row.skipped,
      gaps: row.gaps,
    });
  },
};

export async function persistReflection(
  input: ReflectionInput,
  deps: PersistReflectionDeps = DEFAULT
): Promise<void> {
  try {
    const row: ReflectionRowInsert = {
      orgId: input.orgId,
      surface: input.surface,
      instructionSummary: truncateInstructionSummary(input.instruction),
      triggerTool: input.triggerTool,
      pass: input.verdict.pass,
      skipped: input.verdict.skipped ?? null,
      gaps: input.verdict.gaps,
    };
    await deps.insert(row);
  } catch {
    // Persistence must never affect the hot turn path.
  }
}
