// Deterministic replay — trigger filter gate (Reelier phase 2c, gap 2).
// Unit tests for the pure validate/evaluate pair
// lib/deployments/replay/trigger-filter.ts exports — the matrix the plan
// asked for: senderEndsWith/senderContains/subjectContains match +
// mismatch + case-insensitivity, multiple conditions AND, null filter
// always matches, malformed filter always fails closed (never matches).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  validateTriggerFilter,
  evaluateTriggerFilter,
} from "@/lib/deployments/replay/trigger-filter";

describe("validateTriggerFilter", () => {
  test("null is valid — means no filter", () => {
    assert.deepEqual(validateTriggerFilter(null), { ok: true, filter: null });
  });

  test("undefined is valid — means no filter", () => {
    assert.deepEqual(validateTriggerFilter(undefined), { ok: true, filter: null });
  });

  test("a single known key with a non-empty string value is valid", () => {
    const result = validateTriggerFilter({ senderEndsWith: "@seldonframe.com" });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.filter, { senderEndsWith: "@seldonframe.com" });
  });

  test("multiple known keys are all kept", () => {
    const result = validateTriggerFilter({
      senderEndsWith: "@seldonframe.com",
      subjectContains: "invoice",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.filter, {
        senderEndsWith: "@seldonframe.com",
        subjectContains: "invoice",
      });
    }
  });

  test("an unknown key is rejected", () => {
    const result = validateTriggerFilter({ senderEndsWith: "@x.com", bogusKey: "y" });
    assert.equal(result.ok, false);
  });

  test("a non-string value is rejected", () => {
    const result = validateTriggerFilter({ senderEndsWith: 123 });
    assert.equal(result.ok, false);
  });

  test("an empty-string value is rejected", () => {
    const result = validateTriggerFilter({ senderEndsWith: "" });
    assert.equal(result.ok, false);
  });

  test("an empty object is rejected (must declare at least one condition, or be null)", () => {
    const result = validateTriggerFilter({});
    assert.equal(result.ok, false);
  });

  test("an array is rejected", () => {
    const result = validateTriggerFilter(["senderEndsWith"]);
    assert.equal(result.ok, false);
  });

  test("a non-object primitive is rejected", () => {
    const result = validateTriggerFilter("senderEndsWith:@x.com");
    assert.equal(result.ok, false);
  });
});

describe("evaluateTriggerFilter — null filter always matches", () => {
  test("no filter → matched, replay attempted for every event", () => {
    const result = evaluateTriggerFilter(null, { sender: "anyone@anywhere.com", subject: "" });
    assert.equal(result.matched, true);
  });
});

describe("evaluateTriggerFilter — senderEndsWith", () => {
  test("matches, case-insensitive", () => {
    const filter = { senderEndsWith: "@SeldonFrame.com" };
    const result = evaluateTriggerFilter(filter, { sender: "ops@seldonframe.com", subject: "" });
    assert.equal(result.matched, true);
  });

  test("mismatches a different domain", () => {
    const filter = { senderEndsWith: "@seldonframe.com" };
    const result = evaluateTriggerFilter(filter, { sender: "ops@example.com", subject: "" });
    assert.equal(result.matched, false);
  });
});

describe("evaluateTriggerFilter — senderContains", () => {
  test("matches a substring, case-insensitive", () => {
    const filter = { senderContains: "NOREPLY" };
    const result = evaluateTriggerFilter(filter, { sender: "noreply@example.com", subject: "" });
    assert.equal(result.matched, true);
  });

  test("mismatches when substring absent", () => {
    const filter = { senderContains: "noreply" };
    const result = evaluateTriggerFilter(filter, { sender: "founder@example.com", subject: "" });
    assert.equal(result.matched, false);
  });
});

describe("evaluateTriggerFilter — subjectContains", () => {
  test("matches, case-insensitive", () => {
    const filter = { subjectContains: "INVOICE" };
    const result = evaluateTriggerFilter(filter, { sender: "", subject: "Your invoice is ready" });
    assert.equal(result.matched, true);
  });

  test("mismatches when absent", () => {
    const filter = { subjectContains: "invoice" };
    const result = evaluateTriggerFilter(filter, { sender: "", subject: "Meeting notes" });
    assert.equal(result.matched, false);
  });
});

describe("evaluateTriggerFilter — multiple conditions are AND-matched", () => {
  test("all conditions match → matched", () => {
    const filter = { senderEndsWith: "@seldonframe.com", subjectContains: "labeler" };
    const result = evaluateTriggerFilter(filter, {
      sender: "ops@seldonframe.com",
      subject: "labeler test",
    });
    assert.equal(result.matched, true);
  });

  test("only ONE condition mismatching fails the whole filter", () => {
    const filter = { senderEndsWith: "@seldonframe.com", subjectContains: "labeler" };
    const result = evaluateTriggerFilter(filter, {
      sender: "ops@seldonframe.com",
      subject: "unrelated subject",
    });
    assert.equal(result.matched, false);
  });
});

describe("evaluateTriggerFilter — malformed filter fails closed (never matches)", () => {
  test("unknown key → not matched, never throws", () => {
    const result = evaluateTriggerFilter({ bogusKey: "x" }, { sender: "a@b.com", subject: "" });
    assert.equal(result.matched, false);
  });

  test("wrong shape (array) → not matched, never throws", () => {
    const result = evaluateTriggerFilter(["senderEndsWith"], { sender: "a@b.com", subject: "" });
    assert.equal(result.matched, false);
  });

  test("wrong value type → not matched, never throws", () => {
    const result = evaluateTriggerFilter({ senderEndsWith: 123 }, { sender: "a@b.com", subject: "" });
    assert.equal(result.matched, false);
  });

  test("a malformed filter never accidentally matches even a sender that WOULD satisfy the intended condition", () => {
    // The literal fail-safe: a filter meaning "ends with @b.com" but
    // corrupted into an unknown-shaped value must not match, even though
    // the sender below would satisfy the (uncorrupted) intent.
    const result = evaluateTriggerFilter({ senderEndsWith: ["@b.com"] }, {
      sender: "x@b.com",
      subject: "",
    });
    assert.equal(result.matched, false);
  });
});
