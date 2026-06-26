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
// resolveAgentTrigger and filters to `{kind:"event", event:<type>}`), RECALLS
// what the agent already did for this contact (loop-memory — generalizes the
// bespoke review throttle into `hasDone(entries, "review_requested")`), runs the
// matching PURE skill (composeReviewRequest / composeSpeedToLead — lib/agents/
// skills) to compose the words, resolves the recipient by channel, applies the
// review one-per-contact throttle, sends via the INJECTED outbound seam, then
// RECORDS what it did back into loop-memory.
//
// Loop-memory (State) is OPTIONAL + DI'd via `deps.memoryStore`. Absent → the
// agent behaves exactly as before (recall = `[]`, no record); present (prod =
// makeBrainMemoryStoreForOrg) → memory is keyed `{agentKey: skill, subjectKey:
// contactId}` and every memory call is guarded so it can never break a send.
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
import {
  recallAgentMemory,
  recordAgentMemory,
  hasDone,
  type AgentMemoryStore,
  type AgentMemoryEntry,
} from "@/lib/agents/memory/agent-memory";
// 2026-06-26 — Agent Loop L2 Verify (maker ≠ checker gate), T3. Before sending,
// the composed message body is run through the VERIFY rubric (the agent never
// grades its own homework): the deterministic checks (review link present,
// contact name, length, no leftover {placeholder}) are the always-on gate, and
// an optional async Checker (LLM/evals) is AND-ed in via `deps.checker`. A fail
// BLOCKS the send + records a `verify_blocked` loop-memory entry. The rubric is
// the agent's own `blueprint.verify` (projected onto the match as `verify`) or,
// if absent, the per-skill default from defaultRubricForSkill.
import { verifyOutput, type Checker, type VerifyRubric } from "@/lib/agents/verify/agent-verify";
import { defaultRubricForSkill } from "@/lib/agents/verify/default-rubrics";

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
  /** The agent's own VERIFY rubric, projected from `blueprint.verify` by the
   *  caller (buildRunEventAgentDeps). When present it OVERRIDES the per-skill
   *  default rubric; absent → the gate falls back to defaultRubricForSkill. */
  verify?: VerifyRubric | null;
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
  /** Optional agent loop-memory (State). When present, the agent RECALLS what it
   *  did for this contact before composing (generalizing the review throttle into
   *  `hasDone(entries, "review_requested")`) and RECORDS an entry after a
   *  successful send. Absent → behave exactly as before (recall = `[]`, no record),
   *  so the legacy `hasAlreadyRequested`/`markRequested` path is the only gate.
   *  Production wires `makeBrainMemoryStoreForOrg(orgId)` (Brain v2-backed). */
  memoryStore?: AgentMemoryStore;
  /** Optional clock for stamping `entry.at` (ISO). Omitted → the recorded entry
   *  carries no `at`. DI'd so tests can pin a deterministic timestamp. */
  now?: () => Date;
  /** Optional async VERIFY checker (LLM/`run_agent_evals` judge), AND-ed with the
   *  always-on deterministic rubric checks in `verifyOutput`. Omitted (production
   *  default for now → the LLM checker is T4) → the deterministic gate is the only
   *  layer. A checker that throws fails CLOSED (blocks), per verifyOutput. */
  checker?: Checker;
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
  /** How many were BLOCKED by the verify gate (the composed body failed its
   *  rubric — e.g. the review link or contact name was missing, or an injected
   *  checker rejected it). A blocked message is NOT sent; the reason is recorded
   *  to loop-memory (`verify_blocked`) for observability. */
  blocked: number;
  /** How many failed at send time (swallowed; surfaced here for observability). */
  failed: number;
  /**
   * The agent's loop-memory for THIS run, surfaced so callers/logs can OBSERVE
   * what each acting agent remembered and wrote — the "RunContext as loop-memory"
   * piece. There is no workflow_runs row for the event-agent path (that's the
   * archetype dispatcher), so this return summary + the Brain note are the
   * observable record; `/runs` surfacing is a future follow-up.
   *
   * Present ONLY when a `deps.memoryStore` is wired (production =
   * makeBrainMemoryStoreForOrg). Absent → no store, so there was nothing to
   * recall/record (legacy behavior). Additive + optional: other run types and
   * the existing `/runs` render are unaffected.
   *
   * Aggregated across every matched agent in the run:
   *   • `recalled` — the union of entries each acting agent recalled BEFORE
   *     composing (its prior interaction history for the event's contact);
   *   • `recorded` — every entry this run appended AFTER a successful send
   *     (e.g. `review_requested` / `lead_contacted`).
   */
  memory?: {
    recalled: AgentMemoryEntry[];
    recorded: AgentMemoryEntry[];
  };
};

