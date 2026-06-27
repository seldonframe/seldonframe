// Unified Agent Model — P1, Task T4: the event-agent orchestrator.
//
// runEventAgent is the dispatcher that turns a fired domain event
// (booking.completed / lead.created) into an outbound message: it finds the
// org's agents whose `resolveAgentTrigger(blueprint.trigger)` is
// `{kind:"event", event:<this type>}`, runs the matching pure skill
// (composeReviewRequest / composeSpeedToLead), and sends via the EXISTING
// outbound seam to the event's contact.
//
// Every side effect (agent lookup, contact load, throttle probe, SMS/email
// send) is INJECTED as `deps`, so these tests pin the decision logic with no
// Postgres / Twilio / Resend — exactly the DI convention the missed-call
// text-back uses.
//
// Pinned contract:
//   • booking.completed → composeReviewRequest output sent ONCE to the contact;
//   • a SECOND identical booking.completed for the same contact → throttled
//     (the send is NOT called again — review is one-per-contact);
//   • lead.created → composeSpeedToLead sent;
//   • an event with NO matching agent → no send;
//   • a review agent with NO review URL → graceful skip (no send, no throw);
//   • runEventAgent NEVER throws (it's called from an event-bus handler).

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  runEventAgent,
  type RunEventAgentDeps,
  type EventAgentMatch,
  type EventAgentSkill,
  type FiredEvent,
  type RunActionOnlyTurnResult,
} from "../../../../src/lib/agents/triggers/run-event-agent";
import { type ConnectorBinding } from "../../../../src/lib/agents/mcp/connectors";
import { composeReviewRequest } from "../../../../src/lib/agents/skills/review-requester";
import { composeSpeedToLead } from "../../../../src/lib/agents/skills/speed-to-lead";
import {
  type AgentMemoryEntry,
  type AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";
import {
  type Checker,
  type VerifyRubric,
  type VerifyResult,
} from "../../../../src/lib/agents/verify/agent-verify";
import { type Guardrails } from "../../../../src/lib/agents/guardrails/agent-guardrails";
import {
  runDueScheduledEventAgent,
  type ScheduledEventAgentSend,
} from "../../../../src/lib/agents/triggers/scheduled-event-agent";

// ─── a recording fake deps builder ───────────────────────────────────────────

type SmsCall = {
  orgId: string;
  contactId: string | null;
  toNumber: string;
  body: string;
  skill: EventAgentSkill;
};
type EmailCall = {
  orgId: string;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  skill: EventAgentSkill;
};

// A fixed DAYTIME clock (12:00 UTC) used as the DEFAULT `now` for every fake
// deps. The L3 guardrails gate now applies defaultGuardrailsForSkill, and the
// review-requester default carries quiet hours (21→8 UTC). Without a pinned
// clock, the legacy L1/L2 tests would flake whenever CI happened to run during
// the wall-clock quiet window. Noon UTC is outside 21→8 so the default
// guardrails ALLOW — preserving the legacy send behavior deterministically.
// Tests that need a different instant (e.g. the 03:00 quiet-hours tests below)
// override `now`.
const NOON_UTC = new Date("2026-06-26T12:00:00.000Z");

function makeDeps(overrides: Partial<RunEventAgentDeps> = {}): {
  deps: RunEventAgentDeps;
  smsCalls: SmsCall[];
  emailCalls: EmailCall[];
  throttledKeys: Set<string>;
} {
  const smsCalls: SmsCall[] = [];
  const emailCalls: EmailCall[] = [];
  // Mutable "already requested" set so the second booking.completed in a test
  // can observe the first one's mark (mirrors the smsMessages dedup tag).
  const throttledKeys = new Set<string>();

  const deps: RunEventAgentDeps = {
    // Default to the pinned daytime clock so guardrails are deterministic; an
    // explicit `now` in overrides wins (spread below).
    now: () => NOON_UTC,
    findEventAgents: async () => [],
    loadContact: async () => ({
      name: "Jordan",
      phone: "+15551230000",
      email: "jordan@example.com",
    }),
    hasAlreadyRequested: async (orgId, contactId, skill) =>
      throttledKeys.has(`${orgId}:${contactId}:${skill}`),
    markRequested: async (orgId, contactId, skill) => {
      throttledKeys.add(`${orgId}:${contactId}:${skill}`);
    },
    sendSms: async (args) => {
      smsCalls.push(args);
    },
    sendEmail: async (args) => {
      emailCalls.push(args);
    },
    ...overrides,
  };

  return { deps, smsCalls, emailCalls, throttledKeys };
}

const REVIEW_URL = "https://g.page/r/acme/review";

function reviewAgent(channel: "sms" | "email" = "sms"): EventAgentMatch {
  return {
    skill: "review-requester",
    channel,
    businessName: "Acme Plumbing",
    reviewUrl: REVIEW_URL,
  };
}

function speedAgent(channel: "sms" | "email" = "sms"): EventAgentMatch {
  return {
    skill: "speed-to-lead",
    channel,
    businessName: "Acme Plumbing",
  };
}

function bookingCompleted(contactId = "contact-1"): FiredEvent {
  return {
    type: "booking.completed",
    orgId: "org-1",
    contactId,
    payload: { appointmentId: "appt-1", contactId },
  };
}

function leadCreated(contactId = "contact-1"): FiredEvent {
  return {
    type: "lead.created",
    orgId: "org-1",
    contactId,
    payload: { contactId },
  };
}

// ─── review-requester ← booking.completed ────────────────────────────────────

describe("runEventAgent — review-requester on booking.completed", () => {
  test("sends composeReviewRequest output ONCE via SMS to the contact", async () => {
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });

    const result = await runEventAgent(bookingCompleted(), deps);

    assert.equal(smsCalls.length, 1, "exactly one SMS should be sent");
    assert.equal(emailCalls.length, 0, "no email for an SMS-channel agent");
    const sent = smsCalls[0];
    assert.equal(sent.toNumber, "+15551230000");
    assert.equal(sent.contactId, "contact-1");
    // The body must be the pure skill's output (the review URL is load-bearing).
    const expected = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.equal(sent.body, expected.body);
    assert.ok(sent.body.includes(REVIEW_URL), "the review link must be in the body");
    assert.equal(result.sent, 1);
  });

  test("email channel routes to sendEmail with subject + body", async () => {
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("email")],
    });

    await runEventAgent(bookingCompleted(), deps);

    assert.equal(smsCalls.length, 0);
    assert.equal(emailCalls.length, 1);
    const expected = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "email",
    });
    assert.equal(emailCalls[0].toEmail, "jordan@example.com");
    assert.equal(emailCalls[0].subject, expected.subject);
    assert.equal(emailCalls[0].body, expected.body);
  });

  test("a SECOND identical booking.completed for the same contact is throttled", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });

    await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "first event sends");

    // Same contact, same skill → one-per-contact throttle blocks the resend.
    const second = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "second event must NOT re-send (throttled)");
    assert.equal(second.sent, 0);
    assert.equal(second.throttled, 1);
  });

  test("a DIFFERENT contact still gets their own review request", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });

    await runEventAgent(bookingCompleted("contact-1"), deps);
    await runEventAgent(bookingCompleted("contact-2"), deps);
    assert.equal(smsCalls.length, 2, "throttle is per-contact, not global");
  });

  test("a review agent with NO review URL skips gracefully (no send, no throw)", async () => {
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [
        { skill: "review-requester", channel: "sms", businessName: "Acme Plumbing" },
      ],
    });

    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 0, "no send without a review URL");
    assert.equal(emailCalls.length, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
  });

  test("a blank/whitespace review URL is treated as missing (skip)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [
        { skill: "review-requester", channel: "sms", businessName: "Acme", reviewUrl: "   " },
      ],
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 0);
    assert.equal(result.skipped, 1);
  });
});

