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
