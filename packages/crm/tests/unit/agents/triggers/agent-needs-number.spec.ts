// P2.1-T3 — agentNeedsNumber: does a deployed agent need its OWN dedicated phone
// number on activation, or does it activate phone-less (sending from the client
// org's shared number)?
//
// The rule (see agent-trigger.ts):
//   • inbound voice/sms                      → TRUE  (they RECEIVE on a phone
//                                               line/number)
//   • inbound chat/email                     → FALSE (a web widget / an inbox,
//                                               neither is a phone number)
//   • event whose slug is inbound-ish (missed_call) → TRUE  (forward-in + text-back)
//   • event that is pure-outbound (booking.completed / lead.created / invoice.paid)
//                                            → FALSE (only SENDS)
//   • schedule (social posters / digests)    → FALSE (only SENDS / posts)
//
// `agentNeedsNumber` takes a RESOLVED AgentTrigger (the union), so these tests
// pass well-formed triggers directly. The loose/stored → resolved path is covered
// by agent-trigger.spec.ts (resolveAgentTrigger) and by the margin-layer
// deploymentNeedsNumber tests (deployment-needs-number.spec.ts).
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/agents/triggers/agent-needs-number.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  agentNeedsNumber,
  type AgentTrigger,
} from "../../../../src/lib/agents/triggers/agent-trigger";

describe("agentNeedsNumber", () => {
  test("inbound voice/sms → true (they RECEIVE on a phone line/number)", () => {
    const channels = ["voice", "sms"] as const;
    for (const channel of channels) {
      assert.equal(
        agentNeedsNumber({ kind: "inbound", channel }),
        true,
        `inbound/${channel} should need a number`,
      );
    }
  });

  test("inbound chat/email → false (a web widget / an inbox, not a phone number)", () => {
    // The C-2 fix: these used to be channel-blindly TRUE (any inbound channel),
    // which made a chat-surface deploy incorrectly hit phone_required.
    const channels = ["chat", "email"] as const;
    for (const channel of channels) {
      assert.equal(
        agentNeedsNumber({ kind: "inbound", channel }),
        false,
        `inbound/${channel} should NOT need a number`,
      );
    }
  });

  test("event 'missed_call' → true (it forwards-in + texts-back)", () => {
    assert.equal(
      agentNeedsNumber({ kind: "event", event: "missed_call", channel: "sms" }),
      true,
    );
    // The channel doesn't change the rule — it's the inbound-ish EVENT that does.
    assert.equal(
      agentNeedsNumber({ kind: "event", event: "missed_call", channel: "email" }),
      true,
    );
  });

  test("pure-outbound events → false (they only SEND)", () => {
    const outboundEvents = [
      "booking.completed",
      "lead.created",
      "invoice.paid",
    ];
    for (const event of outboundEvents) {
      assert.equal(
        agentNeedsNumber({ kind: "event", event, channel: "sms" }),
        false,
        `${event} should NOT need a number`,
      );
    }
  });

  test("schedule (social poster / digest) → false", () => {
    assert.equal(
      agentNeedsNumber({ kind: "schedule", cron: "0 8 * * 1", channel: "digest" }),
      false,
    );
    assert.equal(
      agentNeedsNumber({ kind: "schedule", cron: "0 9 * * *", channel: "email" }),
      false,
    );
  });

  test("an unknown event slug is treated as pure-outbound → false", () => {
    // Only events we POSITIVELY know are inbound-ish (missed_call) flip to true;
    // an unrecognized event slug defaults to phone-less (it can't receive calls).
    assert.equal(
      agentNeedsNumber({ kind: "event", event: "deal.won", channel: "sms" } as AgentTrigger),
      false,
    );
  });
});