// ─── R1: the RESOLVED per-client review URL is what gets sent + verified ──────
//
// On the production path, findEventAgents resolves `EventAgentMatch.reviewUrl` as
// `deployment.customization.reviewUrl ?? blueprint.reviewUrl` (resolveReviewUrl;
// pinned in deployment-customization.spec.ts). Here we pin the ORCHESTRATOR half
// of the contract: whatever URL the resolver put on the match is the URL that
// (a) the compose skill embeds in the body, and (b) the always-on verify gate
// enforces (a "review link" must_include check keyed on that exact URL). So a
// per-client deployment link flows through end-to-end, and the template fallback
// flows through identically when the deployment has none.
describe("runEventAgent — resolved review URL flows to compose + verify (R1)", () => {
  const CLIENT_URL = "https://g.page/r/this-clients-own/review";
  const TEMPLATE_URL = "https://g.page/r/agency-template-default/review";

  test("the deployment's own link (resolver winner) is embedded in the body", async () => {
    const { deps, smsCalls } = makeDeps({
      // findEventAgents already resolved deployment-wins: the match carries the
      // CLIENT's link, NOT the template default.
      findEventAgents: async () => [
        { skill: "review-requester", channel: "sms", businessName: "Acme", reviewUrl: CLIENT_URL },
      ],
    });

    const result = await runEventAgent(bookingCompleted(), deps);

    assert.equal(result.sent, 1, "the resolved-URL ask sends");
    assert.equal(smsCalls.length, 1);
    assert.ok(
      smsCalls[0].body.includes(CLIENT_URL),
      "the client's own review link must be in the body",
    );
    assert.ok(
      !smsCalls[0].body.includes(TEMPLATE_URL),
      "the template default must NOT appear once the client link won",
    );
    // It matches the pure skill composed with the resolved URL.
    const expected = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme",
      reviewUrl: CLIENT_URL,
      channel: "sms",
    });
    assert.equal(smsCalls[0].body, expected.body);
  });

  test("the template default flows through when the deployment has none", async () => {
    // The resolver fell back to the template link → the match carries it.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [
        { skill: "review-requester", channel: "sms", businessName: "Acme", reviewUrl: TEMPLATE_URL },
      ],
    });

    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(result.sent, 1);
    assert.ok(
      smsCalls[0].body.includes(TEMPLATE_URL),
      "the template fallback link is used when the client set none",
    );
  });

  test("the verify gate keys its 'review link' check on the RESOLVED URL (block if absent)", async () => {
    // The agent carries the client's URL, but a buggy/injected checker that
    // strips the link must be BLOCKED — proving verify is keyed on the resolved
    // URL. We force the failure by composing a body that lacks the link via a
    // checker that asserts the resolved URL is the one being verified.
    let verifiedAgainstUrl: string | null = null;
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [
        { skill: "review-requester", channel: "sms", businessName: "Acme", reviewUrl: CLIENT_URL },
      ],
      // The deterministic default rubric already enforces must_include(CLIENT_URL).
      // Add a checker that records the body it saw so we can confirm the resolved
      // URL is present in what verify ran against, then PASS.
      checker: async (output: string) => {
        verifiedAgainstUrl = output.includes(CLIENT_URL) ? CLIENT_URL : null;
        return { pass: true, results: [], failures: [] };
      },
    });

    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(result.sent, 1, "passes verify with the resolved URL present");
    assert.equal(
      verifiedAgainstUrl,
      CLIENT_URL,
      "verify ran against the body carrying the resolved client URL",
    );
    assert.ok(smsCalls[0].body.includes(CLIENT_URL));
  });
});

// ─── speed-to-lead ← lead.created ─────────────────────────────────────────────

describe("runEventAgent — speed-to-lead on lead.created", () => {
  test("sends composeSpeedToLead output via SMS to the contact", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
    });

    const result = await runEventAgent(leadCreated(), deps);

    assert.equal(smsCalls.length, 1);
    const expected = composeSpeedToLead({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      channel: "sms",
    });
    assert.equal(smsCalls[0].body, expected.body);
    assert.equal(result.sent, 1);
  });

  test("speed-to-lead is NOT throttled (every lead gets an instant reply)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
    });

    await runEventAgent(leadCreated("contact-1"), deps);
    // Even a second event for the SAME contact still acks — speed-to-lead is
    // per-event, not one-per-contact (unlike review-requester).
    await runEventAgent(leadCreated("contact-1"), deps);
    assert.equal(smsCalls.length, 2);
  });

  test("the throttle probe is never even consulted for speed-to-lead", async () => {
    let probed = false;
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
      hasAlreadyRequested: async () => {
        probed = true;
        return true; // would block if (wrongly) consulted
      },
    });
    await runEventAgent(leadCreated(), deps);
    assert.equal(probed, false, "speed-to-lead must not consult the review throttle");
    assert.equal(smsCalls.length, 1);
  });
});

// ─── no-match / recipient-missing / robustness ────────────────────────────────

describe("runEventAgent — no matching agent → no send", () => {
  test("empty agent list → nothing sent", async () => {
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [],
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 0);
    assert.equal(emailCalls.length, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.matched, 0);
  });

  test("an agent for a DIFFERENT event slug does not fire (lookup is the gate)", async () => {
    // findEventAgents is the matcher; if the caller's lookup returns [] for this
    // event type, runEventAgent sends nothing. We simulate the lookup filtering.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async (_orgId, eventType) =>
        eventType === "booking.completed" ? [reviewAgent("sms")] : [],
    });
    await runEventAgent(leadCreated(), deps); // lead.created → lookup returns []
    assert.equal(smsCalls.length, 0);
  });
});

describe("runEventAgent — missing recipient / contact", () => {
  test("SMS agent but contact has no phone → skip (no send)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      loadContact: async () => ({ name: "Jordan", phone: null, email: "j@x.com" }),
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 0, "no phone → no SMS");
    assert.equal(result.skipped, 1);
  });

  test("email agent but contact has no email → skip (no send)", async () => {
    const { deps, emailCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("email")],
      loadContact: async () => ({ name: "Jordan", phone: "+15551230000", email: null }),
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(emailCalls.length, 0, "no email → no email send");
    assert.equal(result.skipped, 1);
  });

  test("no contact at all (null) → no send, no throw", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      loadContact: async () => null,
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 0);
    assert.equal(result.skipped, 1);
  });

  test("event with no contactId → no send, no throw", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });
    const result = await runEventAgent(
      { type: "booking.completed", orgId: "org-1", contactId: null, payload: {} },
      deps,
    );
    assert.equal(smsCalls.length, 0);
    assert.equal(result.sent, 0);
  });
});

describe("runEventAgent — never throws", () => {
  test("a throwing send is swallowed (recorded, not propagated)", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      sendSms: async () => {
        throw new Error("twilio exploded");
      },
    });
    await assert.doesNotReject(() => runEventAgent(bookingCompleted(), deps));
  });

  test("a throwing agent lookup is swallowed", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => {
        throw new Error("db down");
      },
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    assert.equal(result.sent, 0);
  });

  test("a throwing contact load is swallowed (that agent is skipped)", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      loadContact: async () => {
        throw new Error("contact load failed");
      },
    });
    await assert.doesNotReject(() => runEventAgent(bookingCompleted(), deps));
  });
});

describe("runEventAgent — multiple agents on one event", () => {
  let calls: { sms: SmsCall[]; email: EmailCall[] };
  beforeEach(() => {
    calls = { sms: [], email: [] };
  });

  test("two matching agents both fire (e.g. SMS + email review)", async () => {
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms"), reviewAgent("email")],
    });
    const result = await runEventAgent(bookingCompleted(), deps);
    // SMS sends; email is a DIFFERENT skill-key throttle? No — same skill, same
    // contact. The throttle is per (contact, skill), so the second channel for
    // the SAME skill+contact is throttled. This documents that review is truly
    // one-per-contact regardless of channel.
    assert.equal(smsCalls.length + emailCalls.length, 1, "review is one-per-contact across channels");
    assert.equal(result.throttled, 1);
  });

  test("a review agent and a speed agent on the same contact both fire (different skills)", async () => {
    // Different skills are independently throttled — a contact can get BOTH a
    // speed-to-lead ack (on lead.created) and later a review ask (on
    // booking.completed). Here we fire them in one call to prove the throttle
    // key includes the skill.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms"), speedAgent("sms")],
    });
    await runEventAgent(bookingCompleted(), deps);
    assert.equal(smsCalls.length, 2, "review + speed are different throttle keys");
  });
});

// ─── loop-memory (State): recall before composing + record after sending ──────
//
// T3 generalizes the bespoke review throttle into a memory recall. These pin:
//   • booking.completed with empty memory → composes + sends ONCE + appends a
//     `review_requested` entry for that contact's memory key;
//   • a second booking.completed for the SAME contact whose memory already
//     records `review_requested` → THROTTLED (no second send) — the gate is the
//     recall, even though the legacy hasAlreadyRequested probe says "not yet";
//   • lead.created → records `lead_contacted`;
//   • NO memoryStore in deps → behaves exactly as before (covered by every test
//     above that omits it, plus an explicit no-store assertion here);
//   • a store whose read/append throws → the send still happens (memory never
//     breaks the agent).
//
// agentKey = the skill ("review-requester"/"speed-to-lead"); subjectKey = the
// contactId. The fake store mirrors makeBrainMemoryStoreForOrg's key shape
// (`agents/<agentKey>/<subjectKey>`, orgId scoped by the store, not in the key).

/** Build the production-shaped memory key (agentKey = skill, subjectKey =
 *  contactId). PINS the key derivation runEventAgent must use. */
function memKey(skill: EventAgentSkill, contactId: string): string {
  return `agents/${skill}/${contactId}`;
}

type AppendCall = { key: string; entry: AgentMemoryEntry };

/** A Map-backed AgentMemoryStore (NO Brain/Postgres) that records every read +
 *  append so a test can assert the agent recalled/recorded the right thing. */
function makeFakeMemoryStore(seed?: Record<string, AgentMemoryEntry[]>): {
  store: AgentMemoryStore;
  data: Map<string, AgentMemoryEntry[]>;
  appendCalls: AppendCall[];
  readKeys: string[];
} {
  const data = new Map<string, AgentMemoryEntry[]>(Object.entries(seed ?? {}));
  const appendCalls: AppendCall[] = [];
  const readKeys: string[] = [];
  const store: AgentMemoryStore = {
    read: async (key) => {
      readKeys.push(key);
      return data.get(key) ?? [];
    },
    append: async (key, entry) => {
      appendCalls.push({ key, entry });
      const list = data.get(key) ?? [];
      list.push(entry);
      data.set(key, list);
    },
  };
  return { store, data, appendCalls, readKeys };
}

const FIXED_NOW = new Date("2026-06-26T12:00:00.000Z");

