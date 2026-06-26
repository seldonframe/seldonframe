// Primitive-Composition Agent Generator — P1, Task 3: shape-based safety defaults.
//
// shape-defaults.ts generalizes the per-SKILL defaults (default-rubrics.ts /
// agent-guardrails.ts) into per-SHAPE defaults. The composer wires SF's safety
// by an authored agent's SHAPE — its trigger kind × channel — not a template id,
// so an agent of ANY type still gets guardrails + a verify rubric deterministically.
//
// These tests pin the contract:
//   • a customer-messaging shape (channel sms/email + outbound event/schedule) →
//     quiet hours + per-contact + daily cap (mirrors the review-requester numbers);
//   • an action-only shape (channel "none") or an inbound shape → a daily cap ONLY,
//     NO quiet hours / per-contact (it posts/acts, it doesn't message a person on a
//     schedule);
//   • the rubric always carries the no-unfilled-"{" guard; max_length is added ONLY
//     for sms (320) / email (5000); channel "none" gets NO length cap;
//   • opts.reviewUrl → a must_include for that URL;
//   • SF_GROUND_RULES is a non-empty canonical safety block.
//
// The returned objects are also fed through the REAL guardrail/verify engines so a
// default can't silently encode a no-op or unsatisfiable check. NO network/clock/env.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  SF_GROUND_RULES,
  defaultGuardrailsForShape,
  defaultRubricForShape,
} from "../../../../src/lib/agents/generate/shape-defaults";
import {
  evaluateGuardrails,
  type Guardrails,
} from "../../../../src/lib/agents/guardrails/agent-guardrails";
import {
  runDeterministicChecks,
  type VerifyCheck,
  type VerifyRubric,
} from "../../../../src/lib/agents/verify/agent-verify";

const REVIEW_URL = "https://g.page/r/abc123/review";

/** The review-requester numbers the messaging shape mirrors. */
const THIRTY_DAYS_MINUTES = 60 * 24 * 30; // 43200

describe("defaultGuardrailsForShape", () => {
  test("a customer-messaging schedule/sms shape gets quiet hours + per-contact + daily cap", () => {
    const g = defaultGuardrailsForShape({ kind: "schedule", channel: "sms" });
    assert.equal(g.enabled, true); // kill switch available + on
    assert.ok(g.quietHours, "messages a person → has quiet hours");
    assert.equal(g.quietHours?.startHour, 21);
    assert.equal(g.quietHours?.endHour, 8);
    assert.equal(g.minMinutesBetweenPerContact, THIRTY_DAYS_MINUTES);
    assert.equal(g.maxPerDayPerAgent, 200);
  });

  test("a customer-messaging event/email shape also gets quiet hours + caps", () => {
    const g = defaultGuardrailsForShape({ kind: "event", channel: "email" });
    assert.ok(g.quietHours, "outbound email to a person → quiet hours");
    assert.equal(g.minMinutesBetweenPerContact, THIRTY_DAYS_MINUTES);
    assert.equal(g.maxPerDayPerAgent, 200);
  });

  test("an action-only (channel none) shape gets a daily cap but NO quiet hours / per-contact", () => {
    const g = defaultGuardrailsForShape({ kind: "schedule", channel: "none" });
    assert.equal(g.enabled, true);
    assert.equal(g.quietHours, undefined, "posts, doesn't message a person → no quiet hours");
    assert.equal(g.minMinutesBetweenPerContact, undefined);
    assert.ok(
      typeof g.maxPerDayPerAgent === "number" && g.maxPerDayPerAgent > 0,
      "still has a budget brake",
    );
  });

  test("an inbound shape gets a daily cap only, NO quiet hours / per-contact", () => {
    const g = defaultGuardrailsForShape({ kind: "inbound", channel: "voice" });
    assert.equal(g.quietHours, undefined, "the human initiates an inbound call → no quiet hours");
    assert.equal(g.minMinutesBetweenPerContact, undefined);
    assert.ok(typeof g.maxPerDayPerAgent === "number" && g.maxPerDayPerAgent > 0);
  });

  test("the kill switch is always on/available across shapes", () => {
    for (const shape of [
      { kind: "schedule" as const, channel: "sms" },
      { kind: "event" as const, channel: "email" },
      { kind: "schedule" as const, channel: "none" },
      { kind: "inbound" as const, channel: "chat" },
    ]) {
      assert.equal(defaultGuardrailsForShape(shape).enabled, true);
    }
  });

  test("the returned guardrails actually GATE through the real engine", () => {
    // Messaging shape: a send at 2am local (UTC tz) is inside quiet hours → blocked.
    const messaging = defaultGuardrailsForShape({ kind: "schedule", channel: "sms" });
    const at2amUtc = new Date("2026-06-26T02:00:00Z");
    assert.equal(
      evaluateGuardrails(messaging, { now: at2amUtc }).allow,
      false,
      "quiet hours should block the 2am send",
    );

    // Action-only shape: same 2am instant is allowed (no quiet hours), but the
    // daily cap still brakes once today's count hits the ceiling.
    const action = defaultGuardrailsForShape({ kind: "schedule", channel: "none" });
    assert.equal(
      evaluateGuardrails(action, { now: at2amUtc }).allow,
      true,
      "no quiet hours for an action-only agent",
    );
    const cap = action.maxPerDayPerAgent ?? 0;
    assert.equal(
      evaluateGuardrails(action, { now: at2amUtc, sentTodayByAgent: cap }).allow,
      false,
      "daily cap should brake at the ceiling",
    );
  });
});

