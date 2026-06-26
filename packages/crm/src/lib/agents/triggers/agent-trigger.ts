// Unified Agent Model — P1, Task T1: the Trigger model.
//
// An agent is Trigger × Skill × Channel. Today the builder only models the
// `surface: voice | chat` axis — which is just ONE point in this space
// (kind:"inbound"). This module owns the `AgentTrigger` union, the back-compat
// shim from `surface`, a defensive resolver, and a human label for chips.
//
// PURE — no I/O, no "use server", no imports. It is safe to call from a Server
// Component, a Server Action, a route handler, the runtime, or a test. The
// resolver NEVER throws and NEVER returns a malformed trigger: any bad shape
// clamps to the inbound default so an existing row (or a hand-edited blueprint)
// keeps today's behavior byte-for-byte.

// ─── the union ───────────────────────────────────────────────────────────────

export type InboundChannel = "voice" | "chat" | "email" | "sms";
export type EventChannel = "sms" | "email";
export type ScheduleChannel = "email" | "digest";

export type AgentTrigger =
  /** A call / chat / email / SMS arrives — the receptionist case. */
  | { kind: "inbound"; channel: InboundChannel }
  /** A domain event fires (SeldonEvent), e.g. "booking.completed" → outbound. */
  | { kind: "event"; event: string; channel: EventChannel }
  /** A cron cadence fires, e.g. weekly Monday 8am → emails the operator. */
  | { kind: "schedule"; cron: string; channel: ScheduleChannel };

// ─── known event triggers (for the builder's "Something happens" picker) ─────

/** The SeldonFrame domain events an agent can subscribe to. `value` is the
 *  event slug (matches the SeldonEvent type); `label` is operator-facing. */
export const KNOWN_EVENTS: { value: string; label: string }[] = [
  { value: "booking.completed", label: "After a booking is completed" },
  { value: "lead.created", label: "When a new lead arrives" },
  { value: "invoice.paid", label: "When an invoice is paid" },
  { value: "missed_call", label: "After a missed call" },
];

/** Short, chip-friendly text for a known event slug (distinct from the longer
 *  builder-picker label in KNOWN_EVENTS). */
const EVENT_CHIP_TEXT: Record<string, string> = {
  "booking.completed": "After booking",
  "lead.created": "New lead",
  "invoice.paid": "Invoice paid",
  missed_call: "Missed call",
};

// ─── valid channels per kind (the clamp table) ───────────────────────────────

const INBOUND_CHANNELS: readonly InboundChannel[] = ["voice", "chat", "email", "sms"];
const EVENT_CHANNELS: readonly EventChannel[] = ["sms", "email"];
const SCHEDULE_CHANNELS: readonly ScheduleChannel[] = ["email", "digest"];

/** The safe default every bad shape falls back to: an inbound voice agent —
 *  exactly what an unset `surface` resolved to before this model existed. */
const DEFAULT_INBOUND: AgentTrigger = { kind: "inbound", channel: "voice" };

// ─── surface → trigger (back-compat) ─────────────────────────────────────────

/** Map the legacy `surface` string to a trigger. A known surface
 *  (voice|chat|email|sms) → `{ kind:"inbound", channel:<that> }`; anything
 *  unknown / empty / null → the inbound voice default. Case/whitespace tolerant. */
export function triggerFromSurface(surface: string | null | undefined): AgentTrigger {
  const channel = normalizeChannel(surface, INBOUND_CHANNELS);
  return channel ? { kind: "inbound", channel } : { ...DEFAULT_INBOUND };
}

// ─── resolve (stored ?? surface, validated/clamped) ──────────────────────────

/** Resolve the effective trigger for an agent. If `stored` is a well-formed
 *  AgentTrigger, return it normalized (lower-cased channel/kind). Otherwise —
 *  missing, partial, wrong kind, or a channel that isn't valid FOR that kind —
 *  fall back to `triggerFromSurface(surface)` (the inbound default). Never throws.
 *
 *  Pinned rule for a channel that's invalid for its kind (e.g. event+voice):
 *  we do NOT repair it — we fall back to the surface/inbound default, because a
 *  stored channel that the kind can't speak signals a corrupt/stale blueprint,
 *  and the inbound default is the one always-safe behavior. */
