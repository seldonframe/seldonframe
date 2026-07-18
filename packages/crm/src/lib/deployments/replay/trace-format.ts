// Deterministic replay — Reelier phase 2c, slice 1 (OBSERVE MODE ONLY).
//
// WHAT THIS IS: a small, pure module implementing the Reelier trace-record
// FORMAT (github.com/seldonframe/reelier) — NOT a runtime dependency on
// Reelier's code (this module imports only TYPES from
// "@seldonframe/reelier/trace", never any of its functions; ./recorder.ts
// stays a pure, DB-free, reelier-runtime-free writer). Slice 1 only ever
// WRITES records in this shape; slice 2 (compile.ts) is what reads
// `agent_workflow_traces.records` and compiles them via reelier's own
// compile().
//
// TYPES DERIVE FROM THE PACKAGE: TraceRecord (and its per-`t` members below)
// are aliases of ReelierTraceRecord from "@seldonframe/reelier/trace" — see
// src/types/reelier.d.ts (the package ships no .d.ts of its own; that file
// is hand-derived from its dist/trace.js and is this repo's one contract
// with the format). Deriving here rather than re-declaring the shape means a
// future reelier trace-format change becomes a TYPE ERROR at this file's
// import, not silent drift between two independently hand-maintained shapes.
//
// SF PROFILE (this repo's own constraints on TOP of the record format, not
// part of it): the 20k body cap (TRACE_BODY_MAX_CHARS), the 200-record cap
// (TRACE_MAX_RECORDS), and redaction (redact()/redactString()) below are all
// SF-only concerns — reelier's own trace format has no opinion on any of
// them. Kept local and clearly separated from the imported record shapes.
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

import type { ReelierTraceRecord } from "@seldonframe/reelier/trace";

/** This repo's trace-record union IS reelier's own trace-record type —
 *  derived, not re-declared (see header comment). */
export type TraceRecord = ReelierTraceRecord;

/** meta must be first (seq 0); every trace opens with exactly one. Narrowed
 *  from TraceRecord by discriminant — not a separate declaration. */
export type TraceMetaRecord = Extract<TraceRecord, { t: "meta" }>;
export type TraceNoteRecord = Extract<TraceRecord, { t: "note" }>;
export type TraceCallRecord = Extract<TraceRecord, { t: "call" }>;
export type TraceResultRecord = Extract<TraceRecord, { t: "result" }>;

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
/** Matches an Authorization-header-shaped Basic credential (base64-ish). */
const BASIC_AUTH_RE = /Basic\s+[A-Za-z0-9+/=]{8,}/gi;
/** Matches a Google OAuth access token (`ya29.…`). */
const GOOGLE_OAUTH_RE = /\bya29\.[A-Za-z0-9._-]{10,}/g;
/** Matches a JWT-shaped string (three dot-separated base64url segments). */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
/** Query-param / form-field NAME pattern whose VALUE is masked when found as
 *  a `name=value` occurrence inside any plain string — e.g. a URL stored
 *  whole in a single string field (`?api_key=abc123&x=1`) or an
 *  obviously form-encoded body (`token=abc123&foo=bar`). Independent of
 *  SECRET_KEY_NAME_RE below, which only fires on actual JSON object keys —
 *  this one fires on TEXT embedded inside a string value.
 *
 *  NOT the same matching policy as SECRET_KEY_NAME_RE (that one is a bare
 *  substring test — `/token|secret|.../i.test(k)` — appropriate for a JSON
 *  key name, which is rarely an English word). A query-param name embedded
 *  in arbitrary URL/body text is far more likely to collide with an
 *  ordinary word, so this pattern is ANCHORED: each short token
 *  (key/auth/authorization/signature/sig/code) must match the param name as
 *  a whole word or a `_`/`-`-delimited compound at the END of the name
 *  (`(?:^|[_-])TOKEN$`), never as a bare substring anywhere. That's what
 *  keeps `api_key`/`access_token`/`public_key`/`auth_code` masked while
 *  `monkey`/`donkey`/`design`/`author`/`barcode` (which merely CONTAIN one
 *  of those tokens mid-word) pass through untouched. */
const QUERY_PARAM_NAME_RE =
  /(?:^|[_-])(?:api[_-]?key|access[_-]?token|key|token|secret|password|auth|authorization|signature|sig|code)$/i;
