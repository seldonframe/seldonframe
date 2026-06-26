// Self-Improving Generator — L5.3 — Task 7: the post-generate-edit diff (PURE).
//
// diffEditToLessons is the pure decision behind recordGeneratorEditAction: given
// the AS-GENERATED blueprint and what the operator SAVED, it returns one
// {pattern,mistake,correction} lesson per meaningful change on the
// trigger / channel / skill-presence axes (and [] when nothing meaningful
// changed). These pin that contract with NO server / Brain in the loop.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { diffEditToLessons } from "../../../../src/lib/agents/generate/generator-edit-diff";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";

const INBOUND: AgentBlueprint = {
  trigger: { kind: "inbound", channel: "voice" },
};
const EVENT_SMS: AgentBlueprint = {
  trigger: { kind: "event", event: "booking.completed", channel: "sms" },
};

describe("diffEditToLessons — meaningful trigger change", () => {
  test("inbound → event records exactly one lesson keyed on 'post-generate edit'", () => {
    const lessons = diffEditToLessons(INBOUND, EVENT_SMS);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0]!.pattern, "post-generate edit");
    // mistake carries the BEFORE, correction carries the AFTER.
    assert.ok(lessons[0]!.mistake.includes("inbound"), "mistake names the generated trigger");
    assert.ok(
      lessons[0]!.correction.includes("event") &&
        lessons[0]!.correction.includes("booking.completed"),
      "correction names the operator's trigger",
    );
  });
});

describe("diffEditToLessons — no meaningful change", () => {
  test("identical blueprints → no lessons", () => {
    assert.deepEqual(diffEditToLessons(EVENT_SMS, EVENT_SMS), []);
  });

  test("a greeting/FAQ-only edit (same trigger + same skill presence) → no lessons", () => {
    const before: AgentBlueprint = { trigger: { kind: "inbound", channel: "chat" }, greeting: "Hi!" };
    const after: AgentBlueprint = { trigger: { kind: "inbound", channel: "chat" }, greeting: "Hello there!" };
    assert.deepEqual(diffEditToLessons(before, after), []);
  });
});

describe("diffEditToLessons — channel-only swap", () => {
  test("sms → email on the same event records a single lesson (no double-count)", () => {
    const before: AgentBlueprint = {
      trigger: { kind: "event", event: "lead.created", channel: "sms" },
    };
    const after: AgentBlueprint = {
      trigger: { kind: "event", event: "lead.created", channel: "email" },
    };
    const lessons = diffEditToLessons(before, after);
    // The trigger string already encodes the channel, so the channel swap is
    // captured once as a trigger lesson — not double-recorded.
    assert.equal(lessons.length, 1);
    assert.ok(lessons[0]!.mistake.includes("sms"));
    assert.ok(lessons[0]!.correction.includes("email"));
  });
});

describe("diffEditToLessons — skill (custom script) presence", () => {
  test("adding a custom script records a skill-presence lesson", () => {
    const before: AgentBlueprint = { trigger: { kind: "inbound", channel: "chat" } };
    const after: AgentBlueprint = {
      trigger: { kind: "inbound", channel: "chat" },
      customSkillMd: "You are a warm, concise assistant…",
    };
    const lessons = diffEditToLessons(before, after);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0]!.pattern, "post-generate edit");
    assert.ok(/custom script/i.test(lessons[0]!.mistake));
    assert.ok(/custom script/i.test(lessons[0]!.correction));
  });

  test("whitespace-only customSkillMd is treated as ABSENT (no false skill lesson)", () => {
    const before: AgentBlueprint = { trigger: { kind: "inbound", channel: "chat" }, customSkillMd: "   " };
    const after: AgentBlueprint = { trigger: { kind: "inbound", channel: "chat" }, customSkillMd: "" };
    assert.deepEqual(diffEditToLessons(before, after), []);
  });
});

describe("diffEditToLessons — robustness", () => {
  test("null / undefined / missing-trigger blueprints never throw", () => {
    assert.doesNotThrow(() => diffEditToLessons(null, null));
    assert.doesNotThrow(() => diffEditToLessons(undefined, EVENT_SMS));
    assert.doesNotThrow(() => diffEditToLessons({}, {}));
    // {} vs {} → both "unset" trigger + "without a custom script" → no change.
    assert.deepEqual(diffEditToLessons({}, {}), []);
  });
});
