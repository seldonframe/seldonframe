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
} from "../../../../src/lib/agents/triggers/run-event-agent";
import { composeReviewRequest } from "../../../../src/lib/agents/skills/review-requester";
import { composeSpeedToLead } from "../../../../src/lib/agents/skills/speed-to-lead";
import {
  type AgentMemoryEntry,
  type AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";

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

    // recorded exactly one review_requested entry for that contact
    assert.equal(mem.appendCalls.length, 1, "exactly one memory append");
    const appended = mem.appendCalls[0];
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
    assert.equal(mem.appendCalls.length, 1, "speed-to-lead records too");
    const appended = mem.appendCalls[0];
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
    assert.equal(mem.appendCalls.length, 2, "each ack is recorded");
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
    // It matches what the store actually appended (observability is faithful).
    assert.equal(mem.appendCalls.length, 1);
    assert.deepEqual(recorded, mem.appendCalls[0].entry);
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