describe("defaultRubricForShape", () => {
  test("every rubric carries the no-unfilled-{ guard", () => {
    for (const shape of [
      { kind: "schedule" as const, channel: "sms" },
      { kind: "event" as const, channel: "email" },
      { kind: "schedule" as const, channel: "none" },
    ]) {
      const r = defaultRubricForShape(shape);
      assert.ok(
        r.checks.some((c) => c.kind === "must_not_include" && c.value === "{"),
        `${shape.channel} rubric should guard against a leftover "{"`,
      );
    }
  });

  test("channel none skips the length cap (a post has no SMS/email ceiling)", () => {
    const r = defaultRubricForShape({ kind: "schedule", channel: "none" });
    assert.equal(
      r.checks.some((c) => c.kind === "max_length"),
      false,
      "an action-only rubric has no max_length",
    );
  });

  test("channel email keeps the long-form email cap (5000)", () => {
    const r = defaultRubricForShape({ kind: "event", channel: "email" });
    const cap = r.checks.find((c) => c.kind === "max_length");
    assert.ok(cap && cap.kind === "max_length");
    assert.equal(cap.max, 5000);
  });

  test("channel sms uses the tight SMS cap (320)", () => {
    const r = defaultRubricForShape({ kind: "event", channel: "sms" });
    const cap = r.checks.find((c) => c.kind === "max_length");
    assert.ok(cap && cap.kind === "max_length");
    assert.equal(cap.max, 320);
  });

  test("opts.reviewUrl adds a must_include for that URL", () => {
    const r = defaultRubricForShape({ kind: "event", channel: "sms" }, { reviewUrl: REVIEW_URL });
    assert.ok(
      r.checks.some((c) => c.kind === "must_include" && c.value === REVIEW_URL),
      "a known review URL should be enforced",
    );
  });

  test("no reviewUrl → no must_include (an unknown link must not add an unsatisfiable check)", () => {
    const r = defaultRubricForShape({ kind: "event", channel: "sms" });
    assert.equal(
      r.checks.some((c) => c.kind === "must_include"),
      false,
    );
  });

  test("the returned rubric actually GATES through the real engine", () => {
    // An SMS rubric blocks a body that leaked a "{firstName}" placeholder...
    const sms = defaultRubricForShape({ kind: "event", channel: "sms" });
    assert.equal(runDeterministicChecks("Hi {firstName}!", sms).pass, false);
    // ...passes a clean short body...
    assert.equal(runDeterministicChecks("Thanks for choosing us!", sms).pass, true);
    // ...and blocks an over-long body (> 320).
    assert.equal(runDeterministicChecks("x".repeat(321), sms).pass, false);

    // An action-only rubric has no length ceiling, so a long post still passes.
    const action = defaultRubricForShape({ kind: "schedule", channel: "none" });
    assert.equal(runDeterministicChecks("x".repeat(5000), action).pass, true);
  });

  test("a reviewUrl rubric passes a body that includes the link and fails one that doesn't", () => {
    const r = defaultRubricForShape({ kind: "event", channel: "sms" }, { reviewUrl: REVIEW_URL });
    assert.equal(runDeterministicChecks(`Mind leaving a review? ${REVIEW_URL}`, r).pass, true);
    assert.equal(runDeterministicChecks("Mind leaving a review?", r).pass, false);
  });
});

describe("SF_GROUND_RULES", () => {
  test("is a non-empty canonical safety block", () => {
    assert.equal(typeof SF_GROUND_RULES, "string");
    assert.ok(SF_GROUND_RULES.trim().length > 0);
  });

  test("contains the never-invent-facts rule (the exact canonical phrase)", () => {
    assert.ok(SF_GROUND_RULES.includes("Never invent"));
  });

  test("covers the honest-price-range, read-back, booking-tools, and escalate rules", () => {
    assert.ok(/firm price/i.test(SF_GROUND_RULES), "honest price range / no firm price");
    assert.ok(/read back/i.test(SF_GROUND_RULES), "read back before booking");
    assert.ok(/escalate|human/i.test(SF_GROUND_RULES), "escalate to a human when unsure");
    assert.ok(/booking tools/i.test(SF_GROUND_RULES), "use the booking tools, never guess a slot");
  });
});

describe("type compatibility (compiles against the REAL types)", () => {
  test("returned objects type-check as Guardrails / VerifyRubric", () => {
    const g: Guardrails = defaultGuardrailsForShape({ kind: "schedule", channel: "sms" });
    const r: VerifyRubric = defaultRubricForShape({ kind: "event", channel: "email" });
    const checks: VerifyCheck[] = r.checks;
    assert.ok(g);
    assert.ok(Array.isArray(checks));
  });
});