/** Matches one `name=value` pair, anchored so it only fires on an ACTUAL
 *  `name=value` occurrence — preceded by start-of-string, `?`, `&`,
 *  whitespace, or a quote (never mid-word, so a bare sentence containing
 *  "key" never matches — there's no `=`). The value runs until the next
 *  `&`, whitespace, quote, or angle bracket, so only THAT param's value is
 *  replaced and the rest of the URL/body (other params, the path, etc.)
 *  passes through untouched. */
const QUERY_PARAM_PAIR_RE = /(^|[?&\s"'])([A-Za-z0-9_.\-]+)=([^&\s"'<>]*)/g;

/** Mask query-param / form-field VALUES by NAME inside a plain string. Pure;
 *  never throws (a plain regex replace over a string can't throw). */
function redactQueryParams(value: string): string {
  return value.replace(QUERY_PARAM_PAIR_RE, (match, prefix: string, name: string, val: string) => {
    if (!val || !QUERY_PARAM_NAME_RE.test(name)) return match;
    return `${prefix}${name}=«redacted»`;
  });
}

/** Object keys whose STRING value is masked outright (never pattern-matched
 *  — a token/secret/password field can hold any shape, not just the shapes
 *  above), when the value is long enough to plausibly be a real credential
 *  rather than e.g. a boolean-ish "yes"/short label. */
const SECRET_KEY_NAME_RE = /token|secret|password|api[_-]?key|authorization/i;
/** Minimum length for a key-name-matched value to be masked — short strings
 *  under a secret-shaped key name (e.g. `{tokenType: "bearer"}`) are almost
 *  certainly not the secret itself. */
const SECRET_KEY_NAME_MIN_LENGTH = 8;

/** Redact secret-shaped substrings from a plain string. Pure; never throws.
 *
 *  NOTE — this is defense-in-depth, not a guarantee: it catches the KNOWN
 *  shapes above (Anthropic/OpenAI-style keys, Bearer/Basic auth headers,
 *  Google OAuth tokens, JWTs), a URL-query-param / form-field NAME
 *  heuristic (QUERY_PARAM_NAME_RE — masks `?api_key=...`-shaped values by
 *  param name, e.g. a callback/webhook URL stored whole in a string field),
 *  plus a JSON-object key-name heuristic (see SECRET_KEY_NAME_RE in
 *  redact() below) — an arbitrary connector's own bespoke credential shape,
 *  embedded in a plain string under an innocuous-looking field name, can
 *  still slip through. Treat this as one layer, not the only layer, of the
 *  "never store a live secret" contract. */
function redactString(value: string): string {
  return redactQueryParams(
    value
      .replace(SECRET_KEY_RE, "[redacted]")
      .replace(BEARER_RE, "Bearer [redacted]")
      .replace(BASIC_AUTH_RE, "Basic [redacted]")
      .replace(GOOGLE_OAUTH_RE, "[redacted]")
      .replace(JWT_RE, "[redacted]"),
  );
}

/**
 * Deep-redact secret-shaped strings out of an arbitrary JSON-ish value
 * (tool args or a tool result body) before it is ever stored. Walks
 * objects/arrays; non-string primitives pass through unchanged. At each
 * object key, a string value under a secret-shaped KEY NAME (token / secret /
 * password / api[_-]?key / authorization, case-insensitive) is masked
 * outright — independent of whether its shape matches one of the known
 * patterns above — since a "secret" or "password" field can hold literally
 * any string. Guards against cycles/excessive depth with a max-depth cutoff
 * (returns a fixed marker past the cutoff rather than recursing forever or
 * throwing). Pure; never throws — any unexpected shape degrades to a safe
 * marker.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[redact: max depth exceeded]";
  try {
    if (typeof value === "string") return redactString(value);
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        v.length >= SECRET_KEY_NAME_MIN_LENGTH &&
        SECRET_KEY_NAME_RE.test(k)
      ) {
        out[k] = "[redacted]";
        continue;
      }
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

/** Build a `call` record — args are redacted THEN cap'd before storage,
 *  mirroring makeResultRecord's contract exactly (a runaway call args
 *  payload — e.g. a bulk connector operation — must not bloat a trace row
 *  any more than a runaway result body can). */
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
    args: capTraceBody(redact(input.args)),
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