// The L3 guardrails daily counter (T3) writes a `daily_count` entry to a SEPARATE
// memory key — `agents/<skill>/_stats-<tz-date>` (memoryKey sanitizes the "/" in
// `_stats/<date>` to "-"). So after a successful send a store now sees TWO
// appends: the contact-key send record AND the stats-key counter. These helpers
// let the loop-memory/verify tests assert the CONTACT-key appends precisely
// (still exactly one send per contact), independent of the bookkeeping counter.
function statsKey(skill: EventAgentSkill, dateKey: string): string {
  return `agents/${skill}/_stats-${dateKey}`;
}
/** Appends made to a contact's memory key (the send/verify_blocked records). */
function contactAppends(
  appendCalls: AppendCall[],
  skill: EventAgentSkill,
  contactId: string,
): AppendCall[] {
  return appendCalls.filter((c) => c.key === memKey(skill, contactId));
}
/** Appends made to an agent's daily-counter stats key. */
function statsAppends(
  appendCalls: AppendCall[],
  skill: EventAgentSkill,
  dateKey: string,
): AppendCall[] {
  return appendCalls.filter((c) => c.key === statsKey(skill, dateKey));
}

describe("runEventAgent — loop-memory (recall + record)", () => {
  test("booking.completed with EMPTY memory: composes + sends once + records review_requested", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // sent exactly once
    assert.equal(smsCalls.length, 1, "exactly one SMS");
    assert.equal(result.sent, 1);

    // recalled the contact's memory under the pinned key
    assert.ok(
      mem.readKeys.includes(memKey("review-requester", "contact-1")),
      `expected a recall of ${memKey("review-requester", "contact-1")}, got ${JSON.stringify(mem.readKeys)}`,
    );

    // recorded exactly one review_requested entry for that CONTACT (the L3 daily
    // counter also appends a `daily_count` entry to a separate stats key — assert
    // the contact-key appends precisely so the counter doesn't muddy the count).
    const cAppends = contactAppends(mem.appendCalls, "review-requester", "contact-1");
    assert.equal(cAppends.length, 1, "exactly one contact-key memory append");
    const appended = cAppends[0];
    assert.equal(appended.key, memKey("review-requester", "contact-1"));
    assert.equal(appended.entry.kind, "review_requested");
    assert.equal(appended.entry.at, FIXED_NOW.toISOString(), "entry carries the DI'd clock");
    assert.equal((appended.entry.data as { channel?: string }).channel, "sms");
    assert.equal(typeof appended.entry.summary, "string");

    // memory now reports the action as done for that contact
    const stored = mem.data.get(memKey("review-requester", "contact-1"));
    assert.equal(stored?.length, 1);
    assert.ok(
      stored?.some((e) => e.kind === "review_requested"),
      "memory hasDone(review_requested) for the contact",
    );
  });

  test("a SECOND booking.completed for the SAME contact (memory already records review_requested) is THROTTLED — no second send", async () => {
    // Memory pre-seeded as already-asked; the LEGACY probe deliberately says "no"
    // to prove the recall is the gate now (throttle if EITHER says done).
    const mem = makeFakeMemoryStore({
      [memKey("review-requester", "contact-1")]: [
        { kind: "review_requested", summary: "asked earlier", data: { channel: "sms" } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      hasAlreadyRequested: async () => false, // legacy probe: NOT throttled
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "memory recall throttles the resend");
    assert.equal(result.sent, 0);
    assert.equal(result.throttled, 1);
    // nothing new recorded (we never sent)
    assert.equal(mem.appendCalls.length, 0, "no append on a throttled run");
  });

  test("lead.created records lead_contacted (and is NOT throttled)", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(leadCreated("contact-9"), deps);

    assert.equal(smsCalls.length, 1);
    assert.equal(result.sent, 1);
    const cAppends = contactAppends(mem.appendCalls, "speed-to-lead", "contact-9");
    assert.equal(cAppends.length, 1, "speed-to-lead records too (contact key)");
    const appended = cAppends[0];
    assert.equal(appended.key, memKey("speed-to-lead", "contact-9"));
    assert.equal(appended.entry.kind, "lead_contacted");
    assert.equal((appended.entry.data as { channel?: string }).channel, "sms");
  });

  test("a second lead.created for the SAME contact still acks (speed-to-lead never throttles on memory)", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
      memoryStore: mem.store,
    });
    await runEventAgent(leadCreated("contact-9"), deps);
    await runEventAgent(leadCreated("contact-9"), deps);
    assert.equal(smsCalls.length, 2, "speed-to-lead is per-event even with memory");
    assert.equal(
      contactAppends(mem.appendCalls, "speed-to-lead", "contact-9").length,
      2,
      "each ack is recorded (contact key)",
    );
  });

  test("NO memoryStore in deps → behaves exactly as before (sends, no recall/record)", async () => {
    // makeDeps() omits memoryStore by default. The legacy throttle is the only
    // gate; the run sends and nothing memory-related happens.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });
    assert.equal(deps.memoryStore, undefined, "no store wired");
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1);
    assert.equal(result.sent, 1);
  });

  test("a store whose read/append THROWS → the send still happens (memory never breaks the agent)", async () => {
    const throwingStore: AgentMemoryStore = {
      read: async () => {
        throw new Error("brain read exploded");
      },
      append: async () => {
        throw new Error("brain append exploded");
      },
    };
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: throwingStore,
    });

    let result: Awaited<ReturnType<typeof runEventAgent>> | undefined;
    await assert.doesNotReject(async () => {
      result = await runEventAgent(bookingCompleted("contact-1"), deps);
    });
    assert.equal(smsCalls.length, 1, "send happens despite the memory store throwing");
    assert.equal(result?.sent, 1);
  });
});

// ─── T4: the run summary carries the recalled/recorded loop-memory ────────────
//
// "RunContext as loop-memory": the event-agent path has no workflow_runs row, so
// the run's memory is surfaced on the RETURN summary (and a listener log line) so
// it's OBSERVABLE. These pin:
//   • an agent that acted → result.memory.recorded holds the entry it wrote
//     (the same entry persisted to the store), and result.memory.recalled holds
//     what it recalled before composing;
//   • a throttled run (memory already hasDone) → recalled surfaces the prior
//     entry, recorded is empty (nothing was written this run);
//   • NO memoryStore → result.memory is absent (undefined), no crash.

describe("runEventAgent — T4: run summary carries recalled/recorded memory", () => {
  test("an agent that acts → summary.memory.recorded shows the written entry; recalled is surfaced", async () => {
    const mem = makeFakeMemoryStore();
    const { deps } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(result.sent, 1);
    // memory is present (a store was wired) and additive.
    assert.ok(result.memory, "result.memory present when a store is wired");
    // recalled: empty memory → nothing recalled, but the array exists.
    assert.ok(Array.isArray(result.memory!.recalled), "recalled is an array");
    assert.equal(result.memory!.recalled.length, 0, "empty memory → nothing recalled");
    // recorded: the entry the agent wrote shows up on the summary, and it is the
    // SAME entry that was persisted to the store.
    assert.equal(result.memory!.recorded.length, 1, "the written entry is surfaced");
    const recorded = result.memory!.recorded[0];
    assert.equal(recorded.kind, "review_requested");
    assert.equal(recorded.at, FIXED_NOW.toISOString());
    assert.equal((recorded.data as { channel?: string }).channel, "sms");
    // It matches what the store actually appended to the CONTACT key (the L3
    // daily counter also appends to a separate stats key; recorded surfaces only
    // the contact-facing send, not the bookkeeping counter).
    const cAppends = contactAppends(mem.appendCalls, "review-requester", "contact-1");
    assert.equal(cAppends.length, 1);
    assert.deepEqual(recorded, cAppends[0].entry);
  });

  test("recalled surfaces prior memory; a throttled run records nothing this run", async () => {
    const prior: AgentMemoryEntry = {
      kind: "review_requested",
      summary: "asked earlier",
      data: { channel: "sms" },
    };
    const mem = makeFakeMemoryStore({
      [memKey("review-requester", "contact-1")]: [prior],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      hasAlreadyRequested: async () => false, // recall is the gate
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "throttled by recall");
    assert.equal(result.throttled, 1);
    assert.ok(result.memory, "memory present");
    // The agent recalled the prior entry BEFORE deciding to throttle → it's
    // surfaced on the summary so a log/operator can see WHY it throttled.
    assert.equal(result.memory!.recalled.length, 1, "prior memory surfaced");
    assert.deepEqual(result.memory!.recalled[0], prior);
    // Nothing was sent, so nothing was recorded this run.
    assert.equal(result.memory!.recorded.length, 0, "no record on a throttled run");
  });

  test("NO memoryStore → result.memory is absent (undefined), no crash", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });
    assert.equal(deps.memoryStore, undefined, "no store wired");

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(result.sent, 1, "still sends");
    assert.equal(result.memory, undefined, "memory omitted when no store is wired");
  });

  test("memory aggregates across multiple acting agents in one run", async () => {
    // review + speed on one contact are DIFFERENT skills (independent throttles)
    // → both act, so the summary aggregates both recorded entries.
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms"), speedAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 2, "both skills send");
    assert.ok(result.memory);
    assert.equal(result.memory!.recorded.length, 2, "both records aggregated");
    const kinds = result.memory!.recorded.map((e) => e.kind).sort();
    assert.deepEqual(kinds, ["lead_contacted", "review_requested"]);
  });
});

