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
// 2026-06-26 — Agent Loop L3 Guardrails/Stop, T3. After the per-contact throttle
// and BEFORE the L2 verify gate, the prospective send is run through the agent's
// GUARDRAILS (the per-agent brakes: kill switch, quiet hours, frequency cap, daily
// budget) via the pure evaluateGuardrails. A tripped brake BLOCKS the send and
// records a `guardrail_blocked` loop-memory entry. The rubric source is the agent's
// own `blueprint.guardrails` (projected onto the match as `guardrails`) or, if
// absent, the per-skill default from defaultGuardrailsForSkill. The daily budget
// reads/increments a per-agent daily counter kept in loop-memory keyed by the
// workspace-tz date.
import {
  evaluateGuardrails,
  defaultGuardrailsForSkill,
  type Guardrails,
} from "@/lib/agents/guardrails/agent-guardrails";
// 2026-06-26 — Outbound-UX Bundle F2 (send delay). When the matched agent's
// trigger carries `delayMinutes > 0`, the prospective send is ENQUEUED (a frozen
// event-context row due at now+delay) via the injected enqueue seam instead of
// sending now; the cron consumer replays runEventAgent at due time so the gates
// run THEN. See scheduled-event-agent.ts.
import type {
  EnqueueScheduledEventAgentSend,
  ScheduledEventAgentSend,
} from "./scheduled-event-agent";

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
  /** The agent's own GUARDRAILS (L3 brakes), projected from `blueprint.guardrails`
   *  by the caller (buildRunEventAgentDeps). When present it OVERRIDES the per-skill
   *  default; absent/null → the gate falls back to defaultGuardrailsForSkill. */
  guardrails?: Guardrails | null;
  /** 2026-06-26 — Outbound-UX Bundle F2 (send delay). The agent's configured send
   *  delay in MINUTES, projected from `blueprint.trigger.delayMinutes` by the
   *  caller (already clamped to a non-negative integer via resolveSendDelayMinutes).
   *  0 / absent → send immediately (today's behavior). > 0 → the orchestrator
   *  ENQUEUES a scheduled send (due = now + delayMinutes) via deps.enqueueScheduledSend
   *  INSTEAD of sending now, and the gates run when the cron replays it. If a delay
   *  is set but no enqueue seam is wired, the orchestrator falls back to sending
   *  immediately (a delay must never silently drop the send). */
  delayMinutes?: number | null;
  /** 2026-06-26 — Primitive-Composition generator, P2 (Task 6). TRUE when this
   *  agent ACTS via its tools and sends NO customer message (a poster / logger),
   *  projected from `blueprint.actionOnly` by the caller. This is the SAFETY-
   *  CRITICAL flag: when true the orchestrator SKIPS composing/sending the customer
   *  SMS/email ENTIRELY (a posting agent must never text a customer) — it still
   *  runs the GUARDRAILS gate (so caps apply), records an `action_fired` loop-memory
   *  entry, and surfaces the run on `result.actionOnly`. The LIVE tool execution
   *  (actually invoking Postiz / the bound MCP tool to post) is P2.1 — this fire is
   *  recorded but does NOT yet post. Absent/false → a messaging agent (today's
   *  compose/verify/send path, byte-for-byte). */
  actionOnly?: boolean | null;
  /** 2026-06-26 — Primitive-Composition generator, P2 (Task 6). The IDs of the
   *  external tools bound to this agent, projected from `blueprint.connectors` by
   *  the caller (each binding's `id`). Surfaced ONLY for observability on an
   *  action-only fire — the structured log + result note which tools the fire is
   *  meant to drive (so an unbound poster is visible). Ignored on the messaging
   *  path. Absent/empty → no bound tools (an action-only fire logs "no tools bound",
   *  the operator-facing signal that the agent can't actually post yet). */
  connectorIds?: string[] | null;
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
  /** Optional resolver for the workspace's IANA timezone (organizations.timezone),
   *  used ONLY to compute the date boundary of the GUARDRAILS daily counter (the
   *  budget brake resets at the workspace's local midnight). Omitted / throwing /
   *  returning blank → "UTC". Only consulted when a `memoryStore` is wired (the
   *  daily counter lives in loop-memory); the guardrails' own `quietHours.tz` is
   *  unaffected by this. DI'd so a test can pin the date without a DB. */
  resolveTimezone?: (orgId: string) => Promise<string> | string;
  /** 2026-06-26 — Outbound-UX Bundle F2 (send delay). Durably persist a deferred
   *  send (the frozen event context) for the cron to replay at its `dueAt`. Only
   *  called when a matched agent's `delayMinutes > 0`. Absent → no scheduling is
   *  possible, so a delayed agent FALLS BACK to sending immediately (a configured
   *  delay must never silently drop a send when the queue isn't wired). Production
   *  wires a row insert (see buildRunEventAgentDeps); tests inject a recording
   *  fake. The replay (cron) re-runs runEventAgent, so the gates run at send time. */
  enqueueScheduledSend?: EnqueueScheduledEventAgentSend;
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
  /** 2026-06-26 — Outbound-UX Bundle F2: how many sends were ENQUEUED for a later
   *  due time (the matched agent's `delayMinutes > 0`) instead of sent now. The
   *  gates (throttle/guardrails/verify/memory) run when the cron replays them, so
   *  an enqueued send is counted here, NOT in `sent`/`throttled`/`blocked`. */
  scheduled: number;
  /** How many were BLOCKED before send — by EITHER the L3 GUARDRAILS gate (a
   *  tripped brake: agent disabled / quiet hours / frequency cap / daily cap) OR
   *  the L2 verify gate (the composed body failed its rubric — e.g. the review
   *  link or contact name was missing, or an injected checker rejected it). A
   *  blocked message is NOT sent; the reason is recorded to loop-memory
   *  (`guardrail_blocked` / `verify_blocked` respectively) for observability. The
   *  guardrail gate runs FIRST (after the throttle, before verify), so a
   *  guardrail-blocked send never reaches verify. An action-only agent blocked by
   *  its guardrails (e.g. a daily cap) is also counted here. */
  blocked: number;
  /** 2026-06-26 — Primitive-Composition generator, P2 (Task 6): how many matched
   *  agents were ACTION-ONLY fires (`blueprint.actionOnly`) — a poster/logger that
   *  ran its guardrails + was RECORDED (loop-memory `action_fired`) but sent NO
   *  customer message. The LIVE tool execution (actually posting via the bound
   *  tools) is P2.1 — these agents fire + are recorded but do NOT yet post. An
   *  action-only fire is counted here, NOT in `sent` (nothing was sent to a
   *  customer); a guardrail-blocked action-only agent is counted in `blocked`, not
   *  here (it never fired). */
  actionOnly: number;
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

