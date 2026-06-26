// Agent Loop — L2 Verify (maker ≠ checker) — Task T4: the OPTIONAL LLM checker seam.
//
// llm-checker.ts makes a "stronger separate grader" AVAILABLE (deterministic-
// only stays the production default). These tests pin the seam contract with a
// DI'd FAKE grader — NO real LLM, NO network:
//   • rubricToCriteria is PURE: each check kind → a readable instruction line,
//     plus an always-appended general quality criterion (accurate/on-brand);
//   • makeLlmChecker(grader) returns a Checker that derives criteria, calls the
//     grader, and maps {pass, failures} → VerifyResult;
//   • it FAILS CLOSED: a grader that THROWS or returns garbage (no boolean pass)
//     → {pass:false, failures:["llm_checker_error"]}, and it NEVER throws.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  rubricToCriteria,
  makeLlmChecker,
  type LlmGrader,
} from "../../../../src/lib/agents/verify/llm-checker";
import type { VerifyRubric } from "../../../../src/lib/agents/verify/agent-verify";

const REVIEW_URL = "https://g.page/r/abc123/review";

// A canonical review-requester rubric (mirrors agent-verify.spec): link + name
// present, ≤320 chars, no leftover "{placeholder}".
function reviewRubric(): VerifyRubric {
  return {
    checks: [
      { kind: "must_include", value: REVIEW_URL, label: "review link" },
      { kind: "must_include_any", values: ["Jordan", "Jordan Lee"], label: "contact name" },
      { kind: "max_length", max: 320 },
      { kind: "must_not_include", value: "{", label: "unfilled placeholder" },
    ],
  };
}

describe("rubricToCriteria — pure: each check kind → a readable grader line", () => {
  test("maps every supported check kind to a line, plus the general quality line", () => {
    const rubric: VerifyRubric = {
      checks: [
        { kind: "max_length", max: 320 },
        { kind: "min_length", min: 1 },
        { kind: "must_include", value: REVIEW_URL, label: "review link" },
        { kind: "must_include_any", values: ["Jordan", "Jordan Lee"], label: "contact name" },
        { kind: "must_not_include", value: "{", label: "unfilled placeholder" },
        { kind: "must_match", pattern: "https?://\\S+", label: "a URL" },
      ],
    };
    const criteria = rubricToCriteria(rubric);
    // one line per check + exactly one appended quality line
    assert.equal(criteria.length, rubric.checks.length + 1);

    const joined = criteria.join("\n");
    assert.ok(/at most 320 characters/i.test(joined), joined);
    assert.ok(/at least 1 characters/i.test(joined), joined);
    // must_include carries the value (truncated/verbatim) + its label
    assert.ok(joined.includes(REVIEW_URL), joined);
    assert.ok(/review link/i.test(joined), joined);
    // must_include_any lists the values + says "one of"
    assert.ok(/one of/i.test(joined), joined);
    assert.ok(joined.includes('"Jordan"') && joined.includes('"Jordan Lee"'), joined);
    assert.ok(/contact name/i.test(joined), joined);
    // must_not_include is phrased as a prohibition
    assert.ok(/must not contain/i.test(joined), joined);
    assert.ok(/unfilled placeholder/i.test(joined), joined);
    // must_match surfaces the pattern
    assert.ok(joined.includes("https?://\\S+"), joined);

    // the always-appended quality criterion (the soft, non-regex value)
    const last = criteria[criteria.length - 1];
    assert.ok(/on-brand/i.test(last) && /misleading/i.test(last), last);
  });

  test("an empty rubric → exactly the single general quality criterion", () => {
    const criteria = rubricToCriteria({ checks: [] });
    assert.equal(criteria.length, 1);
    assert.ok(/accurate/i.test(criteria[0]) && /on-brand/i.test(criteria[0]), criteria[0]);
  });

  test("a must_include WITHOUT a label still names the value", () => {
    const criteria = rubricToCriteria({ checks: [{ kind: "must_include", value: "BookNow" }] });
    assert.ok(criteria.some((c) => c.includes('"BookNow"')), criteria.join("\n"));
  });
});

