import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { summarizeReflections } from "../../../src/lib/vision/summarize-reflections";

describe("summarizeReflections", () => {
  test("empty → total 0, pass_rate null", () => {
    const s = summarizeReflections([]);
    assert.deepEqual(s, { total: 0, failures: 0, skipped: 0, pass_rate: null });
  });

  test("counts genuine failures and computes pass_rate over completed grades only", () => {
    const s = summarizeReflections([
      { pass: true, skipped: null },
      { pass: true, skipped: null },
      { pass: false, skipped: null }, // 1 genuine failure of 4 real grades
      { pass: true, skipped: null },
    ]);
    assert.equal(s.total, 4);
    assert.equal(s.failures, 1);
    assert.equal(s.skipped, 0);
    assert.equal(s.pass_rate, 0.75);
  });

  test("skipped rows (timeout/render_failed) are excluded from total AND failures (fail-soft)", () => {
    const s = summarizeReflections([
      { pass: false, skipped: "timeout" }, // NOT a failure — verifier didn't run
      { pass: true, skipped: "render_failed" },
      { pass: false, skipped: null }, // the only real grade, and it failed
    ]);
    assert.equal(s.total, 1);
    assert.equal(s.failures, 1);
    assert.equal(s.skipped, 2);
    assert.equal(s.pass_rate, 0); // 1 real grade, it failed
  });

  test("all skipped → total 0, pass_rate null (no real signal)", () => {
    const s = summarizeReflections([
      { pass: false, skipped: "timeout" },
      { pass: true, skipped: "render_failed" },
    ]);
    assert.equal(s.total, 0);
    assert.equal(s.pass_rate, null);
    assert.equal(s.skipped, 2);
  });
});
