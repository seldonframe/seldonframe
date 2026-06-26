// Self-Improving Generator — L5.3 — Task 6: generator lessons over Brain loop-memory.
//
// The compounding self-improving loop. When the generation judge (judge.ts)
// fixes a bundle, or the operator corrects a generated agent, we RECORD what was
// wrong and how it was fixed as a `{pattern, mistake, correction}` lesson. Future
// generations RECALL those lessons and fold them into the prompt
// (`lessonsToPromptHint`) so the generator stops repeating the same mistake —
// it gets better with every correction.
//
// Reuse, don't reinvent: this rides the EXISTING L1 agent loop-memory. The
// lessons are just `AgentMemoryEntry`s (kind "generator_lesson", the lesson in
// `data`) stored under one org-scoped key — agentKey `_generator`, subject
// `lessons` — via the SAME injected `AgentMemoryStore`. NO new table, NO new
// persistence path: the org's Brain note at `memory/agents/_generator/lessons.json`.
//
// Persistence model (inherited from L1): the store is APPEND + READ. `append`
// read-modify-writes the whole array at the Brain layer (body-replace), but the
// store interface only exposes `read`/`append` — there is no replace/trim. So:
//   • dedupe happens BEFORE the append (recall first; skip if an identical
//     pattern+correction is already stored) — we never push a duplicate;
//   • the cap is enforced on RECALL (return the most-recent N), since an
//     append-only store can't trim the persisted array. `MAX_LESSONS` bounds
//     what recall ever surfaces.
//
// Fail-soft, like all of L1: lessons are best-effort. A store error on record is
// swallowed; recall returns [] on any error. Failing to remember a lesson must
// NEVER break a generation — the deterministic bundle is already safe.
//
// PURE seam: no I/O of its own (the store is injected), no "use server".

import {
  memoryKey,
  recallAgentMemory,
  recordAgentMemory,
  type AgentMemoryEntry,
  type AgentMemoryStore,
} from "@/lib/agents/memory/agent-memory";

// ─── public types ────────────────────────────────────────────────────────────

/**
 * One thing the generator learned: when `pattern` shows up, the `mistake` it
 * used to make, and the `correction` to apply instead. Recorded from a judge fix
 * or an operator correction; recalled into future generations.
 */
export type GeneratorLesson = {
  /** The recognizable situation, e.g. "sentence says 'after a booking' but trigger is inbound". */
  pattern: string;
  /** What the generator got wrong before, e.g. "wired an inbound trigger". */
  mistake: string;
  /** The fix to honor next time, e.g. "use trigger.event = booking.completed". */
  correction: string;
};

// ─── constants ───────────────────────────────────────────────────────────────

/** The agent namespace these org-wide lessons live under (not a real agent). */
const GENERATOR_AGENT_KEY = "_generator";
/** The subject within that namespace. */
const LESSONS_SUBJECT_KEY = "lessons";
/** The entry `kind` we stamp each lesson with (so co-resident notes are ignored). */
const LESSON_KIND = "generator_lesson";

/** Hard upper bound on how many lessons recall ever surfaces (most-recent N). */
const MAX_LESSONS = 50;
/** Default recall size when the caller doesn't pass `limit`. */
const DEFAULT_RECALL_LIMIT = 8;

// ─── internals ───────────────────────────────────────────────────────────────

/** The recall args for the one org-scoped lessons key (store scopes by org). */
function lessonsMemoryArgs(orgId: string): {
  orgId: string;
  agentKey: string;
  subjectKey: string;
} {
  return { orgId, agentKey: GENERATOR_AGENT_KEY, subjectKey: LESSONS_SUBJECT_KEY };
}

/** Is `v` a non-empty string? */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Pull a well-formed `GeneratorLesson` out of a memory entry's `data`, or `null`
 * if it isn't one. Tolerant by design: a co-resident note of another kind, or a
 * malformed payload, is simply skipped (never throws) so a future schema change
 * can't crash recall.
 */
function lessonFromEntry(entry: AgentMemoryEntry): GeneratorLesson | null {
  if (!entry || entry.kind !== LESSON_KIND) return null;
  const data = entry.data;
  if (!data || typeof data !== "object") return null;
  const { pattern, mistake, correction } = data as Record<string, unknown>;
  if (!isNonEmptyString(pattern) || !isNonEmptyString(correction)) return null;
  return {
    pattern,
    mistake: typeof mistake === "string" ? mistake : "",
    correction,
  };
}

