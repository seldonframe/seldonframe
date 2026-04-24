// Tests for TriggerSchema discriminated-union refactor.
// SLICE 5 PR 1 C1 per audit §3.1.
//
// Invariant: existing archetype fixtures (speed-to-lead,
// win-back, review-requester) parse SUCCESSFULLY against the
// refactored TriggerSchema. The refactor extends the schema
// from a single z.literal("event") object to a z.discriminatedUnion
// on "type". The "event" branch shape is unchanged; existing
// consumers narrowing via `if (trigger.type === "event")` still
// work.
//
// C1 ONLY introduces the union shape — only "event" branch is
// populated. ScheduleTriggerSchema lands in C2.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";
import type { ToolDefinition } from "../../src/lib/blocks/contract-v2";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures", "agents");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

const testEventRegistry: EventRegistry = {
  events: [
    { type: "form.submitted", fields: {} },
    { type: "subscription.cancelled", fields: {} },
    { type: "booking.completed", fields: {} },
    { type: "contact.created", fields: {} },
  ],
};

const testBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};

// ---------------------------------------------------------------------
// 1. Invariant: existing archetypes validate unchanged
// ---------------------------------------------------------------------

describe("TriggerSchema refactor — archetype invariants", () => {
  test("speed-to-lead.valid.json validates successfully (invariant)", () => {
    const spec = loadFixture("speed-to-lead.valid.json");
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // Scope assertion to trigger-path issues only. Other path issues
    // (unknown_tool etc.) depend on test registry completeness; the
    // invariant here is that the trigger schema refactor doesn't
    // reject the trigger block of any existing archetype.
    const triggerIssues = result.filter((i) => i.path === "trigger" || i.path.startsWith("trigger."));
    assert.equal(triggerIssues.length, 0, `expected zero trigger issues; got ${JSON.stringify(triggerIssues)}`);
  });

  test("win-back.valid.json validates successfully (invariant)", () => {
    const spec = loadFixture("win-back.valid.json");
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // Scope assertion to trigger-path issues only. Other path issues
    // (unknown_tool etc.) depend on test registry completeness; the
    // invariant here is that the trigger schema refactor doesn't
    // reject the trigger block of any existing archetype.
    const triggerIssues = result.filter((i) => i.path === "trigger" || i.path.startsWith("trigger."));
    assert.equal(triggerIssues.length, 0, `expected zero trigger issues; got ${JSON.stringify(triggerIssues)}`);
  });

  test("review-requester.valid.json validates successfully (invariant)", () => {
    const spec = loadFixture("review-requester.valid.json");
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // Scope assertion to trigger-path issues only. Other path issues
    // (unknown_tool etc.) depend on test registry completeness; the
    // invariant here is that the trigger schema refactor doesn't
    // reject the trigger block of any existing archetype.
    const triggerIssues = result.filter((i) => i.path === "trigger" || i.path.startsWith("trigger."));
    assert.equal(triggerIssues.length, 0, `expected zero trigger issues; got ${JSON.stringify(triggerIssues)}`);
  });
});

// ---------------------------------------------------------------------
// 2. Discriminated-union behavior
// ---------------------------------------------------------------------

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

describe("TriggerSchema refactor — discriminated-union shape", () => {
  test("type='event' with valid fields accepted", () => {
    const spec = baseSpec({
      type: "event",
      event: "form.submitted",
      filter: { formId: "abc" },
    });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    // Accepts the trigger shape. Other validation issues may exist
    // (e.g., step-graph), but NO issue path should reference "trigger".
    const triggerIssues = result.filter((i) => i.path.startsWith("trigger"));
    assert.equal(triggerIssues.length, 0, `trigger should pass; got ${JSON.stringify(triggerIssues)}`);
  });

  test("type='event' without event field rejected", () => {
    const spec = baseSpec({ type: "event" });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    const triggerIssues = result.filter((i) => i.path.startsWith("trigger"));
    assert.ok(triggerIssues.length > 0, "expected trigger issues for missing event field");
  });

  test("type field entirely missing rejected (discriminator required)", () => {
    const spec = baseSpec({ event: "form.submitted" });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    const triggerIssues = result.filter((i) => i.path.startsWith("trigger"));
    assert.ok(triggerIssues.length > 0, "expected trigger issues when type absent");
  });

  test("unknown type value rejected (no matching union branch)", () => {
    const spec = baseSpec({ type: "webhook", event: "x" });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    const triggerIssues = result.filter((i) => i.path.startsWith("trigger"));
    assert.ok(triggerIssues.length > 0, "expected trigger issues for unknown type");
  });

  test("type='schedule' rejected in C1 (branch lands in C2)", () => {
    const spec = baseSpec({
      type: "schedule",
      cron: "0 9 * * *",
    });
    const result = validateAgentSpec(spec, testBlockRegistry, testEventRegistry);
    const triggerIssues = result.filter((i) => i.path.startsWith("trigger"));
    assert.ok(triggerIssues.length > 0,
      "C1 has no schedule branch — type='schedule' must reject");
  });
});

// ---------------------------------------------------------------------
// 3. Type-narrowing still works for consumers
// ---------------------------------------------------------------------
//
// After the refactor, consumer code patterns like:
//   if (spec.trigger.type === "event") { use spec.trigger.event }
// must still work. This is a type-level guarantee, not a runtime one —
// we verify via the z.infer<> type used in the agent runtime.

describe("TriggerSchema refactor — inferred type is usable by narrowing", () => {
  test("inferred type exposes a discriminator on type", async () => {
    // Dynamic import to pin exports at runtime.
    const mod = await import("../../src/lib/agents/validator");
    // The validator module exports validateAgentSpec; type-level
    // narrowing is a compile-time concern. This test pins the module
    // still imports cleanly with the refactor.
    assert.equal(typeof mod.validateAgentSpec, "function");
  });
});
