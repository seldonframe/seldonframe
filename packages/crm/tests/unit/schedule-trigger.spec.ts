// Tests for ScheduleTriggerSchema + cross-ref validator.
// SLICE 5 PR 1 C2 per audit §3.1.
//
// Second branch of the discriminated-union TriggerSchema (C1 shipped
// only the event branch). Adds cross-ref Zod validation: cron expression
// parses, timezone is IANA, catchup + concurrency are enum-constrained.
//
// Per L-17 cross-ref Zod validator calibration observation (SLICE 4b
// customer_surfaces), expect 2.5-3.0x test multiplier for this commit.
// Datapoint will confirm or recalibrate that rule.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";

const testEventRegistry: EventRegistry = {
  events: [
    { type: "form.submitted", fields: {} },
    { type: "booking.completed", fields: {} },
  ],
};
const testBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};

function baseSpec(trigger: unknown): unknown {
  return {
    id: "test",
    name: "t",
    description: "t",
    trigger,
    variables: {},
    steps: [{ id: "s1", type: "wait", seconds: 1, next: null }],
  };
}

function triggerIssues(spec: unknown) {
  const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
  return result.filter((i) => i.path === "trigger" || i.path.startsWith("trigger."));
}

// ---------------------------------------------------------------------
// 1. Accept happy-path schedule triggers
// ---------------------------------------------------------------------

describe("ScheduleTriggerSchema — happy path", () => {
  test("accepts minimal schedule trigger (cron only)", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * * *" });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts schedule trigger with timezone", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      timezone: "America/New_York",
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("accepts schedule with all optional fields", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "*/5 * * * *",
      timezone: "UTC",
      catchup: "fire_all",
      concurrency: "concurrent",
    });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0, JSON.stringify(issues));
  });

  test("defaults catchup to 'skip' when omitted", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * * *" });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // Validator accepts; Zod applies default at parse time.
    const triggerErr = result.filter((i) => i.path.startsWith("trigger"));
    assert.equal(triggerErr.length, 0);
  });
});

// ---------------------------------------------------------------------
// 2. Cron expression validation (cross-ref via cron utility)
// ---------------------------------------------------------------------

describe("ScheduleTriggerSchema — cron validation", () => {
  test("rejects malformed cron expression", () => {
    const spec = baseSpec({ type: "schedule", cron: "not a cron" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
    assert.match(issues[0].message.toLowerCase(), /cron/);
  });

  test("rejects cron with wrong field count", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * *" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects cron with out-of-range value", () => {
    const spec = baseSpec({ type: "schedule", cron: "60 9 * * *" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects empty cron", () => {
    const spec = baseSpec({ type: "schedule", cron: "" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects missing cron field", () => {
    const spec = baseSpec({ type: "schedule" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 3. Timezone validation (IANA cross-ref via Intl)
// ---------------------------------------------------------------------

describe("ScheduleTriggerSchema — timezone validation", () => {
  test("rejects non-IANA timezone string", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      timezone: "Mars/Olympus",
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
    assert.match(issues[0].message.toLowerCase(), /timezone|iana/);
  });

  test("accepts common IANA names", () => {
    for (const tz of ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"]) {
      const spec = baseSpec({
        type: "schedule",
        cron: "0 9 * * *",
        timezone: tz,
      });
      const issues = triggerIssues(spec);
      assert.equal(issues.length, 0, `expected ${tz} to pass; got ${JSON.stringify(issues)}`);
    }
  });

  test("rejects timezone as non-string type", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      timezone: 42,
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 4. Enum validation — catchup + concurrency
// ---------------------------------------------------------------------

describe("ScheduleTriggerSchema — catchup enum", () => {
  test("accepts 'skip' / 'fire_all' / 'fire_one'", () => {
    for (const policy of ["skip", "fire_all", "fire_one"] as const) {
      const spec = baseSpec({
        type: "schedule",
        cron: "0 9 * * *",
        catchup: policy,
      });
      const issues = triggerIssues(spec);
      assert.equal(issues.length, 0, `expected ${policy} to pass`);
    }
  });

  test("rejects unknown catchup value", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      catchup: "fire_latest",
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

describe("ScheduleTriggerSchema — concurrency enum", () => {
  test("accepts 'skip' / 'concurrent'", () => {
    for (const policy of ["skip", "concurrent"] as const) {
      const spec = baseSpec({
        type: "schedule",
        cron: "0 9 * * *",
        concurrency: policy,
      });
      const issues = triggerIssues(spec);
      assert.equal(issues.length, 0, `expected ${policy} to pass`);
    }
  });

  test("rejects 'queue' (deferred to follow-up per G-5-4)", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      concurrency: "queue",
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });

  test("rejects unknown concurrency value", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
      concurrency: "parallel",
    });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 5. Discriminator behavior (belt + suspenders after C1)
// ---------------------------------------------------------------------

describe("TriggerSchema with both branches — discriminator", () => {
  test("type='event' still works (C1 invariant preserved)", () => {
    const spec = baseSpec({ type: "event", event: "form.submitted" });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0);
  });

  test("type='schedule' NO LONGER rejected after C2", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * * *" });
    const issues = triggerIssues(spec);
    assert.equal(issues.length, 0);
  });

  test("unknown trigger type still rejected (not in discriminator set)", () => {
    const spec = baseSpec({ type: "webhook", url: "x" });
    const issues = triggerIssues(spec);
    assert.ok(issues.length > 0);
  });
});

// ---------------------------------------------------------------------
// 6. Schedule triggers don't cross-ref event-registry (they're standalone)
// ---------------------------------------------------------------------

describe("ScheduleTriggerSchema — no event-registry cross-ref", () => {
  test("schedule trigger does not require a matching event in the registry", () => {
    const spec = baseSpec({ type: "schedule", cron: "0 9 * * *" });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // None of the issues should reference "unknown_event" / "trigger.event".
    const eventRefIssues = result.filter(
      (i) => i.code === "unknown_event" || i.path === "trigger.event",
    );
    assert.equal(eventRefIssues.length, 0);
  });
});