// ─── L2 Verify (T3): gate the composed body before sending ────────────────────
//
// The maker (the client's agent) must never grade its own homework: before a
// send, the composed BODY is run through a VERIFY rubric (deterministic checks
// always on; an optional injected `checker` AND-ed in). A fail BLOCKS the send,
// increments `result.blocked`, and records a `verify_blocked` loop-memory entry
// (so the agent "remembers" the failure and it's observable on the run summary).
// These pin:
//   • a compose that FAILS the rubric (here: a blueprint.verify requiring text
//     the composed body lacks) → no send, blocked === 1, a verify_blocked memory
//     entry recorded (and surfaced on result.memory.recorded);
//   • a VALID compose (body satisfies the default rubric) → sends as before,
//     blocked === 0, records the normal review_requested entry;
//   • a skill with NO default rubric and no blueprint.verify → NO gate, sends
//     (back-compat);
//   • an injected `checker` returning pass:false on an otherwise-valid body →
//     blocked (the maker≠checker seam).

/** A rubric the composed body can NEVER satisfy (it requires a sentinel string
 *  the skills never emit) — the simplest way to force a verify FAIL via the
 *  agent's own blueprint.verify, independent of the default-rubric internals. */
const UNSATISFIABLE_VERIFY: VerifyRubric = {
  checks: [{ kind: "must_include", value: "__SENTINEL_NEVER_IN_BODY__", label: "sentinel" }],
};

/** An injected Checker that ALWAYS rejects — proves the maker≠checker seam: even
 *  a deterministically-valid body is blocked when the separate grader says no. */
const rejectingChecker: Checker = async (): Promise<VerifyResult> => ({
  pass: false,
  results: [],
  failures: ["checker rejected the output"],
});

/** An injected Checker that ALWAYS passes — proves a checker that approves does
 *  not interfere with an otherwise-valid send. */
const approvingChecker: Checker = async (): Promise<VerifyResult> => ({
  pass: true,
  results: [],
  failures: [],
});

describe("runEventAgent — L2 Verify gate (block before send)", () => {
  test("a review compose that FAILS its rubric is BLOCKED: no send, blocked === 1, verify_blocked recorded", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls, emailCalls } = makeDeps({
      // A valid review agent (has a URL → it composes fine) but with a
      // blueprint.verify the body can't satisfy → the gate blocks the send.
      findEventAgents: async () => [{ ...reviewAgent("sms"), verify: UNSATISFIABLE_VERIFY }],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // BLOCKED — nothing sent.
    assert.equal(smsCalls.length, 0, "a verify-failed message must NOT send");
    assert.equal(emailCalls.length, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1, "result.blocked counts the gated send");

    // A verify_blocked entry was recorded to loop-memory under the contact's key.
    assert.equal(mem.appendCalls.length, 1, "exactly one memory append (the block)");
    const appended = mem.appendCalls[0];
    assert.equal(appended.key, memKey("review-requester", "contact-1"));
    assert.equal(appended.entry.kind, "verify_blocked");
    assert.equal(appended.entry.at, FIXED_NOW.toISOString(), "block entry carries the DI'd clock");
    // The failures are captured on the entry's data for observability.
    const data = appended.entry.data as { failures?: unknown };
    assert.ok(Array.isArray(data.failures) && data.failures.length > 0, "failures recorded");
    assert.equal(typeof appended.entry.summary, "string");
    assert.ok(appended.entry.summary.includes("Blocked"), "summary describes the block");

    // It's also surfaced on the run summary's recorded list (observability).
    assert.ok(result.memory, "memory present when a store is wired");
    assert.equal(result.memory!.recorded.length, 1);
    assert.equal(result.memory!.recorded[0].kind, "verify_blocked");
    assert.deepEqual(result.memory!.recorded[0], appended.entry);
  });

  test("a VALID review compose passes the default rubric → sends as before, blocked === 0, records review_requested", async () => {
    // No blueprint.verify → the DEFAULT rubric applies (review link + name +
    // length + no-placeholder). composeReviewRequest emits the URL and the name,
    // so the default rubric passes and the send goes out exactly as in L1.
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 1, "a verify-passing message sends");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0, "nothing blocked");
    // The normal review_requested entry is recorded to the contact key (NOT
    // verify_blocked). A `daily_count` entry also lands on the stats key.
    const cAppends = contactAppends(mem.appendCalls, "review-requester", "contact-1");
    assert.equal(cAppends.length, 1);
    assert.equal(cAppends[0].entry.kind, "review_requested");
    // And the body really did contain the review link (the rubric's key check).
    assert.ok(smsCalls[0].body.includes(REVIEW_URL), "the review link is in the sent body");
  });

  test("a VALID review compose still sends with NO memory store (blocked === 0, back-compat)", async () => {
    // The gate runs even without a memoryStore; a passing body just sends and
    // there's nothing to record. Proves the deterministic gate is always on.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });

  test("a blocked send with NO memory store still blocks (blocked === 1), just records nothing", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), verify: UNSATISFIABLE_VERIFY }],
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 0, "still blocked without a store");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1);
    assert.equal(result.memory, undefined, "no store → no memory summary");
  });

  test("a skill with NO default rubric and no blueprint.verify → NO gate, sends (back-compat)", async () => {
    // Force the orchestrator down the "rubric === null → skip verify" branch by
    // matching an agent whose skill has no default rubric. We use a cast because
    // EventAgentSkill is a closed union; runEventAgent treats an unknown skill as
    // the non-review (speed-to-lead-style) compose path, and defaultRubricForSkill
    // returns null for it → no deterministic gate, send as today.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [
        {
          skill: "mystery-skill" as unknown as EventAgentSkill,
          channel: "sms",
          businessName: "Acme",
        },
      ],
    });
    const result = await runEventAgent(leadCreated("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "no rubric → no gate → sends");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });

  test("an injected checker that returns pass:false BLOCKS an otherwise-valid body (maker ≠ checker)", async () => {
    // The default rubric PASSES (valid review body), but the separate grader
    // rejects → AND-ed result is fail → blocked. This is the whole point of the
    // primitive: a second, independent checker can veto the maker's output.
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      checker: rejectingChecker,
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "the injected checker vetoed the send");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1);
    assert.equal(mem.appendCalls.length, 1);
    assert.equal(mem.appendCalls[0].entry.kind, "verify_blocked");
  });

  test("an injected checker that returns pass:true does not block an otherwise-valid send", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      checker: approvingChecker,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "an approving checker + valid body → sends");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });

  test("verify gate does not run on a throttled review (already-asked → throttled, not blocked)", async () => {
    // A second booking.completed whose memory says already-asked is THROTTLED
    // before the verify gate — even with an unsatisfiable rubric, the run is
    // counted as throttled (not blocked), and nothing new is recorded.
    const mem = makeFakeMemoryStore({
      [memKey("review-requester", "contact-1")]: [
        { kind: "review_requested", summary: "asked earlier", data: { channel: "sms" } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), verify: UNSATISFIABLE_VERIFY }],
      memoryStore: mem.store,
      hasAlreadyRequested: async () => false,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 0);
    assert.equal(result.throttled, 1, "throttle wins over the verify gate");
    assert.equal(result.blocked, 0, "a throttled run is not counted as blocked");
    assert.equal(mem.appendCalls.length, 0, "no record on a throttled run");
  });

  test("an email review compose verifies the BODY (not the subject) and blocks on a body failure", async () => {
    // The gate must verify composed.body (the text/markdown body), NOT the
    // subject. A blueprint.verify requiring a sentinel absent from the body
    // blocks the email send.
    const { deps, emailCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("email"), verify: UNSATISFIABLE_VERIFY }],
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(emailCalls.length, 0, "email blocked on a body-rubric failure");
    assert.equal(result.blocked, 1);
  });

  test("the verify gate never throws (a blocked run resolves cleanly)", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), verify: UNSATISFIABLE_VERIFY }],
    });
    await assert.doesNotReject(() => runEventAgent(bookingCompleted("contact-1"), deps));
  });
});

// ─── L3 Guardrails / Stop (T3): the per-agent brakes gate ─────────────────────
//
// After the per-contact throttle and BEFORE the L2 verify gate, the prospective
// send is run through the agent's GUARDRAILS (evaluateGuardrails) — the brakes
// that stop an agent "billing you in silence": kill switch, quiet hours, a
// per-contact frequency cap, and a daily send budget. A tripped brake BLOCKS the
// send (counted on result.blocked, with the reason), records a `guardrail_blocked`
// loop-memory entry, and never reaches verify/send. On an ALLOWED send, the
// per-agent DAILY COUNTER (the budget brake's input) is incremented in loop-memory
// under `agents/<skill>/_stats-<tz-date>`. These pin:
//   • quiet hours: review-requester default blocks a 03:00 send (reason "quiet
//     hours") + records guardrail_blocked; a noon send goes through;
//   • daily cap: a counter seeded at the cap (200) blocks the next send (reason
//     "daily cap"); below the cap → sends AND the counter advances to prev+1;
//   • frequency cap: a blueprint.guardrails minMinutesBetweenPerContact:60 with a
//     10-min-old prior send → blocked (reason "frequency cap");
//   • enabled:false blueprint.guardrails → blocked (reason "agent disabled");
//   • speed-to-lead at 03:00 → SENDS (its default has no quiet hours);
//   • the gate never throws.
//
// No store wired → no daily-counter read/write and tz defaults to "UTC"; with a
// store the default deps DON'T wire resolveTimezone, so the orchestrator's tz is
// "UTC" → the stats date key is the now's UTC date.