/** Two lessons are "the same" iff pattern AND correction match (the dedupe key). */
function sameLesson(a: GeneratorLesson, b: GeneratorLesson): boolean {
  return a.pattern === b.pattern && a.correction === b.correction;
}

/** All stored lessons, oldest-first (insertion order), junk entries dropped. */
async function readLessonsOldestFirst(
  store: AgentMemoryStore,
  orgId: string,
): Promise<GeneratorLesson[]> {
  // recallAgentMemory already never throws (store error → []).
  const entries = await recallAgentMemory(store, lessonsMemoryArgs(orgId));
  const lessons: GeneratorLesson[] = [];
  for (const entry of entries) {
    const lesson = lessonFromEntry(entry);
    if (lesson) lessons.push(lesson);
  }
  return lessons;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Record one generator lesson under the org's `_generator/lessons` memory.
 *
 * Reads the existing lessons first and SKIPS the append if an identical
 * (pattern+correction) lesson is already stored — so duplicates never pile up.
 * Otherwise appends it via the injected store (an `AgentMemoryEntry` carrying the
 * lesson in `data`).
 *
 * Best-effort: any store failure is swallowed (recall + record both soft-fail) —
 * failing to remember a lesson must NEVER break a generation. Never throws.
 */
export async function recordGeneratorLesson(
  store: AgentMemoryStore,
  args: { orgId: string; lesson: GeneratorLesson },
): Promise<void> {
  const { orgId, lesson } = args;
  // Ignore a malformed lesson (empty pattern/correction) — nothing to learn.
  if (!isNonEmptyString(lesson?.pattern) || !isNonEmptyString(lesson?.correction)) {
    return;
  }
  try {
    const existing = await readLessonsOldestFirst(store, orgId);
    if (existing.some((l) => sameLesson(l, lesson))) {
      return; // dedupe: already learned this exact pattern→correction.
    }
    const entry: AgentMemoryEntry = {
      at: new Date().toISOString(),
      kind: LESSON_KIND,
      summary: `learned: ${lesson.pattern}`,
      data: {
        pattern: lesson.pattern,
        mistake: lesson.mistake,
        correction: lesson.correction,
      },
    };
    // recordAgentMemory already swallows store errors — best-effort append.
    await recordAgentMemory(store, { ...lessonsMemoryArgs(orgId), entry });
  } catch {
    // Defense-in-depth: even an unexpected throw here must not break the agent.
  }
}

/**
 * Recall the org's generator lessons, MOST-RECENT-FIRST, capped to `limit`
 * (default {@link DEFAULT_RECALL_LIMIT}, never more than {@link MAX_LESSONS}).
 *
 * An empty/missing note, a store error, or all-junk entries → `[]`. Never throws.
 */
export async function recallGeneratorLessons(
  store: AgentMemoryStore,
  args: { orgId: string; limit?: number },
): Promise<GeneratorLesson[]> {
  try {
    const oldestFirst = await readLessonsOldestFirst(store, args.orgId);
    // Most-recent-first.
    const recent = oldestFirst.slice().reverse();
    const requested =
      typeof args.limit === "number" && args.limit >= 0 ? args.limit : DEFAULT_RECALL_LIMIT;
    const cap = Math.min(requested, MAX_LESSONS);
    return recent.slice(0, cap);
  } catch {
    return [];
  }
}

/**
 * Render a short bulleted block to splice into a generation prompt. Empty
 * lessons → "" (so callers can concatenate unconditionally). Each lesson becomes
 * one bullet naming the pattern, the correction to honor, and (as context) the
 * prior mistake. Pure — no I/O.
 */
export function lessonsToPromptHint(lessons: GeneratorLesson[]): string {
  if (!Array.isArray(lessons) || lessons.length === 0) return "";
  const bullets = lessons
    .filter((l) => isNonEmptyString(l?.pattern) && isNonEmptyString(l?.correction))
    .map((l) => {
      const was = isNonEmptyString(l.mistake) ? ` (was: ${l.mistake})` : "";
      return `- When ${l.pattern}: ${l.correction}${was}`;
    });
  if (bullets.length === 0) return "";
  return `Past corrections to honor:\n${bullets.join("\n")}`;
}
