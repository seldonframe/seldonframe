// Agent Loop — L2 Verify (maker ≠ checker) — Task T2: per-skill DEFAULT rubrics.
//
// default-rubrics.ts is the per-skill POLICY on top of the verify ENGINE. These
// tests pin the contract:
//   • "review-requester" WITH a reviewUrl + contactName → a must_include for the
//     URL + a must_include_any for the name + the always-on max_length 320 +
//     must_not_include "{";
//   • "review-requester" with NO ctx → ONLY max_length 320 + must_not_include "{"
//     (NO unsatisfiable URL/name check — an unknown link must not add a check
//     that fails every message; the gate handles "no URL → skip the ask");
//   • a single-word contactName collapses the must_include_any values to one
//     (deduped);
//   • "speed-to-lead" → exactly [min_length 1, max_length 320, must_not_include
//     "{"], regardless of ctx;
//   • an unknown skill → null.
//
// The rubrics it returns are also asserted to actually GATE as intended by
// feeding them through the real engine (runDeterministicChecks), so a default
// rubric can't silently encode an unsatisfiable or no-op check.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { defaultRubricForSkill } from "../../../../src/lib/agents/verify/default-rubrics";
import {
  runDeterministicChecks,
  type VerifyCheck,
} from "../../../../src/lib/agents/verify/agent-verify";

const REVIEW_URL = "https://g.page/r/abc123/review";

/** Find the single check of a given kind in a rubric (or undefined). */
function check<K extends VerifyCheck["kind"]>(
  checks: VerifyCheck[],
  kind: K,
): Extract<VerifyCheck, { kind: K }> | undefined {
  return checks.find((c) => c.kind === kind) as
    | Extract<VerifyCheck, { kind: K }>
    | undefined;
}

describe("defaultRubricForSkill — review-requester", () => {
  test("WITH reviewUrl + contactName → must_include(URL) + must_include_any(name) + max_length 320 + must_not_include {", () => {
    const rubric = defaultRubricForSkill("review-requester", {
      reviewUrl: REVIEW_URL,
      contactName: "Jordan Lee",
    });
    assert.ok(rubric, "expected a rubric, got null");

    // must_include for the review link, naming it
    const inc = check(rubric.checks, "must_include");
    assert.ok(inc, "expected a must_include for the review link");
    assert.equal(inc.value, REVIEW_URL);
    assert.equal(inc.label, "review link");

    // must_include_any for the name — full name + first token
    const any = check(rubric.checks, "must_include_any");
    assert.ok(any, "expected a must_include_any for the contact name");
    assert.deepEqual(any.values, ["Jordan Lee", "Jordan"]);
    assert.equal(any.label, "contact name");

    // always-on length cap
    const max = check(rubric.checks, "max_length");
    assert.ok(max && max.max === 320, "expected max_length 320");

    // always-on placeholder guard
    const noPlaceholder = check(rubric.checks, "must_not_include");
    assert.ok(noPlaceholder && noPlaceholder.value === "{", "expected must_not_include {");

    // exactly the four checks, in order
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["must_include", "must_include_any", "max_length", "must_not_include"],
    );

    // and it actually gates: a well-formed ask passes, a leaky/missing one fails
    const good = `Hi Jordan! Thanks for choosing us — mind leaving a quick review? ${REVIEW_URL}`;
    assert.equal(runDeterministicChecks(good, rubric).pass, true);
    const missingLink = "Hi Jordan! Please leave us a review.";
    assert.equal(runDeterministicChecks(missingLink, rubric).pass, false);
  });

  test("with NO ctx → ONLY max_length 320 + must_not_include { (no unsatisfiable URL/name check)", () => {
    const rubric = defaultRubricForSkill("review-requester");
    assert.ok(rubric, "expected a rubric, got null");

    // exactly the two always-on checks — no URL/name check was added
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["max_length", "must_not_include"],
    );
    assert.equal(check(rubric.checks, "must_include"), undefined, "no must_include without a URL");
    assert.equal(
      check(rubric.checks, "must_include_any"),
      undefined,
      "no must_include_any without a name",
    );

    const max = check(rubric.checks, "max_length");
    assert.ok(max && max.max === 320);
    const noPlaceholder = check(rubric.checks, "must_not_include");
    assert.ok(noPlaceholder && noPlaceholder.value === "{");

    // CRITICAL: with no URL known, an ordinary message still PASSES (the rubric
    // is not unsatisfiable — it didn't add a check for a link we don't have).
    const plain = "Thanks so much for your business today — we appreciate you!";
    assert.equal(
      runDeterministicChecks(plain, rubric).pass,
      true,
      "no-ctx rubric must be satisfiable by a plain message",
    );
  });

  test("with ONLY a reviewUrl → adds the link check but no name check", () => {
    const rubric = defaultRubricForSkill("review-requester", { reviewUrl: REVIEW_URL });
    assert.ok(rubric);
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["must_include", "max_length", "must_not_include"],
    );
  });

  test("a single-word contactName collapses the must_include_any values to one (deduped)", () => {
    const rubric = defaultRubricForSkill("review-requester", { contactName: "Jordan" });
    assert.ok(rubric);
    const any = check(rubric.checks, "must_include_any");
    assert.ok(any, "expected a must_include_any for the contact name");
    assert.deepEqual(any.values, ["Jordan"], "single-word name should not duplicate");
    // no link check (no URL), so: name + max + placeholder
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["must_include_any", "max_length", "must_not_include"],
    );
  });

  test("null-ish ctx values (reviewUrl/contactName = null) behave like absent", () => {
    const rubric = defaultRubricForSkill("review-requester", {
      reviewUrl: null,
      contactName: null,
    });
    assert.ok(rubric);
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["max_length", "must_not_include"],
    );
  });

  test("channel-aware length cap: sms (or absent) → 320; email → the long-form cap", () => {
    // SMS / no channel → the tight 320 (back-compat default).
    const sms = defaultRubricForSkill("review-requester", {
      reviewUrl: REVIEW_URL,
      contactName: "Jordan",
      channel: "sms",
    });
    const noChannel = defaultRubricForSkill("review-requester", {
      reviewUrl: REVIEW_URL,
      contactName: "Jordan",
    });
    assert.equal(check(sms!.checks, "max_length")!.max, 320);
    assert.equal(check(noChannel!.checks, "max_length")!.max, 320, "no channel keeps the 320 default");

    // Email → a much larger cap so a normal multi-paragraph email body passes.
    const email = defaultRubricForSkill("review-requester", {
      reviewUrl: REVIEW_URL,
      contactName: "Jordan",
      channel: "email",
    });
    const emailMax = check(email!.checks, "max_length")!.max;
    assert.ok(emailMax > 320, `email cap (${emailMax}) must exceed the SMS cap`);

    // A long-form body that BLOWS the SMS cap PASSES the email rubric.
    const longBody = `${"Thank you so much for choosing us. ".repeat(20)} Jordan ${REVIEW_URL}`;
    assert.ok(longBody.length > 320, "fixture must actually exceed 320");
    assert.equal(
      runDeterministicChecks(longBody, email!).pass,
      true,
      "a normal long email body must pass the email rubric",
    );
    assert.equal(
      runDeterministicChecks(longBody, sms!).pass,
      false,
      "the same long body must FAIL the SMS rubric (length)",
    );
  });
});

