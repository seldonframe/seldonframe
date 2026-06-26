// Event-agent "Send test" — the PURE compose-test helper.
//
// composeTestEventAgentMessage wraps the live skills (composeReviewRequest /
// composeSpeedToLead) and prefixes "[TEST] ". The load-bearing contract:
//   • review skill WITH a link → body contains the link AND the [TEST] marker;
//   • review skill WITHOUT a link → { ok:false, error:"review_link_required" }
//     (the action turns this into "set the review link first");
//   • speed-to-lead → an ack body with the [TEST] marker (no link needed);
//   • the marker is on the BODY (not the email subject).
//
// Run:
//   node --import tsx --test tests/unit/agents/triggers/test-message.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  composeTestEventAgentMessage,
  TEST_MESSAGE_PREFIX,
} from "../../../../src/lib/agents/triggers/test-message";

const REVIEW_URL = "https://g.page/r/acme-review";

describe("composeTestEventAgentMessage", () => {
  test("review-requester WITH a link → body has the link + [TEST] marker (sms)", () => {
    const res = composeTestEventAgentMessage({
      skill: "review-requester",
      channel: "sms",
      businessName: "Acme Plumbing",
      contactName: null,
      reviewUrl: REVIEW_URL,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return; // narrow
    assert.ok(
      res.body.startsWith(TEST_MESSAGE_PREFIX),
      `body should start with the test marker; got: ${res.body}`,
    );
    assert.ok(
      res.body.includes(REVIEW_URL),
      `body must contain the review link; got: ${res.body}`,
    );
  });

  test("review-requester WITHOUT a link → ok:false review_link_required", () => {
    for (const reviewUrl of [undefined, null, "", "   "]) {
      const res = composeTestEventAgentMessage({
        skill: "review-requester",
        channel: "sms",
        businessName: "Acme",
        reviewUrl,
      });
      assert.equal(res.ok, false, `reviewUrl=${JSON.stringify(reviewUrl)}`);
      if (res.ok) return;
      assert.equal(res.error, "review_link_required");
    }
  });

  test("review-requester email → marker on the BODY, not the subject", () => {
    const res = composeTestEventAgentMessage({
      skill: "review-requester",
      channel: "email",
      businessName: "Acme",
      contactName: "Dana",
      reviewUrl: REVIEW_URL,
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.body.startsWith(TEST_MESSAGE_PREFIX));
    assert.ok(res.body.includes(REVIEW_URL));
    // The subject must NOT carry the [TEST] marker (it's a body-only tag).
    assert.ok(typeof res.subject === "string" && res.subject.length > 0);
    assert.ok(
      !res.subject!.includes(TEST_MESSAGE_PREFIX.trim()),
      `subject should not carry the marker; got: ${res.subject}`,
    );
  });

  test("speed-to-lead → ack body with [TEST] marker, no link required", () => {
    const res = composeTestEventAgentMessage({
      skill: "speed-to-lead",
      channel: "sms",
      businessName: "Acme",
      contactName: "Sam",
      leadSummary: "a leaking water heater",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.body.startsWith(TEST_MESSAGE_PREFIX));
    // The speed-to-lead ack references being in touch shortly.
    assert.match(res.body.toLowerCase(), /in touch/);
  });

  test("missing name/business still composes (generic, no null leak)", () => {
    const res = composeTestEventAgentMessage({
      skill: "speed-to-lead",
      channel: "sms",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(!/null|undefined/i.test(res.body), `no null leak: ${res.body}`);
  });
});