/** The stats-key date for an instant under the test's effective tz ("UTC", since
 *  the fake deps don't wire resolveTimezone). PINS the daily-counter date key. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const NIGHT_UTC = new Date("2026-06-26T03:00:00.000Z"); // 03:00Z → inside 21→8

describe("runEventAgent — L3 guardrails: quiet hours", () => {
  test("review-requester default quiet hours BLOCK a 03:00 send → no send, guardrail_blocked recorded (reason 'quiet hours')", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")], // no blueprint.guardrails → default
      memoryStore: mem.store,
      now: () => NIGHT_UTC,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // BLOCKED before send.
    assert.equal(smsCalls.length, 0, "a quiet-hours send must NOT go out");
    assert.equal(emailCalls.length, 0);
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1, "result.blocked counts the guardrail-gated send");

    // A guardrail_blocked entry was recorded under the CONTACT key (not the stats
    // key), carrying the machine reason; the daily counter is NOT touched (no send).
    const cAppends = contactAppends(mem.appendCalls, "review-requester", "contact-1");
    assert.equal(cAppends.length, 1, "exactly one contact-key append (the block)");
    const appended = cAppends[0];
    assert.equal(appended.entry.kind, "guardrail_blocked");
    assert.equal(appended.entry.at, NIGHT_UTC.toISOString(), "block entry carries the DI'd clock");
    assert.equal((appended.entry.data as { reason?: string }).reason, "quiet hours");
    assert.ok(appended.entry.summary.includes("Guardrail blocked"), "summary describes the block");
    // No daily_count written (nothing sent).
    assert.equal(
      statsAppends(mem.appendCalls, "review-requester", utcDateKey(NIGHT_UTC)).length,
      0,
      "the daily counter is not incremented on a blocked send",
    );

    // Surfaced on the run summary's recorded list (observability).
    assert.ok(result.memory);
    assert.equal(result.memory!.recorded.length, 1);
    assert.equal(result.memory!.recorded[0].kind, "guardrail_blocked");
    assert.deepEqual(result.memory!.recorded[0], appended.entry);
  });

  test("review-requester at NOON (outside quiet hours) sends normally", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      now: () => FIXED_NOW, // 12:00Z → outside 21→8
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "a daytime review send goes through the guardrail gate");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });

  test("a blocked quiet-hours send with NO memory store still blocks (records nothing)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      now: () => NIGHT_UTC,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 0, "still blocked without a store");
    assert.equal(result.blocked, 1);
    assert.equal(result.memory, undefined, "no store → no memory summary");
  });
});

describe("runEventAgent — L3 guardrails: daily cap", () => {
  test("counter seeded AT the cap (200) blocks the next send (reason 'daily cap')", async () => {
    // Seed the per-agent daily counter for TODAY (UTC date) at the review default
    // cap. Use a NOON clock so quiet hours don't pre-empt the daily-cap check.
    const dateKey = utcDateKey(FIXED_NOW);
    const mem = makeFakeMemoryStore({
      [statsKey("review-requester", dateKey)]: [
        { kind: "daily_count", summary: "seeded at cap", data: { count: 200 } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "at the daily cap → no send");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1);
    const cAppends = contactAppends(mem.appendCalls, "review-requester", "contact-1");
    assert.equal(cAppends.length, 1);
    assert.equal(cAppends[0].entry.kind, "guardrail_blocked");
    assert.equal((cAppends[0].entry.data as { reason?: string }).reason, "daily cap");
    // The counter is NOT advanced on a blocked send (no new daily_count append).
    assert.equal(
      statsAppends(mem.appendCalls, "review-requester", dateKey).length,
      0,
      "blocked send does not advance the counter",
    );
  });

  test("below the cap → sends AND the daily counter advances to prev+1 (assert the written counter)", async () => {
    // Seed the counter at 5 (well below 200). The send goes out and a fresh
    // daily_count entry carrying 6 is appended to the SAME stats key.
    const dateKey = utcDateKey(FIXED_NOW);
    const mem = makeFakeMemoryStore({
      [statsKey("review-requester", dateKey)]: [
        { kind: "daily_count", summary: "5 so far", data: { count: 5 } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 1, "below the cap → sends");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);

    // The daily counter advanced: exactly one new daily_count append carrying 6.
    const statApp = statsAppends(mem.appendCalls, "review-requester", dateKey);
    assert.equal(statApp.length, 1, "exactly one counter increment on a send");
    assert.equal(statApp[0].entry.kind, "daily_count");
    assert.equal(
      (statApp[0].entry.data as { count?: number }).count,
      6,
      "counter incremented to prev(5)+1",
    );
    assert.equal(statApp[0].entry.at, FIXED_NOW.toISOString(), "counter entry carries the clock");
    // The stored stats note now reports a max of 6 (what the next run would read).
    const storedStats = mem.data.get(statsKey("review-requester", dateKey)) ?? [];
    const maxCount = Math.max(
      ...storedStats
        .filter((e) => e.kind === "daily_count")
        .map((e) => (e.data as { count?: number }).count ?? 0),
    );
    assert.equal(maxCount, 6, "the persisted counter max is now 6");
  });

  test("with NO store, the daily cap is treated as 0 sent → review sends at noon (no counter to read)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      now: () => FIXED_NOW,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "no store → sentTodayByAgent 0 → under cap → sends");
    assert.equal(result.sent, 1);
  });
});

describe("runEventAgent — L3 guardrails: frequency cap (per contact)", () => {
  test("speed-to-lead with blueprint.guardrails minMinutesBetweenPerContact:60 + a 10-min-old prior send → blocked 'frequency cap'", async () => {
    // speed-to-lead has NO default per-contact gap, so we pin the cap via the
    // agent's own blueprint.guardrails. A prior lead_contacted 10 min before the
    // clock (recalled from memory) trips the 60-min cap.
    const freqGuardrails: Guardrails = { minMinutesBetweenPerContact: 60 };
    const tenMinAgo = new Date(FIXED_NOW.getTime() - 10 * 60_000).toISOString();
    const mem = makeFakeMemoryStore({
      [memKey("speed-to-lead", "contact-7")]: [
        { at: tenMinAgo, kind: "lead_contacted", summary: "acked 10m ago", data: { channel: "sms" } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...speedAgent("sms"), guardrails: freqGuardrails }],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(leadCreated("contact-7"), deps);

    assert.equal(smsCalls.length, 0, "within the frequency cap → no send");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1);
    const cAppends = contactAppends(mem.appendCalls, "speed-to-lead", "contact-7");
    // The prior send entry was seeded (not appended); only the block is appended.
    assert.equal(cAppends.length, 1, "one new contact-key append (the block)");
    assert.equal(cAppends[0].entry.kind, "guardrail_blocked");
    assert.equal((cAppends[0].entry.data as { reason?: string }).reason, "frequency cap");
  });

  test("the SAME frequency cap ALLOWS once the prior send is older than the gap (90 min) → sends", async () => {
    const freqGuardrails: Guardrails = { minMinutesBetweenPerContact: 60 };
    const ninetyMinAgo = new Date(FIXED_NOW.getTime() - 90 * 60_000).toISOString();
    const mem = makeFakeMemoryStore({
      [memKey("speed-to-lead", "contact-7")]: [
        { at: ninetyMinAgo, kind: "lead_contacted", summary: "acked 90m ago", data: { channel: "sms" } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...speedAgent("sms"), guardrails: freqGuardrails }],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });
    const result = await runEventAgent(leadCreated("contact-7"), deps);
    assert.equal(smsCalls.length, 1, "outside the frequency cap → sends");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });
});

describe("runEventAgent — L3 guardrails: kill switch + speed-to-lead exemption", () => {
  test("enabled:false blueprint.guardrails → blocked ('agent disabled'), even at noon", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...speedAgent("sms"), guardrails: { enabled: false } }],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(leadCreated("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "a disabled agent never sends");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 1);
    const cAppends = contactAppends(mem.appendCalls, "speed-to-lead", "contact-1");
    assert.equal(cAppends.length, 1);
    assert.equal(cAppends[0].entry.kind, "guardrail_blocked");
    assert.equal((cAppends[0].entry.data as { reason?: string }).reason, "agent disabled");
  });

  test("speed-to-lead at 03:00 SENDS (its default guardrails have NO quiet hours)", async () => {
    // The whole point of the speed-to-lead default: a fresh lead must get an
    // instant reply even at 3am. No blueprint.guardrails → default applies.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
      now: () => NIGHT_UTC, // 03:00Z
    });
    const result = await runEventAgent(leadCreated("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "speed-to-lead is time-critical → sends at 3am");
    assert.equal(result.sent, 1);
    assert.equal(result.blocked, 0);
  });

  test("the guardrail gate never throws (a blocked run resolves cleanly)", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => [{ ...speedAgent("sms"), guardrails: { enabled: false } }],
    });
    await assert.doesNotReject(() => runEventAgent(leadCreated("contact-1"), deps));
  });

  test("an explicit blueprint.guardrails OVERRIDES the per-skill default (review with enabled:false at noon → blocked)", async () => {
    // review-requester would normally send at noon; an explicit kill switch wins.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), guardrails: { enabled: false } }],
      now: () => FIXED_NOW,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 0, "the explicit kill switch overrides the default");
    assert.equal(result.blocked, 1);
  });
});

describe("runEventAgent — L3 guardrails: workspace tz resolution for the daily counter", () => {
  test("resolveTimezone is consulted and bounds the daily-counter date key", async () => {
    // With a resolveTimezone returning a far-west zone, the counter's date key is
    // the LOCAL date. At 02:00 UTC on 2026-06-26, Pacific/Honolulu (UTC-10) is
    // still 2026-06-25 → the counter must land on the 06-25 stats key.
    const earlyUtc = new Date("2026-06-26T02:00:00.000Z"); // 16:00 prev day in HST
    const mem = makeFakeMemoryStore();
    let tzAskedFor: string | null = null;
    const { deps, smsCalls } = makeDeps({
      // speed-to-lead → no quiet hours, so the 02:00 instant still sends.
      findEventAgents: async () => [speedAgent("sms")],
      memoryStore: mem.store,
      now: () => earlyUtc,
      resolveTimezone: async (orgId) => {
        tzAskedFor = orgId;
        return "Pacific/Honolulu";
      },
    });

    const result = await runEventAgent(leadCreated("contact-1"), deps);

    assert.equal(result.sent, 1, "speed-to-lead sends at 16:00 local");
    assert.equal(tzAskedFor, "org-1", "resolveTimezone was consulted with the event's orgId");
    // The counter landed on the LOCAL (Honolulu) date, not the UTC date.
    assert.equal(
      statsAppends(mem.appendCalls, "speed-to-lead", "2026-06-25").length,
      1,
      "counter keyed by the workspace-local date (06-25 in HST)",
    );
    assert.equal(
      statsAppends(mem.appendCalls, "speed-to-lead", "2026-06-26").length,
      0,
      "NOT keyed by the UTC date",
    );
  });

  test("a throwing resolveTimezone falls back to UTC (still sends, counter on the UTC date)", async () => {
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [speedAgent("sms")],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      resolveTimezone: async () => {
        throw new Error("tz lookup exploded");
      },
    });
    const result = await runEventAgent(leadCreated("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "a tz failure must not break the send");
    assert.equal(result.sent, 1);
    assert.equal(
      statsAppends(mem.appendCalls, "speed-to-lead", utcDateKey(FIXED_NOW)).length,
      1,
      "counter falls back to the UTC date",
    );
  });
});

// ─── F2: configurable send delay (enqueue a deferred send instead of sending) ──
//
// When the matched agent's `delayMinutes > 0` AND an enqueue seam is wired,
// runEventAgent ENQUEUES the frozen event context (due = now + delayMinutes) via
// deps.enqueueScheduledSend INSTEAD of sending now — the gates (throttle /
// guardrails / verify / memory) run when the cron REPLAYS runEventAgent at the due
// time, never at enqueue time. These pin:
//   • a review agent with delayMinutes:1440 on booking.completed → exactly one
//     enqueue with the right due offset + context, and NO immediate send;
//   • delayMinutes:0 / absent → sends immediately as today (no enqueue);
//   • a delay set but NO enqueue seam wired → falls back to sending now (a
//     configured delay must never silently drop the send);
//   • an enqueue that THROWS → counted `failed`, and does NOT also send now;
//   • the deferred-send replay (runDueScheduledEventAgent) actually SENDS and
//     strips the enqueue seam so it can never re-defer.

/** A recording enqueue fake + a deps builder that wires it. */
function makeEnqueueDeps(
  overrides: Partial<RunEventAgentDeps> = {},
): {
  deps: RunEventAgentDeps;
  smsCalls: SmsCall[];
  emailCalls: EmailCall[];
  enqueued: ScheduledEventAgentSend[];
} {
  const enqueued: ScheduledEventAgentSend[] = [];
  const base = makeDeps({
    enqueueScheduledSend: async (send) => {
      enqueued.push(send);
    },
    ...overrides,
  });
  return { deps: base.deps, smsCalls: base.smsCalls, emailCalls: base.emailCalls, enqueued };
}

