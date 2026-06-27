// Event-agent activity — the PURE fold that turns the durable sources into a
// single, sorted "recent fires" feed for the operator.
//
// The event-agent path (run-event-agent.ts) has NO workflow_runs row — its
// observable record is spread across durable sources:
//   • SENT      — a smsMessages / emails row tagged metadata.source like
//                 "agent:<skill>" (or "agent:<skill>:test" for a Send-test);
//   • SCHEDULED — an event_agent_scheduled_sends row, status 'pending', with a
//                 future dueAt (an F2 delayed send waiting for the cron);
//   • BLOCKED   — an event_agent_scheduled_sends row, status 'failed' (the cron
//                 replayed it and a gate/verify/guardrail blocked or the send
//                 errored — lastError carries why);
//   • (also folded: scheduled rows that already went 'sent' or were 'skipped').
//
// This module owns ONLY the pure fold: given the rows from those tables (the
// DB-backed loader in activity-store.ts fetches them), produce one newest-first
// list of `EventAgentActivityRow`. No I/O, no DB, no clock, never throws — so it
// is unit-tested in isolation. The page renders the result read-only.

/** The skill a row belongs to, surfaced for the "agent" column. We keep it as a
 *  free string (the durable tag/column is a string) and prettify for display. */
export type EventAgentActivitySkill = string;

/** The outcome bucket shown per row. */
export type EventAgentActivityOutcome =
  | "sent"
  | "scheduled"
  | "blocked"
  | "skipped";

/** One folded activity row, ready to render. */
export type EventAgentActivityRow = {
  /** ISO timestamp the row is sorted/displayed by: the send time (sends) or the
   *  due time (scheduled/blocked). */
  when: string;
  /** The skill slug (e.g. "review-requester"), for the agent column. */
  skill: EventAgentActivitySkill;
  /** "sms" | "email" (the channel the message used / will use). */
  channel: string;
  /** A human label for the recipient — the contact name when known, else the
   *  raw address (phone/email), else "—". */
  contactLabel: string;
  /** Which CLIENT this fire belongs to — the deployment's client name when the
   *  feed's org is a provisioned client workspace (a deployed agent retargets its
   *  sends into the client org), else "—". Resolved once per feed by the loader
   *  and carried onto each row from the source's `clientLabel`. */
  clientLabel: string;
  /** Which bucket this row is. */
  outcome: EventAgentActivityOutcome;
  /** Optional one-line detail: the reason a blocked row failed, or a "(test)" tag
   *  for an operator self-test send, or the relative due hint for a scheduled row. */
  detail?: string;
  /** True iff this is a Send-test row (metadata.source ended in ":test"), so the
   *  UI can tag it distinctly. */
  isTest: boolean;
};

/** A sent-message row from smsMessages / emails, tagged with an agent source. */
export type EventAgentSendRow = {
  /** The metadata.source value, e.g. "agent:review-requester" or
   *  "agent:speed-to-lead:test". The skill + test-ness are parsed from it. */
  source: string;
  channel: "sms" | "email";
  /** The contact's display name, if the row was linked + resolvable. */
  contactName?: string | null;
  /** The raw destination (toNumber / toEmail), shown when no name is known. */
  toAddress?: string | null;
  /** The client this send belongs to (the feed org's deployment client name).
   *  Absent → "—". Resolved per-feed by the loader (same value for every row in a
   *  single org's feed) and threaded onto the folded row. */
  clientLabel?: string | null;
  /** When it was sent (sentAt ?? createdAt), ISO. */
  at: string;
};

/** A row from event_agent_scheduled_sends (the F2 deferred-send queue). */
export type EventAgentScheduledRow = {
  agentSkill: string;
  channel: string;
  contactName?: string | null;
  /** The client this scheduled send belongs to (the feed org's deployment client
   *  name). Absent → "—". Resolved per-feed by the loader. */
  clientLabel?: string | null;
  status: "pending" | "sent" | "failed" | "skipped" | string;
  /** When the send is/was due, ISO. */
  dueAt: string;
  /** The failure reason for a 'failed' row (→ blocked detail). */
  lastError?: string | null;
};

