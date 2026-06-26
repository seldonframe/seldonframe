// Agent Loop-Memory (State) — the pure memory model.
//
// This module is the pure core of an agent's loop-memory: it owns the
// memory-key derivation, the recall/record helpers (dependency-injected over
// a store), and the `hasDone` "already-did" predicate that generalizes the
// bespoke review throttle. It is intentionally PURE:
//   • no I/O — persistence is the injected `AgentMemoryStore`'s job;
//   • no clock — callers stamp `entry.at` (an ISO string) themselves;
//   • no throwing — recall/record swallow store failures, because failing to
//     remember must never break the agent that's mid-run.
//
// Org scoping is the STORE's responsibility, not the key's: `memoryKey` does
// not bake `orgId` into the path (so two orgs can share the same key string
// and the store partitions them). `orgId` is still threaded through the args
// so the store can scope its reads/writes.

export type AgentMemoryEntry = {
  /** ISO timestamp; set by callers (who own the clock), never generated here. */
  at?: string;
  /** A stable tag for the action, e.g. "review_requested", "lead_contacted", "note". */
  kind: string;
  /** Human/agent-readable one-liner describing what happened. */
  summary: string;
  /** Optional structured payload, e.g. { channel, messageId }. */
  data?: Record<string, unknown>;
};

export type AgentMemoryStore = {
  read: (key: string) => Promise<AgentMemoryEntry[]>;
  append: (key: string, entry: AgentMemoryEntry) => Promise<void>;
};

/**
 * Sanitize one path segment into a stable, filesystem/path-safe slug:
 *   1. lowercase
 *   2. replace any char not in [a-z0-9._-] with "-"
 *   3. collapse consecutive "-" into a single "-"
 *   4. trim leading/trailing "-" and "."
 * An empty/whitespace-only segment (or one that sanitizes to "") becomes "_".
 */
function sanitizeSegment(raw: string): string {
  const slug = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "");
  return slug.length > 0 ? slug : "_";
}

/**
 * Stable, namespaced memory path for an agent + subject:
 *   `agents/<agentKey>/<subjectKey>` — each segment sanitized.
 *
 * NOTE: `orgId` is intentionally NOT part of the returned key. The store
 * scopes by org; the key only distinguishes agent + subject within that org.
 */
export function memoryKey(args: { orgId: string; agentKey: string; subjectKey: string }): string {
  const agent = sanitizeSegment(args.agentKey);
  const subject = sanitizeSegment(args.subjectKey);
  return `agents/${agent}/${subject}`;
}

/**
 * Recall everything this agent has recorded about this subject.
 * Derives the key, reads via the store, and returns `[]` if the store throws
 * (a failed recall must never break the agent — it just acts as if it has no
 * prior memory).
 */
export async function recallAgentMemory(
  store: AgentMemoryStore,
  args: { orgId: string; agentKey: string; subjectKey: string },
): Promise<AgentMemoryEntry[]> {
  try {
    return await store.read(memoryKey(args));
  } catch {
    return [];
  }
}

/**
 * Record one memory entry for this agent + subject by appending via the store.
 * Swallows store failures — recording memory is best-effort and must never
 * throw into the agent's hot path.
 */
export async function recordAgentMemory(
  store: AgentMemoryStore,
  args: { orgId: string; agentKey: string; subjectKey: string; entry: AgentMemoryEntry },
): Promise<void> {
  try {
    await store.append(memoryKey(args), args.entry);
  } catch {
    // best-effort: failing to record must not break the agent run.
  }
}

/**
 * The generalized throttle: has the agent already done an action of `kind`?
 * True iff some entry carries that exact `kind` (exact match — not a substring
 * or case-insensitive compare).
 */
export function hasDone(entries: AgentMemoryEntry[], kind: string): boolean {
  return entries.some((e) => e.kind === kind);
}