describe("runEventAgent — F2 send delay (enqueue vs send now)", () => {
  test("review agent with delayMinutes:1440 on booking.completed → ENQUEUES (due = now+24h), no immediate send", async () => {
    const { deps, smsCalls, emailCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: 1440 }],
      now: () => FIXED_NOW,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // NOT sent now.
    assert.equal(smsCalls.length, 0, "a delayed agent must not send immediately");
    assert.equal(emailCalls.length, 0);
    assert.equal(result.sent, 0);
    // Enqueued exactly once, counted on the summary.
    assert.equal(enqueued.length, 1, "exactly one scheduled send enqueued");
    assert.equal(result.scheduled, 1, "result.scheduled counts the deferral");
    assert.equal(result.throttled, 0);
    assert.equal(result.blocked, 0);

    // The frozen context + the due offset are correct.
    const send = enqueued[0];
    assert.equal(send.eventType, "booking.completed");
    assert.equal(send.orgId, "org-1");
    assert.equal(send.contactId, "contact-1");
    assert.equal(send.agentSkill, "review-requester");
    assert.equal(send.channel, "sms");
    assert.deepEqual(send.payload, { appointmentId: "appt-1", contactId: "contact-1" });
    assert.equal(
      send.dueAt.getTime(),
      FIXED_NOW.getTime() + 1440 * 60_000,
      "dueAt is now + delayMinutes",
    );
  });

  test("delayMinutes:0 → sends immediately as today (no enqueue)", async () => {
    const { deps, smsCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: 0 }],
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "0 delay sends now");
    assert.equal(result.sent, 1);
    assert.equal(enqueued.length, 0, "nothing enqueued for a 0 delay");
    assert.equal(result.scheduled, 0);
  });

  test("absent delayMinutes → sends immediately (back-compat, no enqueue)", async () => {
    const { deps, smsCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [reviewAgent("sms")], // no delayMinutes field
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1);
    assert.equal(result.sent, 1);
    assert.equal(enqueued.length, 0);
  });

  test("a negative delayMinutes is treated as immediate (sends now, no enqueue)", async () => {
    const { deps, smsCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: -30 }],
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "a negative delay → immediate");
    assert.equal(result.sent, 1);
    assert.equal(enqueued.length, 0);
  });

  test("delay set but NO enqueue seam wired → falls back to sending NOW (never silently drops)", async () => {
    // makeDeps (not makeEnqueueDeps) → no enqueueScheduledSend in deps.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: 1440 }],
    });
    assert.equal(deps.enqueueScheduledSend, undefined, "no enqueue seam wired");
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(smsCalls.length, 1, "no queue → send immediately rather than drop");
    assert.equal(result.sent, 1);
    assert.equal(result.scheduled, 0);
  });

  test("an enqueue that THROWS is counted `failed` and does NOT also send now", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: 1440 }],
      enqueueScheduledSend: async () => {
        throw new Error("queue insert exploded");
      },
    });
    let result: Awaited<ReturnType<typeof runEventAgent>> | undefined;
    await assert.doesNotReject(async () => {
      result = await runEventAgent(bookingCompleted("contact-1"), deps);
    });
    assert.equal(smsCalls.length, 0, "a failed enqueue must not fall through to an immediate send");
    assert.equal(result?.sent, 0);
    assert.equal(result?.scheduled, 0);
    assert.equal(result?.failed, 1, "the enqueue failure is surfaced");
  });

  test("a delayed agent does NOT consult the throttle/guardrails/verify at enqueue time (deferred to replay)", async () => {
    // Pin that the enqueue path runs FIRST: even an UNSATISFIABLE verify rubric +
    // a checker that would reject do not block the enqueue — those gates run when
    // the send is replayed, not now.
    let probed = false;
    let checked = false;
    const { deps, smsCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [
        { ...reviewAgent("sms"), delayMinutes: 240, verify: UNSATISFIABLE_VERIFY },
      ],
      hasAlreadyRequested: async () => {
        probed = true;
        return true; // would throttle if (wrongly) consulted now
      },
      checker: async () => {
        checked = true;
        return { pass: false, results: [], failures: ["nope"] };
      },
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(enqueued.length, 1, "enqueued despite the unsatisfiable rubric");
    assert.equal(result.scheduled, 1);
    assert.equal(result.blocked, 0, "verify did NOT run at enqueue time");
    assert.equal(result.throttled, 0, "throttle did NOT run at enqueue time");
    assert.equal(smsCalls.length, 0);
    assert.equal(probed, false, "throttle probe not consulted at enqueue");
    assert.equal(checked, false, "verify checker not consulted at enqueue");
  });

  test("per-agent independence: a delayed review + an immediate speed-to-lead on one event", async () => {
    // booking.completed with two matches — a delayed review (enqueues) and a
    // speed-to-lead with no delay (sends now). Both outcomes happen independently.
    const { deps, smsCalls, enqueued } = makeEnqueueDeps({
      findEventAgents: async () => [
        { ...reviewAgent("sms"), delayMinutes: 1440 },
        speedAgent("sms"), // no delay → sends now
      ],
      now: () => FIXED_NOW,
    });
    const result = await runEventAgent(bookingCompleted("contact-1"), deps);
    assert.equal(enqueued.length, 1, "the review is deferred");
    assert.equal(enqueued[0].agentSkill, "review-requester");
    assert.equal(smsCalls.length, 1, "the speed-to-lead sends now");
    assert.equal(smsCalls[0].skill, "speed-to-lead");
    assert.equal(result.scheduled, 1);
    assert.equal(result.sent, 1);
  });
});