export function resolveAgentTrigger(
  stored: Partial<AgentTrigger> | null | undefined,
  surface?: string | null,
): AgentTrigger {
  const fallback = triggerFromSurface(surface);
  const valid = parseTrigger(stored);
  return valid ?? fallback;
}

/** Strictly parse an unknown value into a valid AgentTrigger, or null. */
function parseTrigger(value: unknown): AgentTrigger | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const kind = typeof v.kind === "string" ? v.kind.trim().toLowerCase() : "";

  if (kind === "inbound") {
    const channel = normalizeChannel(v.channel, INBOUND_CHANNELS);
    return channel ? { kind: "inbound", channel } : null;
  }

  if (kind === "event") {
    const channel = normalizeChannel(v.channel, EVENT_CHANNELS);
    const event = typeof v.event === "string" ? v.event.trim() : "";
    return channel && event ? { kind: "event", event, channel } : null;
  }

  if (kind === "schedule") {
    const channel = normalizeChannel(v.channel, SCHEDULE_CHANNELS);
    const cron = typeof v.cron === "string" ? v.cron.trim() : "";
    return channel && cron ? { kind: "schedule", cron, channel } : null;
  }

  return null;
}

/** Lower-case + trim a candidate channel and confirm it's in the allowed set
 *  for the kind. Returns the typed channel or null. */
function normalizeChannel<T extends string>(
  candidate: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof candidate !== "string") return null;
  const c = candidate.trim().toLowerCase();
  return (allowed as readonly string[]).includes(c) ? (c as T) : null;
}

// ─── label (for agents-list chips) ───────────────────────────────────────────

/** A short, human label for an agent's trigger, used as a chip on the agents
 *  list. Examples:
 *    inbound  → "Inbound · Voice"
 *    event    → "After booking · SMS" (known) / "Deal won · SMS" (prettified slug)
 *    schedule → "Weekly · EMAIL" (cadence hint when cheap) / "Scheduled · DIGEST" */
export function triggerLabel(t: AgentTrigger): string {
  switch (t.kind) {
    case "inbound":
      return `Inbound · ${titleCase(t.channel)}`;
    case "event": {
      const text = EVENT_CHIP_TEXT[t.event] ?? prettifyEventSlug(t.event);
      return `${text} · ${t.channel.toUpperCase()}`;
    }
    case "schedule": {
      const cadence = cadenceHint(t.cron) ?? "Scheduled";
      return `${cadence} · ${t.channel.toUpperCase()}`;
    }
  }
}

/** "voice" → "Voice"; "web chat" → "Web Chat". */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Turn an unknown event slug into readable text: "deal.won" → "Deal won",
 *  "invoice_overdue" → "Invoice overdue". First word capitalized, rest lower. */
function prettifyEventSlug(slug: string): string {
  const words = slug
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) return "Event";
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

/** Cheaply derive a cadence word from a few common cron shapes. Returns null
 *  (→ caller uses "Scheduled") for anything not trivially recognizable — we
 *  don't ship a cron parser here, just a hint for the obvious cases. */
function cadenceHint(cron: string): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length < 5) return null;
  const [min, hour, dom, , dow] = fields;
  // A field is "fixed" if it's a single literal number (no */,- ranges).
  const fixed = (f: string) => /^\d+$/.test(f);
  const wild = (f: string) => f === "*";
  // Daily: fixed minute+hour, wildcard day-of-month, wildcard day-of-week.
  if (fixed(min) && fixed(hour) && wild(dom) && wild(dow)) return "Daily";
  // Weekly: fixed minute+hour, wildcard day-of-month, a fixed day-of-week.
  if (fixed(min) && fixed(hour) && wild(dom) && fixed(dow)) return "Weekly";
  // Monthly: fixed minute+hour, a fixed day-of-month, wildcard day-of-week.
  if (fixed(min) && fixed(hour) && fixed(dom) && wild(dow)) return "Monthly";
  return null;
}
