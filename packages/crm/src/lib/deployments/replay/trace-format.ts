// Deterministic replay — Reelier phase 2c, slice 1 (OBSERVE MODE ONLY).
//
// WHAT THIS IS: a small, pure module implementing the Reelier trace-record
// FORMAT (github.com/seldonframe/reelier) — NOT a dependency on Reelier's
// code. Slice 1 only ever WRITES records in this shape (a recorder — see
// ./recorder.ts); nothing here replays a trace. Slice 2 (a future, separate
// change) is what will read `agent_workflow_traces.records` and compile them.
//
// Record shapes (seq is monotonic from 0, starting with the one `meta`
// record; `i` is the call index, monotonic from 0, independent of `seq`):
//   {t:"meta",   seq, name, startedAt, wrapped}
//   {t:"note",   seq, ts, text}
//   {t:"call",   seq, i, ts, tool, args}
//   {t:"result", seq, i, ok, ms, body}
//
// Everything here is PURE and never throws — an observation-only recorder
// must never affect (or even risk) the agent turn it is watching alongside.

/** meta must be first (seq 0); every trace opens with exactly one. */
export type TraceMetaRecord = {
  t: "meta";
  seq: number;
  /** e.g. "email:<deploymentId>" — the running workflow's stable name. */
  name: string;
  /** ISO-8601 turn start time. */
  startedAt: string;
  /** Tool source names bound into this turn (native + connector), for
   *  compile-time context — never large, never secret. */
  wrapped: string[];
};

export type TraceNoteRecord = {
  t: "note";
  seq: number;
  ts: string;
  text: string;
};

export type TraceCallRecord = {
  t: "call";
  seq: number;
  /** Call index — 0 for the first tool call, 1 for the second, … */
  i: number;
  ts: string;
  tool: string;
  args: unknown;
};

export type TraceResultRecord = {
  t: "result";
  seq: number;
  /** Same call index as the matching TraceCallRecord. */
  i: number;
  ok: boolean;
  /** Wall-clock duration of the call, in milliseconds. */
  ms: number;
  body: unknown;
};

export type TraceRecord =
  | TraceMetaRecord
  | TraceNoteRecord
  | TraceCallRecord
  | TraceResultRecord;

/** Max chars a single `result.body` (post-redaction, post-serialization) may
 *  occupy in a stored record — matches the token-smart-runtime precedent
 *  (turn-token-economy.ts's TOOL_RESULT_MAX_CHARS) so a runaway connector
 *  payload can't bloat a trace row the same way it once bloated a turn's
 *  token spend. A separate, independent cap — this module doesn't import
 *  that one so the replay format has no runtime dependency on the turn loop. */
export const TRACE_BODY_MAX_CHARS = 20_000;

/** Max records a single trace may hold — caps a runaway turn (e.g. hitting
 *  MAX_TURN_ITERATIONS with many tool calls per iteration) from producing an
 *  unbounded jsonb row. Once the cap is hit, further records are silently
 *  dropped by the recorder (not appended here — this module only shapes/caps
 *  individual records, the recorder owns the array). */
export const TRACE_MAX_RECORDS = 200;

/** Matches a plausible Anthropic/OpenAI-style secret key: `sk-` (or similar)
 *  followed by 10+ token chars. */
const SECRET_KEY_RE = /\bsk-[A-Za-z0-9_-]{10,}/g;
/** Matches an Authorization-header-shaped bearer token. */
const BEARER_RE = /Bearer\s+\S{8,}/gi;

/** Redact secret-shaped substrings from a plain string. Pure; never throws. */
function redactString(value: string): string {
  return value.replace(SECRET_KEY_RE, "[redacted]").replace(BEARER_RE, "Bearer [redacted]");
}

/**
 * Deep-redact secret-shaped strings out of an arbitrary JSON-ish value
 * (tool args or a tool result body) before it is ever stored. Walks
 * objects/arrays; non-string primitives pass through unchanged. Guards
 * against cycles/excessive depth with a max-depth cutoff (returns a fixed
 * marker past the cutoff rather than recursing forever or throwing).
 * Pure; never throws — any unexpected shape degrades to a safe marker.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[redact: max depth exceeded]";
  try {
    if (typeof value === "string") return redactString(value);
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, depth + 1);
    }
    return out;
  } catch {
    return "[redact: unserializable]";
  }
}

/**
 * Serialize + cap a (already-redacted) body for storage in a `result.body`
 * field. Over-cap values are truncated with an explicit marker (mirrors
 * serializeToolResultCapped's contract) so a compiler reading this trace
 * later can tell truncation happened rather than silently seeing a partial
 * JSON value. Pure; never throws (unserializable → a fixed marker string,
 * matching the turn-token-economy precedent).
 */
export function capTraceBody(value: unknown, cap: number = TRACE_BODY_MAX_CHARS): unknown {
  let json: string;
  try {
    json = JSON.stringify(value ?? null) ?? "null";
  } catch {
    return "[trace body was not serializable]";
  }
  if (json.length <= cap) return value ?? null;
  return {
    __truncated: true,
    preview: json.slice(0, cap),
    originalLength: json.length,
  };
}

/** Build the opening `meta` record (always seq 0). */
export function makeMetaRecord(input: {
  name: string;
  startedAt: string;
  wrapped: string[];
}): TraceMetaRecord {
  return { t: "meta", seq: 0, name: input.name, startedAt: input.startedAt, wrapped: input.wrapped };
}

/** Build a `note` record at the given seq. */
export function makeNoteRecord(input: { seq: number; ts: string; text: string }): TraceNoteRecord {
  return { t: "note", seq: input.seq, ts: input.ts, text: input.text };
}

/** Build a `call` record — args are redacted before storage. */
export function makeCallRecord(input: {
  seq: number;
  i: number;
  ts: string;
  tool: string;
  args: unknown;
}): TraceCallRecord {
  return {
    t: "call",
    seq: input.seq,
    i: input.i,
    ts: input.ts,
    tool: input.tool,
    args: redact(input.args),
  };
}

/** Build a `result` record — body is redacted then cap'd before storage. */
export function makeResultRecord(input: {
  seq: number;
  i: number;
  ok: boolean;
  ms: number;
  body: unknown;
}): TraceResultRecord {
  return {
    t: "result",
    seq: input.seq,
    i: input.i,
    ok: input.ok,
    ms: input.ms,
    body: capTraceBody(redact(input.body)),
  };
}
