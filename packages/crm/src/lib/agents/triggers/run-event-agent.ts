// Unified Agent Model — P1, Task T4: the event-agent orchestrator.
//
// This is the bridge from a fired SeldonEvent (booking.completed / lead.created)
// to an OUTBOUND message. An agent is Trigger × Skill × Channel; the two
// event-triggered agents in P1 are:
//   • Review-requester ← booking.completed  → "leave us a Google review" + link;
//   • Speed-to-lead    ← lead.created        → instant "we got your inquiry" ack.
//
// `runEventAgent` finds the org's agents whose trigger matches THIS event (the
// caller's `findEventAgents` already resolves `blueprint.trigger` via
// resolveAgentTrigger and filters to `{kind:"event", event:<type>}`), runs the
// matching PURE skill (composeReviewRequest / composeSpeedToLead — lib/agents/
// skills) to compose the words, resolves the recipient by channel, applies the
// review one-per-contact throttle, and sends via the INJECTED outbound seam.
//
// PURE-ish + DI'd: every side effect (agent lookup, contact load, throttle
// probe + mark, SMS/email send) is injected as `deps`, so it's unit-tested with
// no Postgres / Twilio / Resend. The production wiring (lib/events/listeners.ts)
// supplies deps backed by the agent_templates query + sendSmsFromApi /
// sendEmailFromApi — the EXACT same outbound seam /automations uses.
//
// NEVER throws — it runs inside a SeldonEventBus handler (Promise.allSettled),
// and a misbehaving agent must never break the booking/lead flow or sibling
// listeners. Every failure is swallowed and surfaced only in the returned
// summary (and via console.warn for the failing branch).
//
// No "use server", no top-level I/O imports — safe from a route handler, an
// action, the runtime, or a test.

import { composeReviewRequest } from "@/lib/agents/skills/review-requester";
import { composeSpeedToLead } from "@/lib/agents/skills/speed-to-lead";

// ─── the event the dispatcher reacts to ──────────────────────────────────────

/** A fired domain event, normalized for the dispatcher. `orgId` and `contactId`
 *  are resolved by the caller (the bus payload carries neither directly — see
 *  lib/events/listeners.ts, which resolves orgId from the resource id). */
export type FiredEvent = {
  /** The SeldonEvent slug, e.g. "booking.completed" / "lead.created". */
  type: string;
  orgId: string;
  /** The contact to reach. null → nothing to send to (skip). */
  contactId: string | null;
  /** The raw event data (passed through for future skills; unused by P1). */
  payload: Record<string, unknown>;
};

// ─── what `findEventAgents` returns (one per matching agent) ──────────────────

/** The skill an event-agent runs. The slug doubles as the throttle key, so a
 *  contact is throttled per-skill (review one-per-contact; speed-to-lead never). */
export type EventAgentSkill = "review-requester" | "speed-to-lead";

/** A matched event-agent, already resolved by the caller: the skill to run, the
 *  channel to send on, the persona's businessName, and (review only) the review
 *  URL pulled from the client's business info / GBP link. */
export type EventAgentMatch = {
  skill: EventAgentSkill;
  channel: "sms" | "email";
  businessName?: string | null;
  /** Review-requester only: the Google review URL. Absent/blank → graceful skip
   *  (the ask is worthless without a link). */
  reviewUrl?: string | null;
  /** Speed-to-lead only: a one-line summary of what the lead asked about. */
  leadSummary?: string | null;
};

/** The contact's reachable fields (resolved from contactId by the caller). */
export type EventContact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

// ─── injected side-effects ────────────────────────────────────────────────────

export type RunEventAgentDeps = {
  /** Agents for this org whose trigger matches `eventType`. The caller resolves
   *  `blueprint.trigger` (resolveAgentTrigger) and returns only the matches. */
  findEventAgents: (orgId: string, eventType: string) => Promise<EventAgentMatch[]>;
  /** Resolve the event's contact to name/phone/email, or null if unknown. */
  loadContact: (orgId: string, contactId: string) => Promise<EventContact | null>;
  /** Review throttle probe: has this contact already been asked (this skill)?
   *  Only consulted for one-per-contact skills (review-requester). */
  hasAlreadyRequested: (
    orgId: string,
    contactId: string,
    skill: EventAgentSkill,
  ) => Promise<boolean>;
  /** Record that this contact was asked, so a later event is throttled. Only
   *  called for one-per-contact skills, after a successful send. */
  markRequested: (
    orgId: string,
    contactId: string,
    skill: EventAgentSkill,
  ) => Promise<void>;
  /** Send an SMS via the existing outbound seam (sendSmsFromApi). `skill` lets
   *  the production impl tag the row (metadata.source) for the throttle probe. */
  sendSms: (args: {
    orgId: string;
    contactId: string | null;
    toNumber: string;
    body: string;
    skill: EventAgentSkill;
  }) => Promise<void>;
  /** Send an email via the existing outbound seam (sendEmailFromApi). `skill`
   *  lets the production impl tag the row (metadata.source) for the throttle. */
  sendEmail: (args: {
    orgId: string;
    contactId: string | null;
    toEmail: string;
    subject: string;
    body: string;
    skill: EventAgentSkill;
  }) => Promise<void>;
};

// ─── result summary (for logging / tests — runEventAgent never throws) ────────

export type RunEventAgentResult = {
  /** How many agents matched the event. */
  matched: number;
  /** How many messages were actually sent. */
  sent: number;
  /** How many were skipped (no recipient / no review URL / no contact). */
  skipped: number;
  /** How many were blocked by the review one-per-contact throttle. */
  throttled: number;
  /** How many failed at send time (swallowed; surfaced here for observability). */
  failed: number;
};

