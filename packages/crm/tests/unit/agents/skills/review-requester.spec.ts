// Unified Agent Model — P1, Task T3: the review-requester skill.
//
// composeReviewRequest is a PURE message composer (no I/O, never throws): given
// a contact/business/reviewUrl and a channel, it returns the copy for a warm,
// on-brand "leave us a Google review" ask. These tests pin the contract the
// trigger→skill pipeline relies on:
//   • the review URL is ALWAYS in the body (the ask is useless without it);
//   • the SMS body stays short (≤ 320 chars — two segments) so it actually sends;
//   • the contact's name is used when present, and a missing name degrades to a
//     generic-but-valid greeting (no "Hi null" / "Hi undefined");
//   • the email variant carries a subject; SMS does not.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeReviewRequest } from "../../../../src/lib/agents/skills/review-requester";

const REVIEW_URL = "https://g.page/r/acme-plumbing/review";

describe("composeReviewRequest — the link is always present", () => {
  test("sms body contains the review url", () => {
    const out = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.ok(out.body.includes(REVIEW_URL), "sms body must include the review url");
  });

  test("email body contains the review url", () => {
    const out = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "email",
    });
    assert.ok(out.body.includes(REVIEW_URL), "email body must include the review url");
  });

  test("the link survives even when name + business are missing", () => {
    const out = composeReviewRequest({
      contactName: null,
      businessName: null,
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.ok(out.body.includes(REVIEW_URL));
    assert.ok(out.body.trim().length > 0);
  });
});

describe("composeReviewRequest — SMS shape", () => {
  test("sms body is short (≤ 320 chars) and has no subject", () => {
    const out = composeReviewRequest({
      contactName: "Alexandria",
      businessName: "Greenwood Landscaping & Tree Care",
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.ok(out.body.length <= 320, `sms body too long: ${out.body.length}`);
    assert.equal(out.subject, undefined, "sms must not carry a subject");
  });

  test("sms stays ≤ 320 chars even with a very long contact + business name", () => {
    const out = composeReviewRequest({
      contactName: "Bartholomew Alexander Montgomery-Fitzgerald III",
      businessName:
        "The Extraordinarily Long-Named Premium Artisanal Coffee Roasting Company of Greater Metropolitan Springfield",
      reviewUrl: REVIEW_URL,
      channel: "sms",
    });
    assert.ok(out.body.length <= 320, `sms body too long: ${out.body.length}`);
    assert.ok(out.body.includes(REVIEW_URL));
  });
});

describe("composeReviewRequest — greeting personalization", () => {
  test("uses the contact name when present", () => {
    const out = composeReviewRequest({
      contactName: "Priya",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "email",
    });
    assert.ok(out.body.includes("Priya"), "body should greet the contact by name");
  });

  test("missing name → generic greeting, no null/undefined leakage", () => {
    for (const name of [null, undefined, "", "   "] as const) {
      const out = composeReviewRequest({
        contactName: name,
        businessName: "Acme Plumbing",
        reviewUrl: REVIEW_URL,
        channel: "email",
      });
      assert.ok(!/null|undefined/i.test(out.body), `leaked null/undefined for name=${JSON.stringify(name)}`);
      assert.ok(out.body.trim().length > 0);
    }
  });
});

describe("composeReviewRequest — email shape", () => {
  test("email has a non-empty subject and a body", () => {
    const out = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "email",
    });
    assert.ok(out.subject && out.subject.trim().length > 0, "email needs a subject");
    assert.ok(out.body.trim().length > 0, "email needs a body");
  });

  test("business name appears in the email copy when provided", () => {
    const out = composeReviewRequest({
      contactName: "Jordan",
      businessName: "Acme Plumbing",
      reviewUrl: REVIEW_URL,
      channel: "email",
    });
    const blob = `${out.subject ?? ""} ${out.body}`;
    assert.ok(blob.includes("Acme Plumbing"), "business name should appear somewhere");
  });
});

describe("composeReviewRequest — never throws", () => {
  test("tolerates an empty reviewUrl without throwing", () => {
    assert.doesNotThrow(() =>
      composeReviewRequest({
        contactName: null,
        businessName: null,
        reviewUrl: "",
        channel: "sms",
      }),
    );
  });
});
