// Event-agent activity — the PURE fold summarizeEventAgentActivity.
//
// Pinned contract:
//   • a SEND row tagged "agent:<skill>" → a `sent` row; ":test" suffix → isTest;
//   • a non-agent source → DROPPED;
//   • a scheduled row maps status → outcome (pending→scheduled, failed→blocked,
//     sent→sent, skipped→skipped), and a blocked row carries lastError as detail;
//   • the merged feed is sorted NEWEST-FIRST across BOTH sources;
//   • `limit` caps the merged result.
//
// Run:
//   node --import tsx --test tests/unit/agents/triggers/activity.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  summarizeEventAgentActivity,
  parseAgentSource,
  type EventAgentSendRow,
  type EventAgentScheduledRow,
} from "../../../../src/lib/agents/triggers/activity";

describe("parseAgentSource", () => {
  test("agent:<skill> → skill, not a test", () => {
    assert.deepEqual(parseAgentSource("agent:review-requester"), {
      skill: "review-requester",
      isTest: false,
    });
  });
  test("agent:<skill>:test → skill + isTest", () => {
    assert.deepEqual(parseAgentSource("agent:speed-to-lead:test"), {
      skill: "speed-to-lead",
      isTest: true,
    });
  });
  test("non-agent / malformed → empty skill", () => {
    assert.equal(parseAgentSource("api").skill, "");
    assert.equal(parseAgentSource("missed-call-text-back").skill, "");
    assert.equal(parseAgentSource("").skill, "");
  });
});

describe("summarizeEventAgentActivity", () => {
  test("folds sends (drops non-agent) + tags tests", () => {
    const sends: EventAgentSendRow[] = [
      {
        source: "agent:review-requester",
        channel: "sms",
        contactName: "Dana Lee",
        toAddress: "+15550001111",
        at: "2026-06-26T10:00:00.000Z",
      },
      {
        source: "agent:speed-to-lead:test",
        channel: "sms",
        contactName: null,
        toAddress: "+15550002222",
        at: "2026-06-26T11:00:00.000Z",
      },
      {
        // Not an event-agent send → dropped.
        source: "api",
        channel: "sms",
        toAddress: "+15550003333",
        at: "2026-06-26T12:00:00.000Z",
      },
    ];
    const rows = summarizeEventAgentActivity({ sends });
    assert.equal(rows.length, 2);
    // Newest-first: the 11:00 test send leads.
    assert.equal(rows[0].skill, "speed-to-lead");
    assert.equal(rows[0].outcome, "sent");
    assert.equal(rows[0].isTest, true);
    assert.equal(rows[0].detail, "Operator test");
    // Falls back to the raw address when no contact name.
    assert.equal(rows[0].contactLabel, "+15550002222");
    // The review send: contact name used.
    assert.equal(rows[1].skill, "review-requester");
    assert.equal(rows[1].isTest, false);
    assert.equal(rows[1].contactLabel, "Dana Lee");
  });

  test("maps scheduled statuses to outcomes (+ blocked detail)", () => {
    const scheduled: EventAgentScheduledRow[] = [
      {
        agentSkill: "review-requester",
        channel: "sms",
        status: "pending",
        contactName: "Pending Pat",
        dueAt: "2026-06-27T09:00:00.000Z",
      },
      {
        agentSkill: "review-requester",
        channel: "email",
        status: "failed",
        contactName: "Blocked Bob",
        dueAt: "2026-06-26T09:00:00.000Z",
        lastError: "quiet hours",
      },
      {
        agentSkill: "speed-to-lead",
        channel: "sms",
        status: "skipped",
        dueAt: "2026-06-25T09:00:00.000Z",
      },
    ];
    const rows = summarizeEventAgentActivity({ scheduled });
    assert.equal(rows.length, 3);
    // Newest-first by dueAt.
    assert.equal(rows[0].outcome, "scheduled");
    assert.equal(rows[1].outcome, "blocked");
    assert.equal(rows[1].detail, "quiet hours");
    assert.equal(rows[2].outcome, "skipped");
  });

  test("merges + sorts both sources newest-first", () => {
    const sends: EventAgentSendRow[] = [
      {
        source: "agent:review-requester",
        channel: "sms",
        at: "2026-06-26T10:00:00.000Z",
      },
    ];
    const scheduled: EventAgentScheduledRow[] = [
      {
        agentSkill: "speed-to-lead",
        channel: "sms",
        status: "pending",
        dueAt: "2026-06-26T15:00:00.000Z",
      },
    ];
    const rows = summarizeEventAgentActivity({ sends, scheduled });
    assert.equal(rows.length, 2);
    // 15:00 scheduled is newer than the 10:00 send.
    assert.equal(rows[0].outcome, "scheduled");
    assert.equal(rows[1].outcome, "sent");
  });

  test("limit caps the merged result to the most-recent N", () => {
    const sends: EventAgentSendRow[] = Array.from({ length: 5 }, (_, i) => ({
      source: "agent:review-requester",
      channel: "sms" as const,
      at: `2026-06-26T1${i}:00:00.000Z`,
    }));
    const rows = summarizeEventAgentActivity({ sends }, 2);
    assert.equal(rows.length, 2);
    // The two newest (14:00, 13:00).
    assert.equal(rows[0].when, "2026-06-26T14:00:00.000Z");
    assert.equal(rows[1].when, "2026-06-26T13:00:00.000Z");
  });

  test("empty input → empty feed (never throws)", () => {
    assert.deepEqual(summarizeEventAgentActivity({}), []);
  });
});