/** Parse an agent metadata.source tag ("agent:<skill>[:test]") into its skill +
 *  whether it's a test. A non-agent / malformed tag yields `{ skill:"", isTest:
 *  false }` so the caller can drop it. Pure. */
export function parseAgentSource(source: string): { skill: string; isTest: boolean } {
  if (typeof source !== "string") return { skill: "", isTest: false };
  const parts = source.split(":");
  if (parts[0] !== "agent" || parts.length < 2) return { skill: "", isTest: false };
  const skill = (parts[1] ?? "").trim();
  const isTest = parts[parts.length - 1] === "test";
  return { skill, isTest };
}

/** Map a scheduled-send status to an activity outcome. pending→scheduled,
 *  failed→blocked, sent→sent, skipped→skipped (anything unknown → scheduled, the
 *  safe "still in the queue" reading). Pure. */
function outcomeForScheduledStatus(status: string): EventAgentActivityOutcome {
  switch (status) {
    case "sent":
      return "sent";
    case "failed":
      return "blocked";
    case "skipped":
      return "skipped";
    case "pending":
    default:
      return "scheduled";
  }
}

/** The recipient label: the contact name when present, else the raw address,
 *  else an em dash. Pure. */
function contactLabelFrom(
  contactName: string | null | undefined,
  toAddress?: string | null,
): string {
  const name = typeof contactName === "string" ? contactName.trim() : "";
  if (name) return name;
  const addr = typeof toAddress === "string" ? toAddress.trim() : "";
  if (addr) return addr;
  return "—";
}

/** The client label: a trimmed non-empty client name, else an em dash. Pure. */
function clientLabelFrom(clientLabel: string | null | undefined): string {
  const name = typeof clientLabel === "string" ? clientLabel.trim() : "";
  return name || "—";
}

/** A valid ISO/parseable timestamp's epoch ms, or -Infinity (sorts last). Pure. */
function ms(at: string): number {
  const n = Date.parse(at);
  return Number.isFinite(n) ? n : -Infinity;
}

/** The allowed Activity-feed windows, in days. */
export type ActivityWindowDays = 1 | 7 | 30;

/** The default window the feed opens on (last 7 days). */
export const DEFAULT_ACTIVITY_WINDOW_DAYS: ActivityWindowDays = 7;

/**
 * Is `iso` within the trailing `windowDays`-day window ending at `nowMs`? Pure.
 *
 *   keep ⟺ (nowMs - windowDays·86_400_000) ≤ when ≤ nowMs
 *
 * The window is INCLUSIVE at both ends: a row exactly `windowDays` old is kept,
 * and a row dated exactly `nowMs` is kept. A FUTURE row (when > nowMs) — e.g. a
 * scheduled send due later — is dropped, since it's outside the trailing window
 * (the feed shows what has happened / is overdue within the window, sorted
 * newest-first elsewhere). An unparseable `iso` → dropped (can't place it).
 * `windowDays` is clamped to ≥ 0 defensively.
 */
export function withinWindow(
  iso: string,
  nowMs: number,
  windowDays: number,
): boolean {
  const when = ms(iso);
  if (!Number.isFinite(when)) return false;
  if (!Number.isFinite(nowMs)) return false;
  const days = Math.max(0, windowDays);
  const lowerBound = nowMs - days * 86_400_000;
  return when >= lowerBound && when <= nowMs;
}

/** Coerce an arbitrary `?window=` value to a valid {1,7,30}, else the default.
 *  Pure — accepts the raw searchParam string or number; anything else → default. */
export function parseActivityWindowDays(value: unknown): ActivityWindowDays {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (n === 1 || n === 7 || n === 30) return n;
  return DEFAULT_ACTIVITY_WINDOW_DAYS;
}