// ─── L3 Guardrails (daily counter) helpers ────────────────────────────────────

/** The loop-memory `kind` of the per-agent daily-send counter entry. */
const DAILY_COUNT_KIND = "daily_count";

/**
 * The `YYYY-MM-DD` date of `now` in IANA `tz`, or the UTC date if `tz` is invalid
 * (Intl throws on an unknown zone). Never throws. This is the boundary the daily
 * budget brake resets on — a workspace's local midnight.
 */
function dateKeyInTz(now: Date, tz: string): string {
  try {
    // en-CA renders ISO-style YYYY-MM-DD, which is exactly the key we want.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // Invalid tz → fall back to the UTC date (never throw the gate).
    return now.toISOString().slice(0, 10);
  }
}

/** The loop-memory subjectKey for an agent's daily counter on a given tz-date.
 *  `memoryKey` sanitizes the "/" to "-", yielding `agents/<agentKey>/_stats-<date>`. */
function dailyStatsSubjectKey(dateKey: string): string {
  return `_stats/${dateKey}`;
}

/**
 * The largest `count` recorded among an agent's daily-counter entries (0 if none).
 * The backing store is append-only (every increment appends a fresh
 * `{kind:"daily_count", data:{count}}` entry), so the CURRENT total is the MAX
 * count seen — robust to ordering and to multiple appends in one day. Never throws.
 */
