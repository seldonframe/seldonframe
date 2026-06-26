// Agent Loop — L2 Verify (maker ≠ checker) — Task T1: the pure verify model.
//
// agent-verify.ts is the pure core of the Verify primitive: a separate, strict
// CHECKER that gates an agent's output before it is sent/saved, so the maker
// (the client's agent) never grades its own homework. These tests pin the
// contract:
//   • runDeterministicChecks evaluates each rubric check against the output,
//     NEVER throws (a malformed regex → that check fails, it does not blow up),
//     and produces a human-readable `failures` string per failed check;
//   • max_length/min_length compare against output.length; must_include is a
//     literal substring; must_include_any passes if ANY value is present;
//     must_match tests new RegExp(pattern, flags); must_not_include passes
//     when the substring is ABSENT (placeholder-leak guard);
//   • verifyOutput runs the deterministic checks and, if a `checker` is given,
//     ALSO awaits it and ANDs the results (both must pass); a checker that
//     THROWS fails CLOSED ({pass:false, failures includes "checker_error"});
//     with no checker, verifyOutput equals the deterministic result.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runDeterministicChecks,
  verifyOutput,
  type VerifyRubric,
  type VerifyResult,
  type Checker,
} from "../../../../src/lib/agents/verify/agent-verify";

// A canonical review-requester rubric: the review link + the contact's name
// must be present, the SMS must stay ≤320 chars, and no leftover "{placeholder}".
const REVIEW_URL = "https://g.page/r/abc123/review";
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

describe("runDeterministicChecks — composes the all-checks-pass verdict", () => {
  test("a message with the URL + name + within length → pass, empty failures", () => {
    const output = `Hi Jordan! Thanks for choosing us. Mind leaving a quick review? ${REVIEW_URL}`;
    const res = runDeterministicChecks(output, reviewRubric());
    assert.equal(res.pass, true, `expected pass; failures=${JSON.stringify(res.failures)}`);
    assert.deepEqual(res.failures, []);
    assert.equal(res.results.length, 4);
    assert.ok(res.results.every((r) => r.pass));
  });

  test("missing the must_include URL → fail with a readable failure naming the value", () => {
    const output = "Hi Jordan! Thanks — please leave us a review!"; // no link
    const res = runDeterministicChecks(output, reviewRubric());
    assert.equal(res.pass, false);
    // the failure string must mention the missing value so an operator can see why
    const joined = res.failures.join(" | ");
    assert.ok(joined.includes(REVIEW_URL), `failures should name the missing URL: ${joined}`);
    // the specific failing check result is marked not-pass
    const urlResult = res.results.find(
      (r) => r.check.kind === "must_include" && r.check.value === REVIEW_URL,
    );
    assert.ok(urlResult && urlResult.pass === false);
  });

  test("over max_length → fail, and the detail carries the actual count", () => {
    const long = "x".repeat(412);
    const res = runDeterministicChecks(long, { checks: [{ kind: "max_length", max: 320 }] });
    assert.equal(res.pass, false);
    const r = res.results[0];
    assert.equal(r.pass, false);
    assert.ok((r.detail ?? "").includes("412"), `detail should include the length 412: ${r.detail}`);
    assert.ok((r.detail ?? "").includes("320"), `detail should include the max 320: ${r.detail}`);
    // and the human-readable failure too
    assert.ok(res.failures[0].includes("412") && res.failures[0].includes("320"), res.failures[0]);
  });

  test("under min_length → fail", () => {
    const res = runDeterministicChecks("", { checks: [{ kind: "min_length", min: 1 }] });
    assert.equal(res.pass, false);
    assert.equal(res.results[0].pass, false);
    // at exactly the minimum → pass
    const ok = runDeterministicChecks("a", { checks: [{ kind: "min_length", min: 1 }] });
    assert.equal(ok.pass, true);
  });

  test("must_include_any passes when ANY value is present", () => {
    const rubric: VerifyRubric = {
      checks: [{ kind: "must_include_any", values: ["Jordan", "Jordan Lee"], label: "name" }],
    };
    // only the first name present
    assert.equal(runDeterministicChecks("Hi Jordan!", rubric).pass, true);
    // only the full name present
    assert.equal(runDeterministicChecks("Dear Jordan Lee,", rubric).pass, true);
  });

  test("must_include_any fails when NONE of the values are present", () => {
    const rubric: VerifyRubric = {
      checks: [{ kind: "must_include_any", values: ["Jordan", "Jordan Lee"], label: "name" }],
    };
    const res = runDeterministicChecks("Hi there!", rubric);
    assert.equal(res.pass, false);
    assert.equal(res.results[0].pass, false);
    assert.ok(res.failures.length === 1, JSON.stringify(res.failures));
  });

  test('must_not_include "{" fails when a literal "{" leaks, passes when clean', () => {
    const rubric: VerifyRubric = {
      checks: [{ kind: "must_not_include", value: "{", label: "unfilled placeholder" }],
    };
    // placeholder leak → fail
    const leaked = runDeterministicChecks("Hi {firstName}, leave a review", rubric);
    assert.equal(leaked.pass, false);
    assert.equal(leaked.results[0].pass, false);
    // clean → pass
    const clean = runDeterministicChecks("Hi Jordan, leave a review", rubric);
    assert.equal(clean.pass, true);
  });

  test("must_match tests the pattern; a well-formed regex matches/does-not-match correctly", () => {
    const rubric: VerifyRubric = {
      checks: [{ kind: "must_match", pattern: "https?://\\S+", label: "a URL" }],
    };
    assert.equal(runDeterministicChecks("see https://example.com now", rubric).pass, true);
    assert.equal(runDeterministicChecks("no link here", rubric).pass, false);
  });

  test("a malformed must_match pattern → that check FAILS, it does not throw", () => {
    const rubric: VerifyRubric = {
      checks: [{ kind: "must_match", pattern: "(", label: "broken regex" }], // unbalanced paren
    };
    // must not throw
    let res!: VerifyResult;
    assert.doesNotThrow(() => {
      res = runDeterministicChecks("anything", rubric);
    });
    assert.equal(res.pass, false);
    assert.equal(res.results[0].pass, false);
    assert.ok((res.results[0].detail ?? "").length > 0, "a bad regex should carry a detail");
  });

  test("an empty rubric → pass (vacuously true), no failures", () => {
    const res = runDeterministicChecks("whatever", { checks: [] });
    assert.equal(res.pass, true);
    assert.deepEqual(res.failures, []);
    assert.deepEqual(res.results, []);
  });

  test("multiple failures accumulate (one readable string each)", () => {
    const output = "x".repeat(400); // too long, no name, no link, but no "{"
    const res = runDeterministicChecks(output, reviewRubric());
    assert.equal(res.pass, false);
    // 3 of the 4 checks fail (URL, name, length); the must_not_include passes
    const failed = res.results.filter((r) => !r.pass);
    assert.equal(failed.length, 3, JSON.stringify(res.results.map((r) => [r.check.kind, r.pass])));
    assert.equal(res.failures.length, 3);
  });
});