/** Skills that fire at most once per contact (the review ask). Speed-to-lead is
 *  intentionally NOT here — every lead deserves an instant reply. */
const ONE_PER_CONTACT: ReadonlySet<EventAgentSkill> = new Set(["review-requester"]);

/** The loop-memory `kind` each skill records after a successful send (and, for
 *  one-per-contact skills, the `hasDone` tag the recall gates on). Stable tags —
 *  they're the durable contract written into the org's Brain, not the skill slug. */
const MEMORY_KIND: Record<EventAgentSkill, string> = {
  "review-requester": "review_requested",
  "speed-to-lead": "lead_contacted",
};

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
 * for the channel → (review) throttle one-per-contact → VERIFY the composed body
 * against the rubric (block on fail) → send via the injected seam → (review)
 * mark sent. A failure in any one agent is swallowed and recorded; sibling
 * agents still run.
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
    blocked: 0,
    failed: 0,
    // Only carry a memory summary when a store is wired (so a no-store run
    // leaves `memory` absent — there was nothing to recall/record). runOneAgent
    // pushes the recalled/recorded entries into these arrays as it acts.
    ...(deps.memoryStore ? { memory: { recalled: [], recorded: [] } } : {}),
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

  // 0. Loop-memory keys. agentKey = the skill (the stable id already in scope —
  //    EventAgentMatch carries no templateId; the skill slug is what memoryKey
  //    namespaces under `agents/<agentKey>/…`). subjectKey = the contact.
  const agentKey = agent.skill;
  const subjectKey = contactId;
  const memoryKind = MEMORY_KIND[agent.skill];

  // Recall what this agent has done for this contact BEFORE composing. No store
  // in deps → treat as no memory (`[]`), preserving today's behavior. recall
  // never throws, but guard anyway so memory can never break the agent.
  let recalled: Awaited<ReturnType<typeof recallAgentMemory>> = [];
  if (deps.memoryStore) {
    try {
      recalled = await recallAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey,
      });
    } catch (err) {
      console.warn(
        `[run-event-agent] recallAgentMemory failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
      recalled = [];
    }
    // Surface what this agent recalled on the run summary (observability). Guard
    // against a misbehaving recall returning a non-array.
    if (result.memory && Array.isArray(recalled)) {
      result.memory.recalled.push(...recalled);
    }
  }

  // 1. Compose the message via the matching PURE skill. A review with no URL
  //    can't be composed meaningfully → skip BEFORE touching the throttle/send.
  //    `reviewUrl` is hoisted so the verify gate (step 3b) can feed it into the
  //    default rubric's `must_include` (review link) check.
  let composed: { subject?: string; body: string };
  let reviewUrl: string | null = null;
  if (agent.skill === "review-requester") {
    reviewUrl = clean(agent.reviewUrl);
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

  // 3. Throttle: one-per-contact skills (review) never double-send. The gate now
  //    has TWO sources (throttle if EITHER says already-done):
  //      (a) loop-memory — `hasDone(recalled, kind)`: the agent recalls it
  //          already recorded this action for this contact. This is the PRIMARY
  //          gate (generalizes the bespoke probe into a memory recall);
  //      (b) the legacy `hasAlreadyRequested` probe (belt-and-suspenders — the
  //          metadata.source tag on a prior send, for memory written before this
  //          loop-memory existed / if the store is unavailable).
  //    Speed-to-lead skips this entirely (every lead replies).
  const throttled = ONE_PER_CONTACT.has(agent.skill);
  if (throttled) {
    // (a) loop-memory recall. Soft-fail to "no memory" — recall never throws, but
    //     guard the whole block so a missing/odd store can't gate or break us.
    let memorySaysDone = false;
    if (recalled.length > 0) {
      try {
        memorySaysDone = hasDone(recalled, memoryKind);
      } catch {
        memorySaysDone = false;
      }
    }

    // (b) the legacy probe. If IT fails, prefer NOT to spam: treat as already-sent.
    let probeSaysDone = false;
    try {
      probeSaysDone = await deps.hasAlreadyRequested(event.orgId, contactId, agent.skill);
    } catch (err) {
      console.warn(
        `[run-event-agent] hasAlreadyRequested failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
      probeSaysDone = true;
    }

    if (memorySaysDone || probeSaysDone) {
      result.throttled += 1;
      return;
    }
  }

  // 3b. VERIFY (maker ≠ checker): gate the composed body BEFORE sending so a
  //     broken message (missing the review link / the contact's name, over
  //     length, a leftover {placeholder}, or rejected by an injected checker) is
  //     BLOCKED instead of going out wrong. We verify `composed.body` — the
  //     text/markdown BODY for both channels (NOT the email subject), which is
  //     what the rubric's link/name/length checks target.
  //
  //     Rubric source: the agent's own `blueprint.verify` (projected onto the
  //     match as `verify`) OVERRIDES; else the per-skill default. `null` (an
  //     unknown skill with no blueprint rubric) → NO gate, send as today
  //     (back-compat). The deterministic checks are always on; `deps.checker`
  //     (the LLM/evals judge — T4, undefined in prod for now) is AND-ed in.
  //     verifyOutput never throws (a checker that throws fails CLOSED), but the
  //     whole block is guarded so verify can never crash the handler.
  const rubric: VerifyRubric | null =
    agent.verify ??
    defaultRubricForSkill(agent.skill, { reviewUrl, contactName, channel: agent.channel });
  if (rubric) {
    let verdict: Awaited<ReturnType<typeof verifyOutput>>;
    try {
      verdict = await verifyOutput(composed.body, rubric, deps.checker);
    } catch (err) {
      // verifyOutput already fails closed, but guard anyway: a verify error must
      // never crash the agent. Treat an unexpected throw as a BLOCK (fail closed
      // — don't send something we couldn't verify).
      console.warn(
        `[run-event-agent] verifyOutput threw for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
      verdict = {
        pass: false,
        results: [],
        failures: [err instanceof Error ? err.message : "verify_error"],
      };
    }

    if (!verdict.pass) {
      // BLOCKED — do NOT send. Count it, and record WHY to loop-memory (so the
      // agent "remembers" it failed and an operator can see the reason) +
      // surface it on the run summary's recorded list. Best-effort + guarded.
      result.blocked += 1;
      const failures = Array.isArray(verdict.failures) ? verdict.failures : [];
      console.warn(
        JSON.stringify({
          action: "event_agent.verify_blocked",
          orgId: event.orgId,
          skill: agent.skill,
          channel: agent.channel,
          contactId,
          failures,
        }),
      );
      if (deps.memoryStore) {
        const at = deps.now ? deps.now().toISOString() : undefined;
        const blockedEntry: AgentMemoryEntry = {
          ...(at ? { at } : {}),
          kind: "verify_blocked",
          summary: `Blocked ${agent.skill} to ${contactName ?? "contact"}: ${failures.join("; ")}`,
          data: { failures, channel: agent.channel },
        };
        try {
          await recordAgentMemory(deps.memoryStore, {
            orgId: event.orgId,
            agentKey,
            subjectKey,
            entry: blockedEntry,
          });
        } catch (err) {
          console.warn(
            `[run-event-agent] recordAgentMemory (verify_blocked) failed for ${agent.skill}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        if (result.memory) {
          result.memory.recorded.push(blockedEntry);
        }
      }
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

  // 5. Record the action into loop-memory so a later run recalls it (and the
  //    review throttle's `hasDone` gate catches the next event). For ALL skills:
  //    review records "review_requested", speed-to-lead records "lead_contacted"
  //    (so /runs and future runs see the full interaction history). Best-effort —
  //    recordAgentMemory never throws, but guard the whole block so a misbehaving
  //    store can never break a send we already completed.
  if (deps.memoryStore) {
    const at = deps.now ? deps.now().toISOString() : undefined;
    const entry: AgentMemoryEntry = {
      ...(at ? { at } : {}),
      kind: memoryKind,
      summary: `Sent ${agent.skill} via ${agent.channel} to ${
        contactName ?? "contact"
      }`,
      data: { channel: agent.channel },
    };
    try {
      await recordAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey,
        entry,
      });
    } catch (err) {
      console.warn(
        `[run-event-agent] recordAgentMemory failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    // Surface what this agent recorded on the run summary (observability). We add
    // it after the record attempt; recordAgentMemory is best-effort + never
    // throws, and the entry IS what we asked the store to persist either way.
    if (result.memory) {
      result.memory.recorded.push(entry);
    }
  }

  // 6. Legacy mark so a later identical event is throttled (belt-and-suspenders
  //    alongside the memory record above). Best-effort — a failed mark just means
  //    the throttle might not catch the next one (we already sent, so
  //    under-throttling is the safe failure direction).
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