function maxDailyCount(entries: AgentMemoryEntry[]): number {
  let max = 0;
  for (const e of entries) {
    if (e.kind !== DAILY_COUNT_KIND) continue;
    const c = (e.data as { count?: unknown } | undefined)?.count;
    if (typeof c === "number" && Number.isFinite(c) && c > max) max = c;
  }
  return max;
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
    scheduled: 0,
    blocked: 0,
    actionOnly: 0,
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

  // F2 (send delay): if this agent is configured to DEFER its send and an enqueue
  // seam is wired, queue the frozen event context (due = now + delayMinutes) and
  // RETURN — do NOT run the throttle/guardrails/verify/send here. Those gates run
  // when the cron replays runEventAgent at the due time (current contact state,
  // current guardrails, current memory — the most-correct behavior). This branch
  // runs FIRST so a deferred agent never composes/sends synchronously.
  //
  // Fallbacks that keep a configured delay from ever silently dropping a send:
  //   • no enqueue seam wired (deps.enqueueScheduledSend absent) → fall through to
  //     the immediate path (send now);
  //   • the enqueue THROWS → swallow it, count `failed`, and DO NOT also send now
  //     (a double "queue-then-also-send-immediately" would defeat the delay; the
  //     failure is surfaced on the summary so the cron/operator can see it).
  const delayMinutes =
    typeof agent.delayMinutes === "number" && Number.isFinite(agent.delayMinutes)
      ? Math.max(0, Math.floor(agent.delayMinutes))
      : 0;
  if (delayMinutes > 0 && deps.enqueueScheduledSend) {
    const enqueueNow = deps.now?.() ?? new Date();
    const dueAt = new Date(enqueueNow.getTime() + delayMinutes * 60_000);
    const send: ScheduledEventAgentSend = {
      eventType: event.type,
      orgId: event.orgId,
      contactId,
      payload: event.payload ?? {},
      dueAt,
      agentSkill: agent.skill,
      channel: agent.channel,
    };
    try {
      await deps.enqueueScheduledSend(send);
      result.scheduled += 1;
    } catch (err) {
      result.failed += 1;
      console.warn(
        `[run-event-agent] enqueueScheduledSend failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    return;
  }

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

  // 0a. ACTION-ONLY branch (P2 / Task 6). When the agent is a poster/logger
  //     (`blueprint.actionOnly`), it sends NO customer message — it does its tool
  //     work and records. This is the SAFETY-CRITICAL guard: a posting agent must
  //     NEVER text/email a customer when it fires. So we branch HERE — after the
  //     recall (which the guardrail gate needs) but BEFORE compose/recipient/verify/
  //     send — into a self-contained handler that runs ONLY the guardrails gate
  //     (caps still apply) + records the fire. The entire messaging path below is
  //     left untouched (byte-for-byte) for non-action-only agents.
  if (agent.actionOnly === true) {
    await runActionOnlyAgent(event, agent, agentKey, recalled, deps, result);
    return;
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

  // 3a. GUARDRAILS (L3 brakes): after the per-contact throttle and BEFORE the L2
  //     verify gate, run the prospective send through the agent's guardrails —
  //     the per-agent brakes that stop it from "billing you in silence":
  //       • kill switch (enabled:false), • quiet hours (no late-night sends),
  //       • per-contact frequency cap, • daily send budget.
  //     The rubric source is the agent's own `blueprint.guardrails` (projected as
  //     `guardrails`) or, if absent, the per-skill default. The decision is PURE
  //     (evaluateGuardrails never throws); we feed it three ctx values:
  //       - `now` (the DI'd clock),
  //       - `lastSentToContactAt` = the most recent SEND we already recalled for
  //         this contact (reusing `recalled` — no second read),
  //       - `sentTodayByAgent` = the per-agent daily counter from loop-memory
  //         (keyed by the workspace-tz date; 0 with no store).
  //     A tripped brake BLOCKS the send (counted on `result.blocked`, with the
  //     reason), records a `guardrail_blocked` loop-memory entry (guarded), and
  //     returns BEFORE verify/send. The whole block is guarded so a guardrail
  //     bug can never crash the handler (fail OPEN — guardrails are a brake, not
  //     a hard dependency: a crash here must not silently drop every send).
  // `now` is hoisted so the same instant bounds BOTH the guardrail decision and
  // the daily-counter date key (and the increment after a successful send).
  const now = deps.now?.() ?? new Date();

  // The daily-counter context is resolved ONCE here (function scope) so the gate
  // can read it AND step 5 can increment the SAME `_stats/<date>` note after a
  // successful send. Only meaningful when a memoryStore is wired (else count = 0,
  // subjectKey = null and the increment is skipped). Never throws.
  let dailyStatsKey: string | null = null;
  let sentTodayByAgent = 0;
  if (deps.memoryStore) {
    // Resolve the workspace tz (organizations.timezone via deps; "UTC" on any
    // failure) to bound the day, then recall the `_stats/<date>` note + take max.
    let tz = "UTC";
    if (deps.resolveTimezone) {
      try {
        const resolved = await deps.resolveTimezone(event.orgId);
        if (typeof resolved === "string" && resolved.trim().length > 0) {
          tz = resolved.trim();
        }
      } catch {
        tz = "UTC";
      }
    }
    dailyStatsKey = dailyStatsSubjectKey(dateKeyInTz(now, tz));
    try {
      const statEntries = await recallAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey: dailyStatsKey,
      });
      sentTodayByAgent = maxDailyCount(statEntries);
    } catch {
      sentTodayByAgent = 0;
    }
  }

  const guardrails = agent.guardrails ?? defaultGuardrailsForSkill(agent.skill);
  if (guardrails) {
    // lastSentToContactAt — the max `at` among the contact's already-recalled
    // SEND entries (review_requested / lead_contacted). Reuse `recalled`; skip a
    // missing/unparseable `at`. (Block/daily-count entries are not "sends".)
    let lastSentToContactAt: string | null = null;
    let lastSentMs = -Infinity;
    for (const e of recalled) {
      if (e.kind !== "review_requested" && e.kind !== "lead_contacted") continue;
      if (typeof e.at !== "string") continue;
      const ms = Date.parse(e.at);
      if (Number.isFinite(ms) && ms > lastSentMs) {
        lastSentMs = ms;
        lastSentToContactAt = e.at;
      }
    }

    let decision = evaluateGuardrails(guardrails, { now, lastSentToContactAt, sentTodayByAgent });
    // evaluateGuardrails never throws, but guard anyway: a guardrail engine bug
    // must not crash the handler. Fail OPEN (allow) so a brake bug never silently
    // drops every send (the verify gate still runs after).
    if (typeof decision?.allow !== "boolean") {
      decision = { allow: true };
    }

    if (!decision.allow) {
      // BLOCKED by a brake — do NOT send. Count it (reusing `blocked`), log the
      // reason, and record a `guardrail_blocked` entry to loop-memory (so the
      // agent "remembers" why) + surface it on the run summary. Best-effort.
      result.blocked += 1;
      const reason = decision.reason ?? "guardrail";
      console.warn(
        JSON.stringify({
          action: "event_agent.guardrail_blocked",
          orgId: event.orgId,
          skill: agent.skill,
          channel: agent.channel,
          contactId,
          reason,
        }),
      );
      if (deps.memoryStore) {
        const at = deps.now ? deps.now().toISOString() : undefined;
        const blockedEntry: AgentMemoryEntry = {
          ...(at ? { at } : {}),
          kind: "guardrail_blocked",
          summary: `Guardrail blocked ${agent.skill} to ${
            contactName ?? "contact"
          }: ${reason}`,
          data: { reason },
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
            `[run-event-agent] recordAgentMemory (guardrail_blocked) failed for ${agent.skill}:`,
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

  // 5b. Increment the per-agent DAILY COUNTER (the budget brake's input) on a
  //     successful send: append a fresh `daily_count` entry carrying the new
  //     total to the SAME `_stats/<tz-date>` note we read before the gate. The
  //     store is append-only, so the count is read as the MAX across entries
  //     (maxDailyCount) — appending `prev + 1` advances that max by one. Only
  //     when a store + a resolved stats key are present. Best-effort + guarded:
  //     a failed counter write must never break a send we already completed (it
  //     just means the daily cap under-counts by one — the safe direction). The
  //     counter is NOT pushed to result.memory.recorded (it's bookkeeping, not a
  //     contact-facing action — recorded surfaces the send/blocks).
  if (deps.memoryStore && dailyStatsKey) {
    const at = deps.now ? deps.now().toISOString() : undefined;
    const counterEntry: AgentMemoryEntry = {
      ...(at ? { at } : {}),
      kind: "daily_count",
      summary: `Daily send count for ${agent.skill} → ${sentTodayByAgent + 1}`,
      data: { count: sentTodayByAgent + 1 },
    };
    try {
      await recordAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey: dailyStatsKey,
        entry: counterEntry,
      });
    } catch (err) {
      console.warn(
        `[run-event-agent] recordAgentMemory (daily_count) failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
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

/**
 * Run a single ACTION-ONLY agent (a poster/logger — `blueprint.actionOnly`). P2 /
 * Task 6. Mutates `result` with the outcome. NEVER composes or sends a customer
 * message — that is the safety-critical contract (a posting agent must never text
 * a customer). Instead it:
 *   1. runs the GUARDRAILS gate (action-only guardrails from T3 = a daily cap,
 *      NO quiet hours), so caps still brake a runaway poster. A tripped brake
 *      BLOCKS the fire (counted on `result.blocked`, recorded `guardrail_blocked`).
 *   2. records an `action_fired` loop-memory entry (the observable record that the
 *      agent fired, noting the bound tools) + a structured log line, and advances
 *      the per-agent daily counter (so the daily cap brakes on subsequent fires).
 *   3. counts the fire on `result.actionOnly`.
 *
 * It does NOT actually invoke the bound tools yet — the LIVE tool execution
 * (calling Postiz / the bound MCP tool to post) is P2.1. So the agent fires + is
 * recorded but does NOT yet post; the structured log + the `action_fired` entry
 * surface the bound tools (`agent.connectorIds`) so an unbound poster is visible.
 *
 * Self-contained (it re-derives its own guardrails decision + daily-counter from
 * the pure helpers) so the messaging path in runOneAgent stays byte-for-byte.
 * Guarded throughout — an action-only bug must never break sibling agents.
 */
async function runActionOnlyAgent(
  event: FiredEvent,
  agent: EventAgentMatch,
  agentKey: string,
  recalled: AgentMemoryEntry[],
  deps: RunEventAgentDeps,
  result: RunEventAgentResult,
): Promise<void> {
  // The tools this fire is meant to drive (for the log/record). Empty = unbound →
  // the operator-facing signal that the agent can't actually post yet.
  const connectorIds =
    Array.isArray(agent.connectorIds) && agent.connectorIds.length > 0
      ? agent.connectorIds.filter((id): id is string => typeof id === "string")
      : [];

  // `now` bounds BOTH the guardrail decision and the daily-counter date key (and
  // the increment after a fire) — the same instant, exactly as the messaging path.
  const now = deps.now?.() ?? new Date();

  // Resolve the per-agent daily counter ONCE (function scope) so the gate can read
  // it AND we can increment the SAME `_stats/<date>` note after a successful fire.
  // Only meaningful with a memoryStore (else count = 0, key = null, no increment).
  let dailyStatsKey: string | null = null;
  let firedTodayByAgent = 0;
  if (deps.memoryStore) {
    let tz = "UTC";
    if (deps.resolveTimezone) {
      try {
        const resolved = await deps.resolveTimezone(event.orgId);
        if (typeof resolved === "string" && resolved.trim().length > 0) {
          tz = resolved.trim();
        }
      } catch {
        tz = "UTC";
      }
    }
    dailyStatsKey = dailyStatsSubjectKey(dateKeyInTz(now, tz));
    try {
      const statEntries = await recallAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey: dailyStatsKey,
      });
      firedTodayByAgent = maxDailyCount(statEntries);
    } catch {
      firedTodayByAgent = 0;
    }
  }

  // GUARDRAILS gate. An action-only agent has no quiet hours / per-contact rules by
  // default (it doesn't message a person), but a daily cap still brakes it. Source:
  // the agent's own `blueprint.guardrails` (projected as `guardrails`) or, if
  // absent, the per-skill default. The decision is PURE (evaluateGuardrails never
  // throws); we feed `now`, the last fire we recalled for this contact, and the
  // per-agent daily count. A tripped brake BLOCKS the fire. Guarded (fail OPEN so a
  // brake bug never silently swallows the fire — but never crashes the handler).
  const guardrails = agent.guardrails ?? defaultGuardrailsForSkill(agent.skill);
  if (guardrails) {
    let lastFiredAt: string | null = null;
    let lastFiredMs = -Infinity;
    for (const e of recalled) {
      if (e.kind !== "action_fired") continue;
      if (typeof e.at !== "string") continue;
      const ms = Date.parse(e.at);
      if (Number.isFinite(ms) && ms > lastFiredMs) {
        lastFiredMs = ms;
        lastFiredAt = e.at;
      }
    }

    let decision = evaluateGuardrails(guardrails, {
      now,
      lastSentToContactAt: lastFiredAt,
      sentTodayByAgent: firedTodayByAgent,
    });
    if (typeof decision?.allow !== "boolean") {
      decision = { allow: true };
    }

    if (!decision.allow) {
      // BLOCKED by a brake — do NOT fire. Count it (reusing `blocked`), log the
      // reason, and record a `guardrail_blocked` entry (so the agent "remembers"
      // why). Best-effort + guarded. The daily counter is NOT advanced.
      result.blocked += 1;
      const reason = decision.reason ?? "guardrail";
      console.warn(
        JSON.stringify({
          action: "event_agent.action_only.guardrail_blocked",
          orgId: event.orgId,
          skill: agent.skill,
          tools: connectorIds,
          reason,
        }),
      );
      if (deps.memoryStore) {
        const at = deps.now ? deps.now().toISOString() : undefined;
        const blockedEntry: AgentMemoryEntry = {
          ...(at ? { at } : {}),
          kind: "guardrail_blocked",
          summary: `Guardrail blocked action-only ${agent.skill}: ${reason}`,
          data: { reason, actionOnly: true },
        };
        try {
          await recordAgentMemory(deps.memoryStore, {
            orgId: event.orgId,
            agentKey,
            subjectKey: agentKey,
            entry: blockedEntry,
          });
        } catch (err) {
          console.warn(
            `[run-event-agent] recordAgentMemory (action_only guardrail_blocked) failed for ${agent.skill}:`,
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

  // FIRE. We do NOT send a customer message and we do NOT (yet) invoke the bound
  // tools — that live tool-execution is P2.1.
  // TODO(P2.1): invoke bound tools (agent.connectorIds → the connector/tool-invoke
  // seam, e.g. actually call Postiz to post) using the agent's skill as context.
  // Until then this fire is RECORDED + logged but no post is made.
  result.actionOnly += 1;
  console.info(
    JSON.stringify({
      action: "event_agent.action_only.fired",
      orgId: event.orgId,
      skill: agent.skill,
      tools: connectorIds,
      liveToolExecution: "pending_p2_1",
      note:
        connectorIds.length > 0
          ? "action-only fire recorded; live tool execution is P2.1 (no post yet)"
          : "action-only fire recorded but NO tools bound — connect a tool to post (live execution is P2.1)",
    }),
  );

  // Record the fire to loop-memory as an action so a later run/`/runs` can OBSERVE
  // it. Best-effort + guarded — a misbehaving store must never break the handler.
  if (deps.memoryStore) {
    const at = deps.now ? deps.now().toISOString() : undefined;
    const entry: AgentMemoryEntry = {
      ...(at ? { at } : {}),
      kind: "action_fired",
      summary:
        connectorIds.length > 0
          ? `Action-only ${agent.skill} fired (tools: ${connectorIds.join(", ")}); live tool execution pending (P2.1)`
          : `Action-only ${agent.skill} fired with NO tools bound; live tool execution pending (P2.1)`,
      data: { actionOnly: true, tools: connectorIds, liveToolExecution: "pending_p2_1" },
    };
    try {
      await recordAgentMemory(deps.memoryStore, {
        orgId: event.orgId,
        agentKey,
        subjectKey: agentKey,
        entry,
      });
    } catch (err) {
      console.warn(
        `[run-event-agent] recordAgentMemory (action_fired) failed for ${agent.skill}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
    if (result.memory) {
      result.memory.recorded.push(entry);
    }

    // Advance the per-agent DAILY COUNTER (the budget brake's input) on a fire —
    // same append-only `daily_count` shape the messaging path uses, so the daily
    // cap brakes subsequent fires. Best-effort + guarded.
    if (dailyStatsKey) {
      const counterEntry: AgentMemoryEntry = {
        ...(at ? { at } : {}),
        kind: "daily_count",
        summary: `Daily action count for ${agent.skill} → ${firedTodayByAgent + 1}`,
        data: { count: firedTodayByAgent + 1 },
      };
      try {
        await recordAgentMemory(deps.memoryStore, {
          orgId: event.orgId,
          agentKey,
          subjectKey: dailyStatsKey,
          entry: counterEntry,
        });
      } catch (err) {
        console.warn(
          `[run-event-agent] recordAgentMemory (action_only daily_count) failed for ${agent.skill}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