describe("makeLlmChecker — wraps an LlmGrader into a fail-closed Checker", () => {
  test("grader returning {pass:true} → VerifyResult.pass true, no failures", async () => {
    const grader: LlmGrader = async () => ({ pass: true });
    const checker = makeLlmChecker(grader);
    const res = await checker(`Hi Jordan! Leave a review: ${REVIEW_URL}`, reviewRubric());
    assert.equal(res.pass, true);
    assert.deepEqual(res.failures, []);
    // this layer carries no structured per-check results (the deterministic
    // layer owns those); results:[] is the contract.
    assert.deepEqual(res.results, []);
  });

  test("the grader RECEIVES the derived criteria for the given rubric", async () => {
    const seen: Array<{ output: string; criteria: string[] }> = [];
    const grader: LlmGrader = async (args) => {
      seen.push(args);
      return { pass: true };
    };
    const checker = makeLlmChecker(grader);
    const output = `Hi Jordan! Leave a review: ${REVIEW_URL}`;
    await checker(output, reviewRubric());
    assert.equal(seen.length, 1, "grader should have been called once");
    assert.equal(seen[0].output, output);
    // criteria == rubricToCriteria(rubric): 4 checks + 1 quality line
    assert.deepEqual(seen[0].criteria, rubricToCriteria(reviewRubric()));
    assert.equal(seen[0].criteria.length, 5);
  });

  test("grader returning {pass:false, failures:['off-brand']} → pass false, carries the failure", async () => {
    const grader: LlmGrader = async () => ({ pass: false, failures: ["off-brand"] });
    const checker = makeLlmChecker(grader);
    const res = await checker("whatever", reviewRubric());
    assert.equal(res.pass, false);
    assert.ok(res.failures.includes("off-brand"), JSON.stringify(res.failures));
  });

  test("grader returning {pass:false} with NO failures → a generic failure is surfaced", async () => {
    const grader: LlmGrader = async () => ({ pass: false });
    const checker = makeLlmChecker(grader);
    const res = await checker("whatever", reviewRubric());
    assert.equal(res.pass, false);
    assert.ok(res.failures.length >= 1, "a fail must surface at least one reason");
  });

  test("a grader that THROWS → fail CLOSED ('llm_checker_error'), never throws", async () => {
    const grader: LlmGrader = async () => {
      throw new Error("LLM grader timed out");
    };
    const checker = makeLlmChecker(grader);
    let res!: Awaited<ReturnType<typeof checker>>;
    await assert.doesNotReject(async () => {
      res = await checker("whatever", reviewRubric());
    });
    assert.equal(res.pass, false, "a throwing grader must block, never wave through");
    assert.ok(res.failures.includes("llm_checker_error"), JSON.stringify(res.failures));
  });

  test("a grader returning GARBAGE (no boolean pass) → fail CLOSED ('llm_checker_error')", async () => {
    // grader resolves with a malformed object (missing `pass`)
    const grader = (async () => ({ verdict: "ok" })) as unknown as LlmGrader;
    const checker = makeLlmChecker(grader);
    const res = await checker("whatever", reviewRubric());
    assert.equal(res.pass, false);
    assert.ok(res.failures.includes("llm_checker_error"), JSON.stringify(res.failures));
  });

  test("a grader returning a non-boolean `pass` (truthy) → still fail CLOSED", async () => {
    // `pass: "yes"` is truthy but NOT a boolean — must be rejected, not trusted.
    const grader = (async () => ({ pass: "yes" })) as unknown as LlmGrader;
    const checker = makeLlmChecker(grader);
    const res = await checker("whatever", reviewRubric());
    assert.equal(res.pass, false);
    assert.ok(res.failures.includes("llm_checker_error"), JSON.stringify(res.failures));
  });

  test("a grader returning null → fail CLOSED", async () => {
    const grader = (async () => null) as unknown as LlmGrader;
    const checker = makeLlmChecker(grader);
    const res = await checker("whatever", reviewRubric());
    assert.equal(res.pass, false);
    assert.ok(res.failures.includes("llm_checker_error"), JSON.stringify(res.failures));
  });
});
