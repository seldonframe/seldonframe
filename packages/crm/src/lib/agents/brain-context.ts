// Stage B — the shared agent brain loop.
//
// Two functions both the voice runtime and the chatbot turn use, so "all agents
// get better over time" is ONE implementation:
//
//   loadAgentBrainContext(orgId) — READ. Pulls top workspace notes + top global
//     patterns (by confidence), reads each (readBrainNote ticks `uses` — the
//     consumption signal) and returns the bodies (to inject into the prompt) +
//     the consumed note ids (to feed back on a win).
//
//   recordAgentBrainOutcome(...) — WRITE. Emits a brain_outcomes row (the raw
//     signal the nightly dream-cycle compiler clusters into new notes) and, on a
//     WIN with consumed ids, bumps those notes' wins/confidence so patterns that
//     actually close calls rise and weak ones get pruned/never promoted.
//
// The dream-cycle compiler + the weekly promotion cron already exist and run —
// this only FEEDS them. Everything here is best-effort + injectable: the brain
// must never block or crash a live call/turn.

import { listBrainDir, markBrainOutcome, readBrainNote } from "@/lib/brain/store";
import { logBrainEvent } from "@/lib/analytics/brain";

export type AgentBrainContext = {
  /** Full note bodies to inject into the system prompt. */
  notes: string[];
  /** Ids of the notes consumed this turn — fed back via markBrainOutcome on a win. */
  consumedNoteIds: string[];
};

export type LoadBrainDeps = {
  list: typeof listBrainDir;
  read: typeof readBrainNote;
};

const DEFAULT_LOAD_DEPS: LoadBrainDeps = { list: listBrainDir, read: readBrainNote };

/**
 * Load brain patterns for an agent: top `maxWorkspace` workspace notes + top
 * `maxGlobal` global patterns (both ordered by confidence inside listBrainDir).
 * Reads each full note via readBrainNote — which ticks `uses` (so the win/loss
 * feedback is meaningful) and yields the body + id. Best-effort: any failure
 * returns whatever was gathered so far (never throws).
 */
export async function loadAgentBrainContext(args: {
  orgId: string;
  maxWorkspace?: number;
  maxGlobal?: number;
  deps?: Partial<LoadBrainDeps>;
}): Promise<AgentBrainContext> {
  const list = args.deps?.list ?? DEFAULT_LOAD_DEPS.list;
  const read = args.deps?.read ?? DEFAULT_LOAD_DEPS.read;
  const maxWorkspace = args.maxWorkspace ?? 5;
  const maxGlobal = args.maxGlobal ?? 3;

  const notes: string[] = [];
  const consumedNoteIds: string[] = [];

  try {
    const [workspaceDir, globalDir] = await Promise.all([
      list({ orgId: args.orgId, scope: "workspace", limit: maxWorkspace }),
      list({ orgId: null, scope: "global", limit: maxGlobal }),
    ]);

    const picks: Array<{ orgId: string | null; scope: "workspace" | "global"; path: string }> = [
      ...workspaceDir.map((n) => ({ orgId: args.orgId, scope: "workspace" as const, path: n.path })),
      ...globalDir.map((n) => ({ orgId: null, scope: "global" as const, path: n.path })),
    ];

    for (const pick of picks) {
      const note = await read({ orgId: pick.orgId, scope: pick.scope, path: pick.path });
      if (note) {
        notes.push(note.body);
        consumedNoteIds.push(note.id);
      }
    }
  } catch (err) {
    // best-effort — the agent simply runs without learned patterns.
    console.error(
      `[brain] loadAgentBrainContext failed for org ${args.orgId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return { notes, consumedNoteIds };
}

export type RecordOutcomeDeps = {
  emit: typeof logBrainEvent;
  mark: typeof markBrainOutcome;
};

const DEFAULT_RECORD_DEPS: RecordOutcomeDeps = { emit: logBrainEvent, mark: markBrainOutcome };

/**
 * Record the outcome of an agent interaction. Always emits a brain_outcomes row
 * (the dream cycle's raw input); on a WIN that consumed brain notes, bumps those
 * notes' wins/confidence. Best-effort — never throws.
 */
export async function recordAgentBrainOutcome(args: {
  orgId: string;
  vertical?: string | null;
  /** e.g. "voice_booking" / "chat_booking" / "voice_abandoned" (varchar(50)). */
  eventType: string;
  outcome: "win" | "loss";
  valueCents?: number;
  /** The note ids loadAgentBrainContext returned for this interaction. */
  noteIds?: string[];
  context?: Record<string, unknown>;
  deps?: Partial<RecordOutcomeDeps>;
}): Promise<void> {
  const emit = args.deps?.emit ?? DEFAULT_RECORD_DEPS.emit;
  const mark = args.deps?.mark ?? DEFAULT_RECORD_DEPS.mark;

  try {
    emit({
      orgId: args.orgId,
      vertical: args.vertical ?? null,
      eventType: args.eventType,
      context: args.context ?? {},
      outcome: args.outcome,
      outcomeValueCents: args.valueCents ?? 0,
    });

    if (args.outcome === "win" && args.noteIds && args.noteIds.length > 0) {
      await mark({ noteIds: args.noteIds, outcome: "win" });
    }
  } catch (err) {
    console.error(
      `[brain] recordAgentBrainOutcome failed for org ${args.orgId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
