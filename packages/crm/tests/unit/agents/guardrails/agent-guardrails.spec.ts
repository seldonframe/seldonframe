// Agent Loop — L3 Guardrails/Stop — Task T1: the pure guardrail engine.
//
// agent-guardrails.ts is the pure core of the Guardrails/Stop primitive: the
// per-agent brakes that stop an agent from "billing you in silence". These
// tests pin the contract:
//   • evaluateGuardrails returns {allow, reason?} and NEVER throws;
//   • checks run in a fixed order, first failure wins:
//       null/undefined → allow → enabled:false ("agent disabled")
//       → quietHours ("quiet hours") → frequency cap ("frequency cap")
//       → daily cap ("daily cap") → allow;
//   • quietHours computes the LOCAL hour in the configured tz from ctx.now via
//     Intl, supports a wrap-around window (start > end spans midnight), and
//     FAILS OPEN on a bad tz (skips only the quiet-hours check, never throws);
//   • the frequency cap blocks when (now - lastSent) < min minutes, and skips
//     on an unparseable date; the daily cap blocks when sentTodayByAgent >= max;
//   • defaultGuardrailsForSkill: review-requester gets quiet hours + caps,
//     speed-to-lead is time-critical (no quiet hours, no per-contact gap),
//     unknown → null.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGuardrails,
  defaultGuardrailsForSkill,
  type Guardrails,
} from "../../../../src/lib/agents/guardrails/agent-guardrails";

// A fixed "now" helper: a UTC instant. Quiet-hours tests pick instants whose
// LOCAL hour in the configured tz is known (verified against Intl):
//   • UTC:             02:00Z → 2,  23:00Z → 23, 12:00Z → 12
//   • America/Toronto: 06:00Z → 2 (EDT, UTC-4 in June), 16:00Z → 12
const at = (iso: string) => ({ now: new Date(iso) });