describe("defaultRubricForSkill — speed-to-lead", () => {
  test("→ exactly [min_length 1, max_length 320, must_not_include {]", () => {
    const rubric = defaultRubricForSkill("speed-to-lead");
    assert.ok(rubric, "expected a rubric, got null");
    assert.deepEqual(
      rubric.checks.map((c) => c.kind),
      ["min_length", "max_length", "must_not_include"],
    );
    const min = check(rubric.checks, "min_length");
    assert.ok(min && min.min === 1);
    const max = check(rubric.checks, "max_length");
    assert.ok(max && max.max === 320);
    const noPlaceholder = check(rubric.checks, "must_not_include");
    assert.ok(noPlaceholder && noPlaceholder.value === "{");

    // it gates: empty → fail (min_length), leaky → fail, normal → pass
    assert.equal(runDeterministicChecks("", rubric).pass, false);
    assert.equal(runDeterministicChecks("Hi {firstName}, thanks!", rubric).pass, false);
    assert.equal(runDeterministicChecks("Hi! Thanks for reaching out — when works to chat?", rubric).pass, true);
  });

  test("ctx is ignored for speed-to-lead (same rubric with or without it)", () => {
    const withCtx = defaultRubricForSkill("speed-to-lead", {
      reviewUrl: REVIEW_URL,
      contactName: "Jordan Lee",
    });
    const withoutCtx = defaultRubricForSkill("speed-to-lead");
    assert.deepEqual(withCtx, withoutCtx);
  });
});

describe("defaultRubricForSkill — unknown skill", () => {
  test("→ null", () => {
    assert.equal(defaultRubricForSkill("does-not-exist"), null);
    assert.equal(defaultRubricForSkill(""), null);
    assert.equal(
      defaultRubricForSkill("unknown", { reviewUrl: REVIEW_URL, contactName: "Jordan" }),
      null,
      "ctx does not conjure a rubric for an unknown skill",
    );
  });
});
