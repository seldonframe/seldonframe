// no_pii_leak PHONE_PATTERN regression — the 2026-07-03 hole.
//
// The original pattern could not match a bare US "555-123-4567" (lazy
// country-code digits with no required separator made every allocation
// collide with the dashes), so bare 10-digit numbers leaked straight through
// the production PII validator. Found by Task 5 of the improve-verb build;
// this spec pins the corrected behavior. Case 1 FAILS on the old pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { ALL_VALIDATORS } from "../../../src/lib/agents/validators";

const noPiiLeak = ALL_VALIDATORS.find((v) => v.name === "no_pii_leak");
if (!noPiiLeak) throw new Error("no_pii_leak validator missing from ALL_VALIDATORS");

function run(args: { response: string; userMessage?: string; conversationContext?: string; soul?: { contact?: { email?: string; phone?: string } } }) {
  return noPiiLeak!.run({
    response: args.response,
    userMessage: args.userMessage ?? "hi",
    conversationContext: args.conversationContext,
    soul: args.soul,
  } as Parameters<typeof noPiiLeak.run>[0]);
}

describe("no_pii_leak phone detection", () => {
  test("REGRESSION: a bare untrusted 555-123-4567 is caught as a leak", () => {
    const result = run({ response: "Sure — call Mrs. Alvarez at 555-123-4567." });
    assert.equal(result.passed, false);
  });

  test("a bare (555) 123-4567 with parens is caught", () => {
    const result = run({ response: "Her number is (555) 123-4567." });
    assert.equal(result.passed, false);
  });

  test("+1 formatted numbers are still caught", () => {
    const result = run({ response: "Reach them at +1 555-123-4567." });
    assert.equal(result.passed, false);
  });

  test("a number the CUSTOMER gave this turn is trusted, not a leak", () => {
    const result = run({
      response: "Got it — we'll call you back at 555-123-4567.",
      userMessage: "My number is 555-123-4567",
    });
    assert.equal(result.passed, true);
  });

  test("the business's own soul.contact.phone is trusted", () => {
    const result = run({
      response: "You can reach us at 555-987-6543 anytime.",
      soul: { contact: { phone: "555-987-6543" } },
    });
    assert.equal(result.passed, true);
  });

  test("no contact data at all passes", () => {
    const result = run({ response: "We open at 9am tomorrow — see you then!" });
    assert.equal(result.passed, true);
  });
});