/**
 * Fold the durable sources into ONE newest-first activity feed.
 *
 *   • Each SEND row whose source parses to a non-empty agent skill becomes a
 *     `sent` row (tagged `isTest` + a "(test)" detail when it's a Send-test).
 *     A non-agent/malformed source is DROPPED (it isn't event-agent activity).
 *   • Each SCHEDULED row becomes a row whose outcome is derived from its status
 *     (pending→scheduled, failed→blocked, sent→sent, skipped→skipped). A blocked
 *     row carries its `lastError` as the detail.
 *
 * Rows are sorted by `when` descending (newest first); ties keep input order
 * (stable). Pure; never throws. `limit` (when given, > 0) caps the output AFTER
 * the merge+sort so the most-recent N across BOTH sources win.
 *
 * The second arg is either a bare `limit` (legacy) OR an options object that can
 * ALSO carry a trailing-window filter (`windowDays` + `nowMs`): when both are
 * present, rows outside the window are dropped via `withinWindow` BEFORE the
 * sort+limit, so the limit counts only in-window rows. Omitting the window keeps
 * the prior behavior (no time bound).
 */
export type SummarizeActivityOptions = {
  /** Cap the merged result to the most-recent N (> 0). */
  limit?: number;
  /** Trailing window length in days — when set (with `nowMs`), rows older than
   *  `nowMs - windowDays·1d` (or in the future) are dropped. */
  windowDays?: number;
  /** "Now" as epoch ms, paired with `windowDays`. Injected (never read from the
   *  clock here) so the fold stays pure + testable. */
  nowMs?: number;
};

export function summarizeEventAgentActivity(
  input: {
    sends?: EventAgentSendRow[];
    scheduled?: EventAgentScheduledRow[];
  },
  limitOrOptions?: number | SummarizeActivityOptions,
): EventAgentActivityRow[] {
  const opts: SummarizeActivityOptions =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions }
      : limitOrOptions ?? {};
  const { limit, windowDays, nowMs } = opts;
  const rows: EventAgentActivityRow[] = [];

  for (const s of input.sends ?? []) {
    const { skill, isTest } = parseAgentSource(s.source);
    if (!skill) continue; // not an event-agent send → drop
    rows.push({
      when: s.at,
      skill,
      channel: s.channel,
      contactLabel: contactLabelFrom(s.contactName, s.toAddress),
      clientLabel: clientLabelFrom(s.clientLabel),
      outcome: "sent",
      ...(isTest ? { detail: "Operator test" } : {}),
      isTest,
    });
  }

  for (const sc of input.scheduled ?? []) {
    const outcome = outcomeForScheduledStatus(sc.status);
    const detail =
      outcome === "blocked"
        ? cleanDetail(sc.lastError) ?? "Blocked"
        : undefined;
    rows.push({
      when: sc.dueAt,
      skill: (sc.agentSkill ?? "").trim(),
      channel: sc.channel,
      contactLabel: contactLabelFrom(sc.contactName, null),
      clientLabel: clientLabelFrom(sc.clientLabel),
      outcome,
      ...(detail ? { detail } : {}),
      // Scheduled-queue rows are never operator tests (those send immediately).
      isTest: false,
    });
  }

  // Optional trailing-window filter (when both windowDays + nowMs are given):
  // drop rows outside [nowMs - windowDays·1d, nowMs] BEFORE sort+limit, so the
  // limit counts only in-window rows. Omit either → no time bound (legacy).
  const windowed =
    typeof windowDays === "number" && typeof nowMs === "number"
      ? rows.filter((r) => withinWindow(r.when, nowMs, windowDays))
      : rows;

  // Stable newest-first: decorate with index, sort by (ms desc, index asc).
  const decorated = windowed.map((row, idx) => ({ row, idx }));
  decorated.sort((a, b) => {
    const dm = ms(b.row.when) - ms(a.row.when);
    if (dm !== 0) return dm;
    return a.idx - b.idx;
  });

  const sorted = decorated.map((d) => d.row);
  if (typeof limit === "number" && limit > 0 && sorted.length > limit) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

/** Trim a possibly-null detail string to a usable value, or null. Pure. */
function cleanDetail(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}