/** Skills that fire at most once per contact (the review ask). Speed-to-lead is
 *  intentionally NOT here — every lead deserves an instant reply. */
const ONE_PER_CONTACT: ReadonlySet<EventAgentSkill> = new Set(["review-requester"]);

/** Trim a possibly-null/blank string to a usable value, or null. */
function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Dispatch a fired event to its matching event-agents. NEVER throws.
 *
 * For each matched agent: compose via the pure skill → resolve the recipient
 * for the channel → (review) throttle one-per-contact → send via the injected
 * seam → (review) mark sent. A failure in any one agent is swallowed and
 * recorded; sibling agents still run.
 */
export async function runEventAgent(
  event: FiredEvent,
  deps: RunEventAgentDeps,
): Promise<RunEventAgentResult> {
  const result: RunEventAgentResult = {
    matched: 0,
    sent: 0,
    skipped: 0,
    throttled: 0,
    failed: 0,
  };

  // No contact → nothing to reach. (The skills are all 1:1 outbound to the
  // event's contact.) Bail before even querying agents.
  const contactId = clean(event.contactId);
  if (!contactId) {
    return result;
  }

  let agents: EventAgentMatch[];
  try {
    agents = await deps.findEventAgents(event.orgId, event.type);
  } catch (err) {
    console.warn(
      `[run-event-agent] findEventAgents failed for ${event.type}:`,
      err instanceof Error ? err.message : String(err),
    );
    return result;
  }

  result.matched = agents.length;
  if (agents.length === 0) {
    return result;
  }

  // Load the contact once — every matched agent reaches the same contact.
  let contact: EventContact | null;
  try {
    contact = await deps.loadContact(event.orgId, contactId);
  } catch (err) {
    console.warn(
      `[run-event-agent] loadContact failed for ${contactId}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Treat every matched agent as skipped — we can't reach the contact.
    result.skipped = agents.length;
    return result;
  }

  if (!contact) {
    result.skipped = agents.length;
    return result;
  }

  for (const agent of agents) {
    try {
      await runOneAgent(event, agent, contactId, contact, deps, result);
    } catch (err) {
      // Belt-and-suspenders: runOneAgent already guards its send, but a
      // compose/throttle bug must never break sibling agents.
      result.failed += 1;
      console.warn(
        `[run-event-agent] agent ${agent.skill} failed for ${event.type}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return result;
}

/** Run a single matched agent. Mutates `result` with the outcome. */
async function runOneAgent(
  event: FiredEvent,
  agent: EventAgentMatch,
  contactId: string,
  contact: EventContact,
  deps: RunEventAgentDeps,
  result: RunEventAgentResult,
): Promise<void> {
  const contactName = clean(contact.name);
  const businessName = clean(agent.businessName);

  // 1. Compose the message via the matching PURE skill. A review with no URL
  //    can't be composed meaningfully → skip BEFORE touching the throttle/send.
  let composed: { subject?: string; body: string };
  if (agent.skill === "review-requester") {
    const reviewUrl = clean(agent.reviewUrl);
    if (!reviewUrl) {
      // No review link → the ask is worthless. Skip gracefully.
      result.skipped += 1;
      return;
    }
    composed = composeReviewRequest({
      contactName,
      businessName,
      reviewUrl,
      channel: agent.channel,
    });
  } else {
    composed = composeSpeedToLead({
      contactName,
      businessName,
      channel: agent.channel,
      leadSummary: clean(agent.leadSummary),
    });
  }

  // 2. Resolve the recipient for this channel. No address → skip (can't send).
  const toAddress =
    agent.channel === "sms" ? clean(contact.phone) : clean(contact.email);
  if (!toAddress) {
    result.skipped += 1;
    return;
  }

  // 3. Throttle: one-per-contact skills (review) never double-send. Probe the
  //    injected check; speed-to-lead skips this entirely (every lead replies).
  const throttled = ONE_PER_CONTACT.has(agent.skill);
  if (throttled) {
    let already = false;
    try {
      already = await deps.hasAlreadyRequested(event.orgId, contactId, agent.skill);
    } catch (err) {
      // If the probe fails, prefer NOT to spam: treat as already-sent.
      console.warn(
        `[run-event-agent] hasAlreadyRequested failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
      already = true;
    }
    if (already) {
      result.throttled += 1;
      return;
    }
  }

  // 4. Send via the injected outbound seam (sendSmsFromApi / sendEmailFromApi).
  try {
    if (agent.channel === "sms") {
      await deps.sendSms({
        orgId: event.orgId,
        contactId,
        toNumber: toAddress,
        body: composed.body,
        skill: agent.skill,
      });
    } else {
      await deps.sendEmail({
        orgId: event.orgId,
        contactId,
        toEmail: toAddress,
        subject: composed.subject ?? "",
        body: composed.body,
        skill: agent.skill,
      });
    }
  } catch (err) {
    result.failed += 1;
    console.warn(
      `[run-event-agent] send (${agent.channel}) failed for ${agent.skill}:`,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  result.sent += 1;

  // 5. Mark sent so a later identical event is throttled. Best-effort — a
  //    failed mark just means the throttle might not catch the next one (we
  //    already sent, so under-throttling is the safe failure direction).
  if (throttled) {
    try {
      await deps.markRequested(event.orgId, contactId, agent.skill);
    } catch (err) {
      console.warn(
        `[run-event-agent] markRequested failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