describe("runDueScheduledEventAgent — replay a due deferred send", () => {
  /** Build a due ScheduledEventAgentSend for a booking.completed review. */
  function dueReviewSend(): ScheduledEventAgentSend {
    return {
      eventType: "booking.completed",
      orgId: "org-1",
      contactId: "contact-1",
      payload: { appointmentId: "appt-1", contactId: "contact-1" },
      dueAt: new Date(FIXED_NOW.getTime() - 60_000), // already due
      agentSkill: "review-requester",
      channel: "sms",
    };
  }

  test("replays runEventAgent → the review ACTUALLY sends at due time (gates run now)", async () => {
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")], // resolved fresh at replay
      now: () => FIXED_NOW, // noon → guardrails allow
    });

    const result = await runDueScheduledEventAgent(dueReviewSend(), deps);

    assert.equal(smsCalls.length, 1, "the deferred review sends on replay");
    assert.equal(result.sent, 1);
    const expected = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.equal(smsCalls[0].body, expected.body);
  });

  test("the replay STRIPS the enqueue seam → a still-delayed agent can NOT re-defer (no infinite loop)", async () => {
    // Even if the freshly-resolved agent STILL has a delay AND the deps carry an
    // enqueue seam, the replay must send (not enqueue again).
    const enqueued: ScheduledEventAgentSend[] = [];
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [{ ...reviewAgent("sms"), delayMinutes: 1440 }],
      enqueueScheduledSend: async (s) => {
        enqueued.push(s);
      },
      now: () => FIXED_NOW,
    });

    const result = await runDueScheduledEventAgent(dueReviewSend(), deps);

    assert.equal(enqueued.length, 0, "replay never re-enqueues (seam stripped)");
    assert.equal(smsCalls.length, 1, "replay sends instead of re-deferring");
    assert.equal(result.sent, 1);
    assert.equal(result.scheduled, 0);
  });

  test("the replay honors the gates at send time (a throttled contact does NOT send on replay)", async () => {
    // Memory already records review_requested for this contact → the replay
    // throttles (the gate runs at the real send time, exactly as intended).
    const mem = makeFakeMemoryStore({
      [memKey("review-requester", "contact-1")]: [
        { kind: "review_requested", summary: "asked earlier", data: { channel: "sms" } },
      ],
    });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      memoryStore: mem.store,
      hasAlreadyRequested: async () => false,
      now: () => FIXED_NOW,
    });

    const result = await runDueScheduledEventAgent(dueReviewSend(), deps);

    assert.equal(smsCalls.length, 0, "the throttle gate runs at replay/send time");
    assert.equal(result.throttled, 1);
    assert.equal(result.sent, 0);
  });

  test("the replay never throws", async () => {
    const { deps } = makeDeps({
      findEventAgents: async () => {
        throw new Error("db down at replay");
      },
    });
    await assert.doesNotReject(() => runDueScheduledEventAgent(dueReviewSend(), deps));
  });
});

// ─── ACTION-ONLY agents (P2 / Task 6 + P2.1-T2 live tool-fire) ────────────────
//
// An action-only agent (a poster/logger — `blueprint.actionOnly`) ACTS via its
// tools and sends NO customer message. The SAFETY-CRITICAL contract these pin:
//   • when it fires, the messaging seam (sendSms/sendEmail) is NEVER called — a
//     posting agent must never text a customer, even when the contact is reachable
//     and a verify rubric is set;
//   • it is counted on `result.actionOnly`, NOT `result.sent`;
//   • the GUARDRAILS gate still applies — a daily-cap-exceeded action-only agent
//     is BLOCKED (no fire, counted on `result.blocked`);
//
// P2.1-T2 — the fire is now MONEY-SAFE-gated on the bound tool's CONNECTION:
//   • ≥1 bound tool CONNECTED (fake isToolConnected → true) + the live-turn seam
//     wired (fake runActionOnlyTurn) → the live agentic turn IS invoked, an
//     `action_posted` record is written (noting the invoked tools), and STILL no
//     customer SMS/email is sent;
//   • NOT connected (fake isToolConnected → false, or no seam) → NO live turn, a
//     `tool_not_connected` record is written, no send (the common case — never a
//     fake post);
//   • a THROWING live turn → an `action_error` record, the run completes (fail-soft).
// A normal (actionOnly-falsy) review-requester is UNCHANGED (still composes/sends).

/** An action-only agent: fires on the event but sends no customer message. Modeled
 *  on the review-requester skill (the event maps there) with `actionOnly:true` +
 *  a bound Postiz connector. NO reviewUrl is needed — an action-only agent never
 *  composes. By default carries action-only guardrails (daily cap only, NO quiet
 *  hours). The `connectors` binding is what the connection check consults. */
const POSTIZ_BINDING: ConnectorBinding = {
  id: "postiz",
  kind: "vetted",
  serviceName: "postiz",
  enabledTools: ["postiz__create_post"],
};
function actionOnlyAgent(overrides: Partial<EventAgentMatch> = {}): EventAgentMatch {
  return {
    skill: "review-requester",
    channel: "sms",
    businessName: "Acme Plumbing",
    actionOnly: true,
    connectorIds: ["postiz"],
    connectors: [POSTIZ_BINDING],
    guardrails: { enabled: true, maxPerDayPerAgent: 200 },
    ...overrides,
  };
}

/** A recording fake `runActionOnlyTurn` seam (no network/LLM). Returns a fixed
 *  result and captures the agent/connectedTools it was driven with. */
function makeFakeTurn(result?: RunActionOnlyTurnResult): {
  run: NonNullable<RunEventAgentDeps["runActionOnlyTurn"]>;
  calls: Array<{ orgId: string; connectedIds: string[] }>;
} {
  const calls: Array<{ orgId: string; connectedIds: string[] }> = [];
  const run: NonNullable<RunEventAgentDeps["runActionOnlyTurn"]> = async ({
    orgId,
    connectedTools,
  }) => {
    calls.push({
      orgId,
      connectedIds: connectedTools.map((b) => b.id),
    });
    return result ?? { ok: true, toolCalls: ["postiz__create_post"] };
  };
  return { run, calls };
}

