// Deterministic replay — trigger filter gate (Reelier phase 2c, gap 2).
//
// WHY: a compiled skill is linear (recorded from ONE run of the agentic
// turn) — it cannot branch. But a push-triggered deployment's Gmail
// listener receives EVERY new-email event, not just the ones that matched
// whatever conditional the recorded turn happened to take (e.g. "only
// label emails from @seldonframe.com"). Without a filter, replay would be
// attempted (and, if the skill's steps happen to still pass their asserts,
// EXECUTED) against every unrelated email too.
//
// `trigger_filter` (replay_skills.trigger_filter, migration 0076) lets an
// operator scope WHEN a skill is even attempted. It is evaluated in
// attemptL0Replay (replay-before-llm.ts) immediately after the enabled
// skill is loaded — BEFORE parseSkill or the tool bridge ever run — so a
// filter mismatch never constructs a single reelier tool; it just falls
// straight through to the normal agentic turn (which still handles the
// conditional itself, same as it always has).
//
// FAIL-SAFE, two directions:
//   - `null` trigger_filter = "attempt for every event" — the operator's
//     own responsibility to scope a narrowly-recorded skill correctly (a
//     filterless skill on a filtered workload is a footgun, not a bug we
//     can detect from here — documented, not enforced).
//   - A MALFORMED trigger_filter (unknown keys, non-string / empty-string
//     values) is NEVER treated as "no filter" — it is treated as
//     filter-not-matched. A corrupted or hand-edited row can therefore only
//     ever SKIP replay, never cause a replay of the wrong event.

export type TriggerFilter = {
  senderEndsWith?: string;
  senderContains?: string;
  subjectContains?: string;
};

const KNOWN_FILTER_KEYS = new Set<string>([
  "senderEndsWith",
  "senderContains",
  "subjectContains",
]);

export type ValidateTriggerFilterResult =
  | { ok: true; filter: TriggerFilter | null }
  | { ok: false; error: string };

/**
 * Strictly validate a candidate trigger_filter value — either freshly
 * `JSON.parse`d CLI input, or the raw jsonb column value straight off a
 * `replay_skills` row (which may predate this validator, or have been
 * hand-edited in the DB). `null`/`undefined` is valid (means "no filter").
 * Anything else must be a plain object whose every key is one of the known
 * conditions and whose every value is a non-empty string — an unknown key,
 * a non-object, an array, or an empty/non-string value is rejected.
 */
export function validateTriggerFilter(value: unknown): ValidateTriggerFilterResult {
  if (value === null || value === undefined) return { ok: true, filter: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "trigger_filter must be a JSON object or null" };
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const unknownKeys = keys.filter((k) => !KNOWN_FILTER_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return { ok: false, error: `unknown trigger_filter key(s): ${unknownKeys.join(", ")}` };
  }

  const filter: TriggerFilter = {};
  for (const key of keys) {
    const raw = obj[key];
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return { ok: false, error: `trigger_filter.${key} must be a non-empty string` };
    }
    (filter as Record<string, string>)[key] = raw;
  }

  if (Object.keys(filter).length === 0) {
    return {
      ok: false,
      error: "trigger_filter must declare at least one condition (or be null for no filter)",
    };
  }

  return { ok: true, filter };
}

export type TriggerFilterEventFields = {
  /** The fired event's sender/from address — "" when the payload didn't
   *  carry one (never assumed present). */
  sender: string;
  /** The fired event's subject line — "" when absent. */
  subject: string;
};

export type EvaluateTriggerFilterResult = { matched: boolean; reason: string };

/**
 * Evaluate a (possibly malformed, straight-off-the-DB) trigger_filter value
 * against the fired event's sender/subject. Never throws. ALL declared
 * conditions must match (AND, case-insensitive) for a match; a `null`
 * filter always matches (no filter = attempt every event, per this
 * module's fail-safe contract above).
 */
export function evaluateTriggerFilter(
  rawFilter: unknown,
  event: TriggerFilterEventFields,
): EvaluateTriggerFilterResult {
  const validated = validateTriggerFilter(rawFilter);
  if (!validated.ok) {
    // Fail-safe: never let a corrupted/hand-edited filter row cause a
    // replay of the wrong event — treat it as not-matched (skip replay,
    // fall back to the normal agentic turn) and warn so it gets noticed.
    console.warn(
      `[deployments/replay/trigger-filter] malformed trigger_filter — treating as filter-not-matched (fail-safe): ${validated.error}`,
    );
    return { matched: false, reason: `malformed trigger_filter: ${validated.error}` };
  }

  const filter = validated.filter;
  if (!filter) return { matched: true, reason: "no filter" };

  const sender = (event.sender ?? "").toLowerCase();
  const subject = (event.subject ?? "").toLowerCase();

  if (filter.senderEndsWith && !sender.endsWith(filter.senderEndsWith.toLowerCase())) {
    return { matched: false, reason: "senderEndsWith mismatch" };
  }
  if (filter.senderContains && !sender.includes(filter.senderContains.toLowerCase())) {
    return { matched: false, reason: "senderContains mismatch" };
  }
  if (filter.subjectContains && !subject.includes(filter.subjectContains.toLowerCase())) {
    return { matched: false, reason: "subjectContains mismatch" };
  }

  return { matched: true, reason: "matched" };
}
