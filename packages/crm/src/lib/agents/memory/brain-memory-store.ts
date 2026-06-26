// Agent Loop-Memory (State) — Task T2: the Brain v2 store backing.
//
// agent-memory.ts is the PURE memory model (key derivation + recall/record +
// the `hasDone` predicate) over an injected `AgentMemoryStore`. This module is
// the durable backing: it persists each agent's loop-memory as a JSON array in
// a Brain v2 note (`brain_notes`), namespaced per agent+subject under
// `memory/<key>.json`.
//
// Why Brain v2 (not a new table): the workspace Brain (`brain_notes`) is
// already the org's durable, per-path note store — `writeBrainNote` upserts by
// (orgId, path) and REPLACES the body, and `readBrainNote` returns the body or
// null. That is exactly a key→value document store, so the agent's memory rides
// on it: no new table, no migration, and the memory is visible in the same
// workspace Brain the operator already inspects.
//
// Two layers:
//   1. `makeBrainMemoryStore(deps)` — the PURE, unit-testable core. It depends
//      only on `readNote`/`writeNote` (raw note body in/out) + the orgId, so a
//      test injects an in-memory Map and never touches Postgres. It owns the
//      JSON (de)serialization, the `memory/<key>.json` path convention, and the
//      soft-fail contract (a store error → read returns []; append swallows +
//      warns — remembering must never break the agent mid-run).
//   2. `makeBrainMemoryStoreForOrg(orgId)` — the production factory. The ONLY
//      non-pure part: it wires `readNote`/`writeNote` to the real Brain v2 lib
//      (`readBrainNote`/`writeBrainNote`, scope "workspace") so the memory
//      lands in the org's Brain. Integration-tested only (mirrors the existing
//      brain-context.ts access pattern).

import { readBrainNote, writeBrainNote } from "@/lib/brain/store";

import type { AgentMemoryEntry, AgentMemoryStore } from "./agent-memory";

/**
 * The minimal Brain-note seam this store needs. `readNote`/`writeNote` deal in
 * the RAW note body (a JSON string here) so the core stays a pure document
 * store — the Brain v2 wiring (scope, orgId, the BrainNote envelope) lives in
 * the production factory below, not here.
 */
export type BrainMemoryDeps = {
  orgId: string;
  /** Raw note body for `path`, or null if the note doesn't exist. */
  readNote: (path: string) => Promise<string | null>;
  /** Upsert the note at `path` with `body` (replaces any existing body). */
  writeNote: (path: string, body: string) => Promise<void>;
};

/**
 * The Brain-note path for a memory key. `agent-memory.ts`'s `memoryKey`
 * produces `agents/<agentKey>/<subjectKey>`, so this yields
 * `memory/agents/<agentKey>/<subjectKey>.json` — the convention the spec pins.
 */
function notePathForKey(key: string): string {
  return `memory/${key}.json`;
}

/**
 * Parse a raw note body into an `AgentMemoryEntry[]`. Tolerant by design:
 * null/empty/whitespace → []; non-JSON or a non-array shape → [] (never throws).
 * The agent treats a corrupt/missing note as "no prior memory" rather than
 * crashing mid-run.
 */
function parseEntries(body: string | null): AgentMemoryEntry[] {
  if (!body || body.trim() === "") return [];
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? (parsed as AgentMemoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Build an `AgentMemoryStore` backed by a Brain-note seam.
 *
 *  • `read(key)`  — load the note at `memory/<key>.json`, JSON.parse to an
 *    entry array. Missing / empty / malformed / a read error → `[]` (never
 *    throws).
 *  • `append(key, entry)` — read the current array (as above), push `entry`,
 *    and write the whole array back as pretty JSON. A read/write error is
 *    swallowed + `console.warn`'d (best-effort: recording memory must never
 *    throw into the agent's hot path).
 */
export function makeBrainMemoryStore(deps: BrainMemoryDeps): AgentMemoryStore {
  const read = async (key: string): Promise<AgentMemoryEntry[]> => {
    try {
      const body = await deps.readNote(notePathForKey(key));
      return parseEntries(body);
    } catch (err) {
      // A failed recall must never break the agent — act as if no memory.
      console.warn(
        `[agent-memory] read failed for org ${deps.orgId} key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  };

  const append = async (key: string, entry: AgentMemoryEntry): Promise<void> => {
    try {
      const path = notePathForKey(key);
      // Read-modify-write: append to whatever is currently persisted. A read
      // failure here surfaces as the catch below (we don't silently drop the
      // prior memory by treating a hard error as "empty").
      const current = parseEntries(await deps.readNote(path));
      current.push(entry);
      await deps.writeNote(path, JSON.stringify(current, null, 2));
    } catch (err) {
      // Best-effort: failing to record must not throw into the agent run.
      console.warn(
        `[agent-memory] append failed for org ${deps.orgId} key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  return { read, append };
}

// ─── Production factory ───────────────────────────────────────────────────────
//
// The only non-pure part: wire the Brain-note seam to the real Brain v2 lib.
// `readBrainNote`/`writeBrainNote` operate on `brain_notes` scoped to the org
// (scope "workspace"); we hand the store the raw body / null, exactly as the
// pure core expects. Mirrors the access pattern in lib/agents/brain-context.ts.
//
// NOTE: `readBrainNote` ticks the note's `uses`/confidence as a side effect —
// harmless for a memory note (it's never a promotion candidate), and it keeps
// the access path identical to every other Brain read.

/**
 * Production `AgentMemoryStore` for an org, backed by the real workspace Brain
 * (`brain_notes`). Memory notes live at `memory/agents/<agentKey>/<subjectKey>.json`
 * in the org's Brain. Integration-tested only (the pure core above carries the
 * unit coverage).
 */
export function makeBrainMemoryStoreForOrg(orgId: string): AgentMemoryStore {
  return makeBrainMemoryStore({
    orgId,
    readNote: async (path) => {
      const note = await readBrainNote({ orgId, scope: "workspace", path });
      return note ? note.body : null;
    },
    writeNote: async (path, body) => {
      await writeBrainNote({
        orgId,
        scope: "workspace",
        path,
        body,
        metadata: { type: "agent-memory", source: "agent-loop-memory" },
      });
    },
  });
}