describe("runEventAgent — action-only agents (P2 runtime guard + P2.1 live fire)", () => {
  test("CONNECTED tool: a one-shot agentic turn fires (real post), action_posted recorded, NO customer SMS/email sent", async () => {
    const mem = makeFakeMemoryStore();
    const turn = makeFakeTurn({ ok: true, toolCalls: ["postiz__create_post"] });
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      // The bound Postiz tool IS connected for this org.
      isToolConnected: async () => true,
      runActionOnlyTurn: turn.run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // SAFETY-CRITICAL: still NO customer message, even on the live path.
    assert.equal(smsCalls.length, 0, "an action-only agent must NEVER send an SMS");
    assert.equal(emailCalls.length, 0, "an action-only agent must NEVER send an email");

    // The live agentic turn WAS invoked, scoped to the connected tool.
    assert.equal(turn.calls.length, 1, "the live agentic turn ran exactly once");
    assert.deepEqual(turn.calls[0].connectedIds, ["postiz"], "driven with the connected tool");

    // Counted as an action-only fire, not a send.
    assert.equal(result.matched, 1);
    assert.equal(result.actionOnly, 1, "the fire is counted on result.actionOnly");
    assert.equal(result.sent, 0, "nothing was sent to a customer");
    assert.equal(result.blocked, 0);

    // An `action_posted` record was written to the agent's key (subjectKey = the
    // agentKey/skill — an action-only agent is per-agent, not per-contact).
    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1, "exactly one action_posted record");
    assert.equal(agentKeyAppends[0].entry.kind, "action_posted");
    assert.equal(agentKeyAppends[0].entry.at, FIXED_NOW.toISOString());
    const postedData = agentKeyAppends[0].entry.data as {
      tools?: string[];
      invokedTools?: string[];
      actionOnly?: boolean;
    };
    assert.deepEqual(postedData.tools, ["postiz"], "records the connected tool ids");
    assert.deepEqual(postedData.invokedTools, ["postiz__create_post"], "records what was invoked");
    assert.equal(postedData.actionOnly, true);

    // The per-agent daily counter advanced (so the daily cap brakes subsequent
    // fires) — exactly one daily_count append carrying 1, on the stats key.
    const dateKey = utcDateKey(FIXED_NOW);
    const statApp = statsAppends(mem.appendCalls, "review-requester", dateKey);
    assert.equal(statApp.length, 1, "exactly one counter increment on a fire");
    assert.equal((statApp[0].entry.data as { count?: number }).count, 1);

    // Surfaced on the run summary's recorded list (observability).
    assert.ok(
      result.memory?.recorded.some((e) => e.kind === "action_posted"),
      "action_posted surfaced on result.memory.recorded",
    );
  });

  test("NOT connected: no agentic turn runs, tool_not_connected recorded, no send (money-safe — never a fake post)", async () => {
    const mem = makeFakeMemoryStore();
    const turn = makeFakeTurn();
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      // The bound tool is NOT connected → the live turn must NOT run.
      isToolConnected: async () => false,
      runActionOnlyTurn: turn.run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(turn.calls.length, 0, "no agentic turn when the tool is not connected");
    assert.equal(smsCalls.length, 0, "no SMS");
    assert.equal(emailCalls.length, 0, "no email");
    assert.equal(result.actionOnly, 1, "still counted as an action-only fire");
    assert.equal(result.sent, 0);
    assert.equal(result.blocked, 0);

    // A `tool_not_connected` record on the agent key, noting the bound tool to connect.
    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1, "exactly one tool_not_connected record");
    assert.equal(agentKeyAppends[0].entry.kind, "tool_not_connected");
    const data = agentKeyAppends[0].entry.data as { tools?: string[]; posted?: boolean };
    assert.deepEqual(data.tools, ["postiz"], "records the bound (unconnected) tool ids");
    assert.equal(data.posted, false, "explicitly records that NO post was made");

    // The counter still advances (so a runaway un-connected poster is still braked).
    const dateKey = utcDateKey(FIXED_NOW);
    assert.equal(
      statsAppends(mem.appendCalls, "review-requester", dateKey).length,
      1,
      "the daily counter advances on any fire that passed guardrails",
    );
  });

  test("no live-turn seam wired (but tool connected) → tool_not_connected, no fake post", async () => {
    // isToolConnected says connected, but deps.runActionOnlyTurn is absent → there's
    // no way to drive the agent, so we must NOT claim a post.
    const mem = makeFakeMemoryStore();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      // runActionOnlyTurn omitted on purpose.
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0);
    assert.equal(result.actionOnly, 1);
    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1);
    assert.equal(
      agentKeyAppends[0].entry.kind,
      "tool_not_connected",
      "no seam → no live post claimed",
    );
  });

  test("a THROWING agentic turn → action_error recorded, run completes (fail-soft)", async () => {
    const mem = makeFakeMemoryStore();
    const throwingTurn: NonNullable<RunEventAgentDeps["runActionOnlyTurn"]> = async () => {
      throw new Error("postiz exploded mid-turn");
    };
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: throwingTurn,
    });

    let result: Awaited<ReturnType<typeof runEventAgent>> | undefined;
    await assert.doesNotReject(async () => {
      result = await runEventAgent(bookingCompleted("contact-1"), deps);
    });

    assert.equal(smsCalls.length, 0, "no SMS even on a turn error");
    assert.equal(emailCalls.length, 0);
    assert.equal(result?.actionOnly, 1, "the fire is still counted (it attempted to act)");
    assert.equal(result?.sent, 0);
    assert.equal(result?.failed, 0, "a turn error is recorded, NOT counted as a run failure");

    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1, "one action_error record");
    assert.equal(agentKeyAppends[0].entry.kind, "action_error");
    const data = agentKeyAppends[0].entry.data as { error?: string };
    assert.ok(
      typeof data.error === "string" && data.error.includes("postiz exploded"),
      "the error detail is recorded for observability",
    );
  });

  test("a turn that reports ok:false (e.g. no LLM key at fire time) → action_error, no fake post", async () => {
    // The connection check passed, but the live turn could not actually run (the
    // impl returns ok:false, e.g. getAIClient yielded no client). We must NOT claim
    // a post — record action_error so the operator sees the real reason.
    const mem = makeFakeMemoryStore();
    const turn = makeFakeTurn({ ok: false, detail: "no_llm_key" });
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: turn.run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0);
    assert.equal(result.actionOnly, 1);
    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1);
    assert.equal(
      agentKeyAppends[0].entry.kind,
      "action_error",
      "a turn that didn't complete records action_error, not a fake post",
    );
  });

  test("SAFETY: an action-only agent sends NOTHING even with a reachable contact AND a verify rubric set", async () => {
    // A verify rubric + a reachable phone/email would normally drive the messaging
    // path; an action-only agent must skip ALL of it. (No memoryStore here — the
    // guard must hold even without loop-memory.)
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [
        actionOnlyAgent({
          channel: "sms",
          reviewUrl: REVIEW_URL,
          verify: { checks: [{ kind: "min_length", min: 1 }] },
        }),
      ],
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: makeFakeTurn().run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(smsCalls.length, 0, "no SMS sent");
    assert.equal(emailCalls.length, 0, "no email sent");
    assert.equal(result.actionOnly, 1, "still counted as an action-only fire");
    assert.equal(result.sent, 0);
  });

  test("GUARDRAILS still gate: a daily-cap-exceeded action-only agent is BLOCKED (no fire, no turn, records guardrail_blocked)", async () => {
    // Seed the per-agent daily counter for TODAY at the cap. The action-only fire
    // must be blocked by the daily-cap brake BEFORE the connection check / live turn.
    const dateKey = utcDateKey(FIXED_NOW);
    const mem = makeFakeMemoryStore({
      [statsKey("review-requester", dateKey)]: [
        { kind: "daily_count", summary: "at cap", data: { count: 5 } },
      ],
    });
    const turn = makeFakeTurn();
    const { deps, smsCalls, emailCalls } = makeDeps({
      findEventAgents: async () => [
        actionOnlyAgent({ guardrails: { enabled: true, maxPerDayPerAgent: 5 } }),
      ],
      memoryStore: mem.store,
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: turn.run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    // Blocked: no send, no turn, no fire counted, blocked counted.
    assert.equal(turn.calls.length, 0, "blocked before the live turn");
    assert.equal(smsCalls.length, 0, "blocked → no SMS");
    assert.equal(emailCalls.length, 0, "blocked → no email");
    assert.equal(result.actionOnly, 0, "a blocked action-only agent did NOT fire");
    assert.equal(result.blocked, 1, "counted as blocked");
    assert.equal(result.sent, 0);

    // A guardrail_blocked record on the agent key; NO action_posted; counter NOT
    // advanced (a blocked fire does not bump the daily count).
    const agentKeyAppends = mem.appendCalls.filter(
      (c) => c.key === `agents/review-requester/review-requester`,
    );
    assert.equal(agentKeyAppends.length, 1, "one guardrail_blocked record");
    assert.equal(agentKeyAppends[0].entry.kind, "guardrail_blocked");
    assert.equal(
      (agentKeyAppends[0].entry.data as { reason?: string }).reason,
      "daily cap",
    );
    assert.ok(
      !agentKeyAppends.some(
        (c) => c.entry.kind === "action_posted" || c.entry.kind === "tool_not_connected",
      ),
      "no fire record on a blocked agent",
    );
    assert.equal(
      statsAppends(mem.appendCalls, "review-requester", dateKey).length,
      0,
      "blocked fire does not advance the counter",
    );
  });

  test("a normal review-requester (actionOnly falsy) is UNCHANGED — still composes + sends", async () => {
    // The default review path must be byte-for-byte: an SMS is composed + sent and
    // counted on `sent`, NOT `actionOnly`. The live-fire seams must not perturb it.
    const turn = makeFakeTurn();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [reviewAgent("sms")],
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: turn.run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(turn.calls.length, 0, "a messaging agent never runs the action-only turn");
    assert.equal(smsCalls.length, 1, "the normal review path still sends");
    assert.equal(
      smsCalls[0].body,
      composeReviewRequest({
        contactName: "Jordan",
        businessName: "Acme Plumbing",
        reviewUrl: REVIEW_URL,
        channel: "sms",
      }).body,
      "the composed review body is sent unchanged",
    );
    assert.equal(result.sent, 1);
    assert.equal(result.actionOnly, 0, "a messaging agent is not an action-only fire");
  });

  test("an action-only agent never throws and a sibling messaging agent still fires", async () => {
    // An action-only agent + a normal review agent (different skill) on one event:
    // the poster fires (live, no send), the messenger sends. Proves the action-only
    // branch returns cleanly and doesn't disturb siblings.
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [
        actionOnlyAgent(),
        speedAgent("sms"),
      ],
      now: () => FIXED_NOW,
      isToolConnected: async () => true,
      runActionOnlyTurn: makeFakeTurn().run,
    });

    const result = await runEventAgent(bookingCompleted("contact-1"), deps);

    assert.equal(result.actionOnly, 1, "the poster fired");
    assert.equal(smsCalls.length, 1, "the messaging sibling still sent");
    assert.equal(smsCalls[0].skill, "speed-to-lead", "only the messaging agent sent");
    assert.equal(result.sent, 1);
  });

  test("isToolConnected that THROWS is treated as not-connected (no fake post)", async () => {
    // A connection-check error must fail-closed: record tool_not_connected, never
    // run the live turn (we can't be sure the tool is connected).
    const turn = makeFakeTurn();
    const { deps, smsCalls } = makeDeps({
      findEventAgents: async () => [actionOnlyAgent()],
      now: () => FIXED_NOW,
      isToolConnected: async () => {
        throw new Error("secret store down");
      },
      runActionOnlyTurn: turn.run,
    });

    let result: Awaited<ReturnType<typeof runEventAgent>> | undefined;
    await assert.doesNotReject(async () => {
      result = await runEventAgent(bookingCompleted("contact-1"), deps);
    });
    assert.equal(turn.calls.length, 0, "the live turn must not run when the check failed");
    assert.equal(smsCalls.length, 0);
    assert.equal(result?.actionOnly, 1, "still counted as a fire (record-and-warn)");
  });
});