describe("evaluateGuardrails — null / kill switch", () => {
  test("null guardrails → allow", () => {
    const d = evaluateGuardrails(null, at("2026-06-26T12:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });

  test("undefined guardrails → allow", () => {
    const d = evaluateGuardrails(undefined, at("2026-06-26T12:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });

  test("enabled:false → blocked 'agent disabled'", () => {
    const d = evaluateGuardrails({ enabled: false }, at("2026-06-26T12:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "agent disabled");
  });

  test("empty guardrails {} → allow (all checks vacuously pass)", () => {
    const d = evaluateGuardrails({}, at("2026-06-26T12:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — quiet hours (UTC, wrap-around 21→8)", () => {
  const g: Guardrails = { quietHours: { startHour: 21, endHour: 8, tz: "UTC" } };

  test("local hour 23 (inside the wrap window) → blocked 'quiet hours'", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T23:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("local hour 02 (inside, after midnight) → blocked 'quiet hours'", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T02:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("local hour 12 (outside the window) → allow", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T12:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });

  test("local hour == startHour (21, boundary, inclusive) → blocked", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T21:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("local hour == endHour (8, boundary, exclusive) → allow", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T08:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — quiet hours (non-wrap window 8→21)", () => {
  // A normal daytime-block window to prove the non-wrap branch independently.
  const g: Guardrails = { quietHours: { startHour: 8, endHour: 21, tz: "UTC" } };

  test("local hour 12 (inside) → blocked", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T12:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("local hour 23 (outside) → allow", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T23:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — quiet hours (non-UTC tz)", () => {
  // America/Toronto is EDT (UTC-4) in June. Window 21→8 local.
  const g: Guardrails = { quietHours: { startHour: 21, endHour: 8, tz: "America/Toronto" } };

  test("06:00Z → 02:00 Toronto (inside) → blocked 'quiet hours'", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T06:00:00Z"));
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("16:00Z → 12:00 Toronto (outside) → allow", () => {
    const d = evaluateGuardrails(g, at("2026-06-26T16:00:00Z"));
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — bad tz fails open", () => {
  test("invalid tz → no throw, quiet-hours check skipped, falls through to allow", () => {
    const g: Guardrails = { quietHours: { startHour: 0, endHour: 24, tz: "Not/AZone" } };
    let d!: ReturnType<typeof evaluateGuardrails>;
    assert.doesNotThrow(() => {
      d = evaluateGuardrails(g, at("2026-06-26T03:00:00Z"));
    });
    // The bad tz means we cannot evaluate quiet hours; with no other rule set,
    // we fall through to allow rather than crashing or blocking.
    assert.deepEqual(d, { allow: true });
  });

  test("invalid tz skips ONLY quiet hours — a later rule (daily cap) still fires", () => {
    const g: Guardrails = {
      quietHours: { startHour: 0, endHour: 24, tz: "Not/AZone" },
      maxPerDayPerAgent: 5,
    };
    const d = evaluateGuardrails(g, { now: new Date("2026-06-26T03:00:00Z"), sentTodayByAgent: 5 });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "daily cap");
  });
});

describe("evaluateGuardrails — frequency cap (per contact)", () => {
  const now = "2026-06-26T12:00:00Z";

  test("last sent 10 min ago with min 60 → blocked 'frequency cap'", () => {
    const d = evaluateGuardrails(
      { minMinutesBetweenPerContact: 60 },
      { now: new Date(now), lastSentToContactAt: "2026-06-26T11:50:00Z" },
    );
    assert.equal(d.allow, false);
    assert.equal(d.reason, "frequency cap");
  });

  test("last sent 90 min ago with min 60 → allow", () => {
    const d = evaluateGuardrails(
      { minMinutesBetweenPerContact: 60 },
      { now: new Date(now), lastSentToContactAt: "2026-06-26T10:30:00Z" },
    );
    assert.deepEqual(d, { allow: true });
  });

  test("exactly min minutes ago (60) → allow (boundary is exclusive: not < min)", () => {
    const d = evaluateGuardrails(
      { minMinutesBetweenPerContact: 60 },
      { now: new Date(now), lastSentToContactAt: "2026-06-26T11:00:00Z" },
    );
    assert.deepEqual(d, { allow: true });
  });

  test("no lastSentToContactAt → check skipped → allow", () => {
    const d = evaluateGuardrails(
      { minMinutesBetweenPerContact: 60 },
      { now: new Date(now) },
    );
    assert.deepEqual(d, { allow: true });
  });

  test("unparseable lastSentToContactAt → check skipped (no throw) → allow", () => {
    let d!: ReturnType<typeof evaluateGuardrails>;
    assert.doesNotThrow(() => {
      d = evaluateGuardrails(
        { minMinutesBetweenPerContact: 60 },
        { now: new Date(now), lastSentToContactAt: "not-a-date" },
      );
    });
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — daily cap (per agent)", () => {
  const now = "2026-06-26T12:00:00Z";

  test("sentTodayByAgent 200 with max 200 → blocked 'daily cap' (>= is the gate)", () => {
    const d = evaluateGuardrails(
      { maxPerDayPerAgent: 200 },
      { now: new Date(now), sentTodayByAgent: 200 },
    );
    assert.equal(d.allow, false);
    assert.equal(d.reason, "daily cap");
  });

  test("sentTodayByAgent 199 with max 200 → allow", () => {
    const d = evaluateGuardrails(
      { maxPerDayPerAgent: 200 },
      { now: new Date(now), sentTodayByAgent: 199 },
    );
    assert.deepEqual(d, { allow: true });
  });

  test("no sentTodayByAgent → treated as 0 → allow", () => {
    const d = evaluateGuardrails(
      { maxPerDayPerAgent: 200 },
      { now: new Date(now) },
    );
    assert.deepEqual(d, { allow: true });
  });
});

describe("evaluateGuardrails — ordering (first failure wins)", () => {
  test("disabled beats everything (even when quiet/freq/daily would also block)", () => {
    const g: Guardrails = {
      enabled: false,
      quietHours: { startHour: 0, endHour: 24, tz: "UTC" }, // would block
      minMinutesBetweenPerContact: 60, // would block
      maxPerDayPerAgent: 1, // would block
    };
    const d = evaluateGuardrails(g, {
      now: new Date("2026-06-26T03:00:00Z"),
      lastSentToContactAt: "2026-06-26T02:59:00Z",
      sentTodayByAgent: 10,
    });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "agent disabled");
  });

  test("quiet hours beats frequency cap", () => {
    const g: Guardrails = {
      quietHours: { startHour: 21, endHour: 8, tz: "UTC" }, // 03:00Z → blocked
      minMinutesBetweenPerContact: 60, // would also block (1 min ago)
    };
    const d = evaluateGuardrails(g, {
      now: new Date("2026-06-26T03:00:00Z"),
      lastSentToContactAt: "2026-06-26T02:59:00Z",
    });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("frequency cap beats daily cap", () => {
    const g: Guardrails = {
      minMinutesBetweenPerContact: 60, // 1 min ago → blocked
      maxPerDayPerAgent: 1, // would also block
    };
    const d = evaluateGuardrails(g, {
      now: new Date("2026-06-26T12:00:00Z"),
      lastSentToContactAt: "2026-06-26T11:59:00Z",
      sentTodayByAgent: 5,
    });
    assert.equal(d.allow, false);
    assert.equal(d.reason, "frequency cap");
  });

  test("all rules present but all satisfied → allow", () => {
    const g: Guardrails = {
      enabled: true,
      quietHours: { startHour: 21, endHour: 8, tz: "UTC" }, // 12:00Z outside
      minMinutesBetweenPerContact: 60, // 90 min ago
      maxPerDayPerAgent: 200, // 5 sent
    };
    const d = evaluateGuardrails(g, {
      now: new Date("2026-06-26T12:00:00Z"),
      lastSentToContactAt: "2026-06-26T10:30:00Z",
      sentTodayByAgent: 5,
    });
    assert.deepEqual(d, { allow: true });
  });
});

describe("defaultGuardrailsForSkill", () => {
  test("review-requester → enabled, daily cap 200, 30-day per-contact gap, quiet hours 21→8 UTC", () => {
    const g = defaultGuardrailsForSkill("review-requester");
    assert.ok(g, "expected non-null guardrails");
    assert.equal(g!.enabled, true);
    assert.equal(g!.maxPerDayPerAgent, 200);
    assert.equal(g!.minMinutesBetweenPerContact, 43200); // 60 * 24 * 30 = 30 days
    assert.deepEqual(g!.quietHours, { startHour: 21, endHour: 8, tz: "UTC" });
  });

  test("review-requester defaults actually block a 3am send (integration of the two)", () => {
    const g = defaultGuardrailsForSkill("review-requester");
    const d = evaluateGuardrails(g, at("2026-06-26T03:00:00Z")); // 03:00 UTC inside 21→8
    assert.equal(d.allow, false);
    assert.equal(d.reason, "quiet hours");
  });

  test("speed-to-lead → time-critical: enabled, daily cap 500, NO quiet hours, NO per-contact gap", () => {
    const g = defaultGuardrailsForSkill("speed-to-lead");
    assert.ok(g, "expected non-null guardrails");
    assert.equal(g!.enabled, true);
    assert.equal(g!.maxPerDayPerAgent, 500);
    assert.equal(g!.quietHours, undefined, "speed-to-lead must have NO quiet hours");
    assert.equal(g!.minMinutesBetweenPerContact, undefined, "speed-to-lead must have NO per-contact gap");
  });

  test("speed-to-lead still fires at 3am (no quiet hours) → allow", () => {
    const g = defaultGuardrailsForSkill("speed-to-lead");
    const d = evaluateGuardrails(g, {
      now: new Date("2026-06-26T03:00:00Z"),
      // even a same-second prior contact + a high count under the cap → still allowed
      lastSentToContactAt: "2026-06-26T02:59:59Z",
      sentTodayByAgent: 499,
    });
    assert.deepEqual(d, { allow: true });
  });

  test("unknown skill → null", () => {
    assert.equal(defaultGuardrailsForSkill("nope-not-a-skill"), null);
    assert.equal(defaultGuardrailsForSkill(""), null);
  });
});
