// Unified Agent Model — P1, Task T3: the speed-to-lead skill.
//
// composeSpeedToLead is a PURE message composer (no I/O, never throws): the
// instant "we got your inquiry, we'll be in touch" acknowledgement a business
// fires the moment a lead lands (the event-trigger → outbound case). These tests
// pin the contract:
//   • the body acknowledges the inquiry AND names a next step;
//   • the business name is used for the sign-off (it's who the lead hears from);
//   • SMS is short + subject-less; email carries a subject;
//   • every field is optional — missing name/business/summary degrade gracefully
//     with no "null"/"undefined" leaking into customer-facing copy.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeSpeedToLead } from "../../../../src/lib/agents/skills/speed-to-lead";

describe("composeSpeedToLead — acknowledges the lead", () => {
  test("sms body acknowledges the inquiry and signs off as the business", () => {
    const out = composeSpeedToLead({
      contactName: "Sam",
      businessName: "Acme Plumbing",
      channel: "sms",
      leadSummary: "leaking water heater",
    });
    assert.ok(out.body.trim().length > 0);
    // "got"/"received"/"thanks" — some acknowledgement of receipt.
    assert.ok(/\b(got|receiv|thank|reach|hear)/i.test(out.body), "body should acknowledge receipt");
    assert.ok(out.body.includes("Acme Plumbing"), "should sign off as the business");
  });

  test("email body acknowledges and names a next step", () => {
    const out = composeSpeedToLead({
      contactName: "Sam",
      businessName: "Acme Plumbing",
      channel: "email",
      leadSummary: "leaking water heater",
    });
    assert.ok(/\b(shortly|soon|touch|back to you|reach)/i.test(out.body), "body should name a next step");
  });
});

describe("composeSpeedToLead — channel shape", () => {
  test("sms has no subject and stays reasonably short", () => {
    const out = composeSpeedToLead({
      contactName: "Sam",
      businessName: "Acme Plumbing",
      channel: "sms",
      leadSummary: null,
    });
    assert.equal(out.subject, undefined, "sms must not carry a subject");
    assert.ok(out.body.length <= 320, `sms body too long: ${out.body.length}`);
  });

  test("email carries a non-empty subject", () => {
    const out = composeSpeedToLead({
      contactName: "Sam",
      businessName: "Acme Plumbing",
      channel: "email",
      leadSummary: null,
    });
    assert.ok(out.subject && out.subject.trim().length > 0, "email needs a subject");
    assert.ok(out.body.trim().length > 0);
  });
});

describe("composeSpeedToLead — uses the business name", () => {
  test("business name appears in the email copy", () => {
    const out = composeSpeedToLead({
      contactName: "Sam",
      businessName: "Greenwood Landscaping",
      channel: "email",
      leadSummary: "tree removal quote",
    });
    const blob = `${out.subject ?? ""} ${out.body}`;
    assert.ok(blob.includes("Greenwood Landscaping"), "business name should appear");
  });

  test("greets the contact by name when present", () => {
    const out = composeSpeedToLead({
      contactName: "Priya",
      businessName: "Acme Plumbing",
      channel: "sms",
      leadSummary: null,
    });
    assert.ok(out.body.includes("Priya"), "should greet the contact by name");
  });
});

describe("composeSpeedToLead — graceful with missing fields", () => {
  test("no name / no business / no summary → still a valid message", () => {
    const out = composeSpeedToLead({
      contactName: null,
      businessName: null,
      channel: "sms",
      leadSummary: null,
    });
    assert.ok(out.body.trim().length > 0, "must still produce a body");
    assert.ok(!/null|undefined/i.test(out.body), "no null/undefined leakage");
  });

  test("missing fields across all permutations never leak null/undefined", () => {
    const names = [null, undefined, "", "  Dana  "] as const;
    const biz = [null, undefined, "", "Acme"] as const;
    const summary = [null, undefined, "", "broken sink"] as const;
    for (const channel of ["sms", "email"] as const) {
      for (const n of names)
        for (const b of biz)
          for (const s of summary) {
            const out = composeSpeedToLead({
              contactName: n,
              businessName: b,
              channel,
              leadSummary: s,
            });
            const blob = `${out.subject ?? ""} ${out.body}`;
            assert.ok(!/null|undefined/i.test(blob), `leak for ${JSON.stringify({ n, b, s, channel })}`);
            assert.ok(out.body.trim().length > 0);
            if (channel === "sms") assert.equal(out.subject, undefined);
          }
    }
  });

  test("never throws", () => {
    assert.doesNotThrow(() =>
      composeSpeedToLead({ contactName: null, businessName: null, channel: "email", leadSummary: null }),
    );
  });
});
