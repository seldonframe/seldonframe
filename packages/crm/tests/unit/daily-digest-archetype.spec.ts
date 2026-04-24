// Tests for the daily-digest archetype template.
// SLICE 5 PR 2 C2 per audit §7.2.
//
// Validates the archetype:
//   1. Exports cleanly from the archetype registry.
//   2. Declares a schedule trigger as its spec-template shape.
//   3. Has all placeholders it references.
//   4. Template shape is consistent with how other archetypes declare.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes, getArchetype } from "../../src/lib/agents/archetypes";
import { dailyDigestArchetype } from "../../src/lib/agents/archetypes/daily-digest";

describe("daily-digest archetype — registry integration", () => {
  test("archetype is discoverable by id", () => {
    const a = getArchetype("daily-digest");
    assert.ok(a, "daily-digest must be in the archetype registry");
    assert.equal(a!.id, "daily-digest");
  });

  test("archetype count grew by 1 (4 total now)", () => {
    assert.equal(Object.keys(archetypes).length, 4);
  });

  test("all existing archetypes still present (21-streak invariant)", () => {
    assert.ok(getArchetype("speed-to-lead"));
    assert.ok(getArchetype("win-back"));
    assert.ok(getArchetype("review-requester"));
    assert.ok(getArchetype("daily-digest"));
  });
});

describe("daily-digest archetype — shape", () => {
  test("id matches filename convention", () => {
    assert.equal(dailyDigestArchetype.id, "daily-digest");
  });

  test("requires crm + email blocks", () => {
    assert.deepEqual(
      [...dailyDigestArchetype.requiresInstalled].sort(),
      ["crm", "email"].sort(),
    );
  });

  test("has user_input + soul_copy placeholders with required metadata", () => {
    for (const [name, ph] of Object.entries(dailyDigestArchetype.placeholders)) {
      assert.ok(ph.kind === "user_input" || ph.kind === "soul_copy",
        `placeholder ${name} must have kind user_input or soul_copy`);
      assert.ok(ph.description && ph.description.length > 0,
        `placeholder ${name} must have a description`);
    }
  });

  test("spec template declares a schedule trigger", () => {
    const trigger = (dailyDigestArchetype.specTemplate as { trigger: { type: string } }).trigger;
    assert.equal(trigger.type, "schedule");
  });

  test("schedule trigger carries cron + timezone placeholders", () => {
    const trigger = (dailyDigestArchetype.specTemplate as {
      trigger: { cron: string; timezone: string };
    }).trigger;
    assert.equal(trigger.cron, "$dailyCron");
    assert.equal(trigger.timezone, "$scheduleTimezone");
  });

  test("schedule trigger has default catchup + concurrency", () => {
    const trigger = (dailyDigestArchetype.specTemplate as {
      trigger: { catchup: string; concurrency: string };
    }).trigger;
    assert.equal(trigger.catchup, "skip");
    assert.equal(trigger.concurrency, "skip");
  });

  test("spec template has exactly one send_email step", () => {
    const steps = (dailyDigestArchetype.specTemplate as {
      steps: Array<{ type: string; tool?: string }>;
    }).steps;
    assert.equal(steps.length, 1);
    assert.equal(steps[0].type, "mcp_tool_call");
    assert.equal(steps[0].tool, "send_email");
  });

  test("every $placeholder in spec template has a declaration", () => {
    // Extract all $-prefixed tokens from the spec template JSON.
    const json = JSON.stringify(dailyDigestArchetype.specTemplate);
    const placeholderMatches = json.match(/\$[a-zA-Z][a-zA-Z0-9_]*/g) ?? [];
    const used = new Set(placeholderMatches);
    for (const token of used) {
      assert.ok(
        token in dailyDigestArchetype.placeholders,
        `spec template references ${token} but it's not declared in placeholders`,
      );
    }
  });
});