describe("verifyOutput — ANDs deterministic checks with the optional checker (fail-closed)", () => {
  test("no checker → equals the deterministic result", async () => {
    const rubric = reviewRubric();
    const output = `Hi Jordan! Leave a review: ${REVIEW_URL}`;
    const viaVerify = await verifyOutput(output, rubric);
    const deterministic = runDeterministicChecks(output, rubric);
    assert.deepEqual(viaVerify, deterministic);
  });

  test("deterministic passes but the checker returns pass:false → overall FAIL, failures merged", async () => {
    const output = `Hi Jordan! Leave a review: ${REVIEW_URL}`; // passes deterministic
    assert.equal(runDeterministicChecks(output, reviewRubric()).pass, true);
    const checker: Checker = async () => ({
      pass: false,
      results: [],
      failures: ["tone too pushy"],
    });
    const res = await verifyOutput(output, reviewRubric(), checker);
    assert.equal(res.pass, false, "checker fail must veto a deterministic pass");
    assert.ok(res.failures.includes("tone too pushy"), JSON.stringify(res.failures));
  });

  test("deterministic AND checker both pass → overall pass, all results merged", async () => {
    const output = `Hi Jordan! Leave a review: ${REVIEW_URL}`;
    const checker: Checker = async () => ({
      pass: true,
      results: [{ check: { kind: "min_length", min: 1 }, pass: true }],
      failures: [],
    });
    const res = await verifyOutput(output, reviewRubric(), checker);
    assert.equal(res.pass, true);
    assert.deepEqual(res.failures, []);
    // merged: 4 deterministic + 1 from the checker
    assert.equal(res.results.length, 5);
  });

  test("a checker that THROWS → fail CLOSED (pass:false, failures includes 'checker_error')", async () => {
    const output = `Hi Jordan! Leave a review: ${REVIEW_URL}`; // deterministic passes
    const checker: Checker = async () => {
      throw new Error("LLM grader timed out");
    };
    const res = await verifyOutput(output, reviewRubric(), checker);
    assert.equal(res.pass, false, "a throwing checker must block, never wave through");
    assert.ok(res.failures.includes("checker_error"), JSON.stringify(res.failures));
  });

  test("if deterministic fails, the overall result fails even when the checker passes", async () => {
    const output = "Hi there! Please review."; // missing URL + name → deterministic fail
    assert.equal(runDeterministicChecks(output, reviewRubric()).pass, false);
    const checker: Checker = async () => ({ pass: true, results: [], failures: [] });
    const res = await verifyOutput(output, reviewRubric(), checker);
    assert.equal(res.pass, false);
    // the deterministic failures are still surfaced
    assert.ok(res.failures.length >= 1);
  });
});
