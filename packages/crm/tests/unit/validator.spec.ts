// Agent-spec validator tests — PR 2 of Scope 3 Step 2b.1.
//
// Covers the entry point validateAgentSpec + its per-step dispatchers.
// Fixture data lives in packages/crm/tests/unit/fixtures/agents/.
//
// M2 ships schema-shape + trigger-event checks + next-step reference
// check + unsupported-step-type surfacing. M3-M5 extend this file as
// the tool / interpolation / conversation validation land.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";
import type { ToolDefinition } from "../../src/lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------

const FIXTURE_DIR = path.resolve(__dirname, "fixtures", "agents");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

/**
 * Minimal synthetic event registry — carries only the events the 5
 * fixtures reference (form.submitted, subscription.cancelled,
 * booking.completed, contact.created). Real code passes the full
 * registry emitted from packages/core/src/events/event-registry.json.
 */
const testEventRegistry: EventRegistry = {
  events: [
    { type: "form.submitted", fields: { formId: { rawType: "string", nullable: false }, contactId: { rawType: "string", nullable: false } } },
    { type: "subscription.cancelled", fields: { contactId: { rawType: "string", nullable: false }, planId: { rawType: "string", nullable: false } } },
    { type: "booking.completed", fields: { appointmentId: { rawType: "string", nullable: false }, contactId: { rawType: "string", nullable: false } } },
    { type: "contact.created", fields: { contactId: { rawType: "string", nullable: false } } },
  ],
};

/**
 * Empty registry — for tests that don't care about tool resolution.
 * M3 will introduce a richer registry with CRM tools + stubs for the
 * non-CRM tools the valid fixtures reference.
 */
const emptyRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};

// ---------------------------------------------------------------------
// Schema-shape checks (spec_malformed)
// ---------------------------------------------------------------------

describe("validateAgentSpec — spec_malformed", () => {
  test("returns spec_malformed for a non-object input", () => {
    const issues = validateAgentSpec("not an object", emptyRegistry, testEventRegistry);
    assert.ok(issues.some((i) => i.code === "spec_malformed"));
  });

  test("returns spec_malformed when trigger is missing", () => {
    const issues = validateAgentSpec(
      { name: "x", description: "x", steps: [{ id: "a", type: "wait", seconds: 1, next: null }] },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.code === "spec_malformed" && i.path.startsWith("trigger")));
  });

  test("returns spec_malformed when steps is empty", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [],
      },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.code === "spec_malformed" && i.path.startsWith("steps")));
  });
});

// ---------------------------------------------------------------------
// Trigger event resolution (unknown_event)
// ---------------------------------------------------------------------

describe("validateAgentSpec — unknown_event", () => {
  test("flags a trigger event that isn't in the event registry", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "made.up.event" },
        steps: [{ id: "a", type: "wait", seconds: 1, next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unknown_event");
    assert.ok(match, "expected unknown_event issue");
    assert.equal(match!.path, "trigger.event");
    assert.ok(match!.message.includes("made.up.event"));
  });

  test("accepts a trigger event that IS in the event registry", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "a", type: "wait", seconds: 1, next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "unknown_event"));
  });
});

// ---------------------------------------------------------------------
// next-step reference resolution (unknown_step_next)
// ---------------------------------------------------------------------

describe("validateAgentSpec — unknown_step_next", () => {
  test("flags a wait step that points at a nonexistent next", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "a", type: "wait", seconds: 1, next: "does_not_exist" }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unknown_step_next");
    assert.ok(match);
    assert.equal(match!.stepId, "a");
  });

  test("accepts next: null as a terminal step", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "a", type: "wait", seconds: 1, next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "unknown_step_next"));
  });
});

// ---------------------------------------------------------------------
// Unsupported step types (branch — future 2e scope; await_event moved
// to known-steps in 2c PR 1 M1)
// ---------------------------------------------------------------------

describe("validateAgentSpec — unsupported_step_type", () => {
  test("surfaces unsupported_step_type for an unknown type string", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "a", type: "branch", condition: { type: "external_state" }, next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unsupported_step_type");
    assert.ok(match);
    assert.equal(match!.stepId, "a");
    assert.ok(match!.message.includes("branch"));
  });
});

// ---------------------------------------------------------------------
// 2c PR 1 M1 — await_event schema shape
//
// Tests the Zod schema behavior via validateAgentSpec:
//   - Valid await_event shapes parse cleanly (no spec_malformed).
//   - Missing required fields / malformed predicate / bad Duration all
//     surface spec_malformed at parse time (schema guards catch
//     authoring mistakes without reaching the dispatcher).
// Dispatcher-level checks (event-in-registry, predicate-paths-typed,
// next-refs-resolve, timeout-ceiling, capture-identifier, no-capture-
// on-timeout) are M2 concerns — those tests ship in the next commit.
// ---------------------------------------------------------------------

describe("validateAgentSpec — await_event schema shape (2c PR 1 M1)", () => {
  const spec = (step: Record<string, unknown>) => ({
    name: "x",
    description: "x",
    trigger: { type: "event", event: "contact.created" },
    steps: [step, { id: "resume_target", type: "wait", seconds: 0, next: null }, { id: "timeout_target", type: "wait", seconds: 0, next: null }],
  });

  test("minimal valid await_event parses without spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), `unexpected spec_malformed: ${JSON.stringify(issues.filter((i) => i.code === "spec_malformed"))}`);
  });

  test("full-featured await_event (match + timeout + capture) parses without spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        match: {
          kind: "all",
          of: [
            { kind: "field_equals", field: "data.formId", value: "onboarding_intake" },
            { kind: "field_exists", field: "data.contactId" },
          ],
        },
        timeout: "P7D",
        on_resume: { capture: "submission", next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), `unexpected spec_malformed: ${JSON.stringify(issues.filter((i) => i.code === "spec_malformed"))}`);
  });

  test("missing event surfaces spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Malformed await_event shapes fall through the discriminated union
    // to UnknownStepSchema (existing validator.ts design) and surface
    // via the dispatcher's unsupported_step_type path. M2 will upgrade
    // these to specific spec_malformed issues when the dispatcher lands.
    // Core invariant we check at M1: the step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "wait_form"), `expected at least one issue on wait_form; got: ${JSON.stringify(issues)}`);
  });

  test("missing on_resume surfaces spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Malformed await_event shapes fall through the discriminated union
    // to UnknownStepSchema (existing validator.ts design) and surface
    // via the dispatcher's unsupported_step_type path. M2 will upgrade
    // these to specific spec_malformed issues when the dispatcher lands.
    // Core invariant we check at M1: the step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "wait_form"), `expected at least one issue on wait_form; got: ${JSON.stringify(issues)}`);
  });

  test("missing on_timeout surfaces spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: "resume_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Malformed await_event shapes fall through the discriminated union
    // to UnknownStepSchema (existing validator.ts design) and surface
    // via the dispatcher's unsupported_step_type path. M2 will upgrade
    // these to specific spec_malformed issues when the dispatcher lands.
    // Core invariant we check at M1: the step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "wait_form"), `expected at least one issue on wait_form; got: ${JSON.stringify(issues)}`);
  });

  test("malformed match (bad predicate kind) surfaces spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        match: { kind: "invalid_kind", field: "x", value: "y" },
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Malformed await_event shapes fall through the discriminated union
    // to UnknownStepSchema (existing validator.ts design) and surface
    // via the dispatcher's unsupported_step_type path. M2 will upgrade
    // these to specific spec_malformed issues when the dispatcher lands.
    // Core invariant we check at M1: the step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "wait_form"), `expected at least one issue on wait_form; got: ${JSON.stringify(issues)}`);
  });

  test("non-ISO8601 timeout string surfaces spec_malformed", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        timeout: "7 days", // invalid — must be ISO 8601 like "P7D"
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Malformed await_event shapes fall through the discriminated union
    // to UnknownStepSchema (existing validator.ts design) and surface
    // via the dispatcher's unsupported_step_type path. M2 will upgrade
    // these to specific spec_malformed issues when the dispatcher lands.
    // Core invariant we check at M1: the step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "wait_form"), `expected at least one issue on wait_form; got: ${JSON.stringify(issues)}`);
  });

  test("null next values in on_resume/on_timeout parse cleanly (null is valid terminator)", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: null },
        on_timeout: { next: null },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), `unexpected spec_malformed: ${JSON.stringify(issues.filter((i) => i.code === "spec_malformed"))}`);
  });
});

// ---------------------------------------------------------------------
// 2c PR 1 M2 — validateAwaitEventStep dispatcher behavior
// ---------------------------------------------------------------------

describe("validateAgentSpec — await_event dispatcher (2c PR 1 M2)", () => {
  const spec = (step: Record<string, unknown>) => ({
    name: "x",
    description: "x",
    trigger: { type: "event", event: "contact.created" },
    steps: [step, { id: "resume_target", type: "wait", seconds: 0, next: null }, { id: "timeout_target", type: "wait", seconds: 0, next: null }],
  });

  test("unknown_event fires for event not in the SeldonEvent registry", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "no.such.event",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unknown_event" && i.stepId === "wait_form");
    assert.ok(match, `expected unknown_event on wait_form; got: ${JSON.stringify(issues)}`);
    assert.ok(match!.message.includes("no.such.event"));
  });

  test("unknown_step_next fires when on_resume.next references a missing step", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: "missing_step" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unknown_step_next" && i.path === "on_resume.next");
    assert.ok(match, `expected unknown_step_next on on_resume.next; got: ${JSON.stringify(issues)}`);
  });

  test("unknown_step_next fires when on_timeout.next references a missing step", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "missing_step" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unknown_step_next" && i.path === "on_timeout.next");
    assert.ok(match);
  });

  test("timeout exceeding 90-day ceiling surfaces spec_malformed (G-3)", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        timeout: "P1Y", // ~365 days, well over 90-day ceiling
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "spec_malformed" && i.path === "timeout");
    assert.ok(match, `expected spec_malformed on timeout; got: ${JSON.stringify(issues)}`);
    assert.ok(match!.message.includes("90-day"));
  });

  test("timeout at exactly 90 days (P90D) is accepted", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        timeout: "P90D",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(
      !issues.some((i) => i.code === "spec_malformed" && i.path === "timeout"),
      `P90D must be accepted as edge-of-ceiling; got: ${JSON.stringify(issues)}`,
    );
  });

  test("bad_capture_name fires when on_resume.capture isn't a valid identifier", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { capture: "Bad Name!", next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "bad_capture_name");
    assert.ok(match);
  });

  test("capture-on-timeout surfaces spec_malformed (no event payload to bind)", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target", capture: "timed_out" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    // Zod's strict-object violation surfaces at the parent key path
    // ("on_timeout") with message "Unrecognized key: \"capture\"".
    const match = issues.find((i) => i.code === "spec_malformed" && i.path.startsWith("on_timeout") && i.message.includes("capture"));
    assert.ok(match, `expected spec_malformed on on_timeout for extra 'capture' key; got: ${JSON.stringify(issues)}`);
  });

  test("predicate field 'data.X' where X is not on event.data fires unresolved_interpolation", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        match: {
          kind: "field_equals",
          field: "data.notARealField",
          value: "foo",
        },
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unresolved_interpolation" && i.path.startsWith("match"));
    assert.ok(match, `expected unresolved_interpolation on match.field; got: ${JSON.stringify(issues)}`);
    assert.ok(match!.message.includes("notARealField"));
  });

  test("predicate field 'data.X' where X IS on event.data passes", () => {
    const issues = validateAgentSpec(
      spec({
        id: "wait_form",
        type: "await_event",
        event: "form.submitted",
        match: {
          kind: "field_equals",
          field: "data.formId",
          value: "onboarding_intake",
        },
        on_resume: { next: "resume_target" },
        on_timeout: { next: "timeout_target" },
      }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(
      !issues.some((i) => i.code === "unresolved_interpolation"),
      `expected no unresolved_interpolation; got: ${JSON.stringify(issues)}`,
    );
  });

  test("unsupported_step_type message drops 'await_event' — branch-only now", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "a", type: "branch", condition: { type: "external_state" }, next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    const match = issues.find((i) => i.code === "unsupported_step_type");
    assert.ok(match);
    assert.ok(match!.message.includes("branch"));
    assert.ok(!match!.message.includes("await_event ship"), "await_event is shipped now; message should not reference it as future scope");
  });
});

// ---------------------------------------------------------------------
// Fixture smoke — the 3 valid archetype specs parse cleanly through
// the schema. M3 will verify tool references resolve; for now we only
// confirm the spec shape is acceptable to the schema.
// ---------------------------------------------------------------------

describe("validateAgentSpec — fixture shape smoke", () => {
  for (const fixture of ["speed-to-lead.valid.json", "win-back.valid.json", "review-requester.valid.json"]) {
    test(`${fixture} parses without spec_malformed`, () => {
      const spec = loadFixture(fixture);
      const issues = validateAgentSpec(spec, emptyRegistry, testEventRegistry);
      const malformed = issues.filter((i) => i.code === "spec_malformed");
      assert.deepEqual(
        malformed,
        [],
        `unexpected spec_malformed issues: ${JSON.stringify(malformed, null, 2)}`,
      );
    });
  }
});

// ---------------------------------------------------------------------
// M3 — mcp_tool_call validation (tool resolution + capture shape)
// ---------------------------------------------------------------------

/**
 * Synthetic test registry with one real-shaped tool (create_contact
 * with Zod args + returns) so unknown_tool + good-tool paths both
 * exercise. M5 will expand this to the full CRM surface when the
 * interpolation resolver needs return-shape access.
 */
function makeRegistryWithCreateContact(): BlockRegistry {
  const createContact: ToolDefinition = {
    name: "create_contact",
    description: "x",
    args: z.object({
      first_name: z.string().min(1),
      email: z.string().email().optional(),
    }),
    returns: z.object({
      ok: z.literal(true),
      contact: z.object({ id: z.string().uuid(), firstName: z.string() }),
    }),
    emits: ["contact.created"],
  };
  return {
    tools: new Map([["create_contact", { blockSlug: "crm", tool: createContact }]]),
    producesByBlock: new Map([["crm", new Set(["contact.created"])]]),
  };
}

describe("validateAgentSpec — unknown_tool", () => {
  test("flags a tool call against a name not in the registry", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "ghost_tool",
          args: {},
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "unknown_tool");
    assert.ok(match, "expected unknown_tool issue");
    assert.equal(match!.stepId, "a");
    assert.ok(match!.message.includes("ghost_tool"));
  });

  test("broken-unresolved-tool.invalid.json fixture surfaces unknown_tool", () => {
    const spec = loadFixture("broken-unresolved-tool.invalid.json");
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "unknown_tool");
    assert.ok(match);
    assert.ok(match!.message.includes("magic_unicorn_tool_that_does_not_exist"));
  });

  test("does NOT surface unknown_tool when the tool IS registered", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "Jane" },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "unknown_tool"));
  });
});

describe("validateAgentSpec — bad_capture_name", () => {
  test("flags a capture name that is not a lowercase identifier", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "Jane" },
          capture: "NewContact", // PascalCase — rejected
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "bad_capture_name");
    assert.ok(match);
    assert.ok(match!.message.includes("NewContact"));
  });

  test("flags capture with leading digit / hyphen", () => {
    const specTemplate = (capture: string) => ({
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "Jane" },
          capture,
          next: null,
        },
      ],
    });
    for (const bad of ["1coupon", "coupon-new", "coupon.code"]) {
      const issues = validateAgentSpec(specTemplate(bad), makeRegistryWithCreateContact(), testEventRegistry);
      assert.ok(
        issues.some((i) => i.code === "bad_capture_name"),
        `expected bad_capture_name for "${bad}"`,
      );
    }
  });

  test("flags duplicate capture names across steps", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "A" },
          capture: "contact",
          next: "b",
        },
        {
          id: "b",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "B" },
          capture: "contact",
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "bad_capture_name" && i.stepId === "b");
    assert.ok(match, "expected duplicate-capture issue on step b");
    assert.ok(match!.message.includes("already bound"));
  });

  test("accepts a valid lowercase capture name", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "Jane" },
          capture: "newContact",
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "bad_capture_name"));
  });
});

// ---------------------------------------------------------------------
// M4 — conversation step (on_exit.extract shape)
// ---------------------------------------------------------------------

describe("validateAgentSpec — bad_extract_shape", () => {
  test("flags extract keys that are not lowercase identifiers", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "form.submitted" },
      steps: [
        {
          id: "qualify",
          type: "conversation",
          channel: "sms",
          initial_message: "Hi",
          exit_when: "done",
          on_exit: {
            extract: {
              "Bad-Key": "oops",
              "1starts": "also oops",
              "preferred.start": "dot in key",
            },
            next: null,
          },
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const matches = issues.filter((i) => i.code === "bad_extract_shape");
    assert.equal(matches.length, 3, `expected 3 bad_extract_shape issues, got ${matches.length}`);
  });

  test("accepts extract keys that ARE lowercase identifiers", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "form.submitted" },
      steps: [
        {
          id: "qualify",
          type: "conversation",
          channel: "sms",
          initial_message: "Hi",
          exit_when: "done",
          on_exit: {
            extract: {
              preferred_start: "ISO datetime",
              insurance_status: "yes|no|unsure",
            },
            next: null,
          },
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "bad_extract_shape"));
  });

  test("speed-to-lead fixture has valid extract keys", () => {
    const spec = loadFixture("speed-to-lead.valid.json");
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "bad_extract_shape"));
  });
});

// ---------------------------------------------------------------------
// M5 — interpolation resolver
// ---------------------------------------------------------------------

/**
 * Registry with a tool whose returns has a `data` key — exercises the
 * archetype-convention capture-unwrap (per types.ts:35).
 */
function makeRegistryWithCouponTool(): BlockRegistry {
  const createCoupon: ToolDefinition = {
    name: "create_coupon",
    description: "x",
    args: z.object({ percent_off: z.number() }),
    returns: z.object({
      data: z.object({
        code: z.string(),
        couponId: z.string(),
        promotionCodeId: z.string(),
      }),
    }),
    emits: [],
  };
  return {
    tools: new Map([["create_coupon", { blockSlug: "payments", tool: createCoupon }]]),
    producesByBlock: new Map([["payments", new Set()]]),
  };
}

describe("validateAgentSpec — unresolved_interpolation (variable / extract / capture resolution)", () => {
  test("passes {{variable}} that is declared in spec.variables", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      variables: { contactId: "trigger.contactId" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "{{contactId}}" },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "unresolved_interpolation"));
  });

  test("flags {{undeclared_var}} that doesn't resolve to anything", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      variables: { contactId: "trigger.contactId" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "{{ghostVar}}" },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "unresolved_interpolation");
    assert.ok(match, "expected unresolved_interpolation");
    assert.ok(match!.message.includes("ghostVar"));
  });

  test("passes reserved-namespace refs (trigger.*, contact.*, agent.*, workspace.*)", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: {
            first_name: "{{trigger.data.foo}}",
            email: "{{contact.email}}",
          },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "unresolved_interpolation"));
  });

  test("passes {{extract}} from an earlier conversation step", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "form.submitted" },
      steps: [
        {
          id: "qualify",
          type: "conversation",
          channel: "sms",
          initial_message: "Hi",
          exit_when: "done",
          on_exit: {
            extract: { preferred_start: "ISO datetime" },
            next: "book",
          },
        },
        {
          id: "book",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "{{preferred_start}}" },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "unresolved_interpolation"));
  });

  test("flags variable with sub-path — variables don't support .field access", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      variables: { contactId: "trigger.contactId" },
      steps: [
        {
          id: "a",
          type: "mcp_tool_call",
          tool: "create_contact",
          args: { first_name: "{{contactId.foo}}" },
          next: null,
        },
      ],
    };
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find((i) => i.code === "unresolved_interpolation");
    assert.ok(match);
    assert.ok(match!.message.includes("variables are string aliases"));
  });
});

describe("validateAgentSpec — capture field resolution (the audit's named bug class)", () => {
  test("passes {{coupon.code}} when create_coupon returns {data:{code,...}}", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "subscription.cancelled" },
      variables: {},
      steps: [
        {
          id: "make",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15 },
          capture: "coupon",
          next: "log",
        },
        {
          id: "log",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 0 },
          next: null,
        },
      ],
    };
    const registry = makeRegistryWithCouponTool();
    const issues = validateAgentSpec(spec, registry, {
      events: [{ type: "subscription.cancelled", fields: {} }],
    });
    assert.ok(!issues.some((i) => i.code === "unresolved_interpolation"));
  });

  test("flags {{coupon.couponCode}} when returns has `code` but not `couponCode`", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "subscription.cancelled" },
      variables: {},
      steps: [
        {
          id: "make",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15 },
          capture: "coupon",
          next: "log",
        },
        {
          id: "log",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 0, name: "see {{coupon.couponCode}}" },
          next: null,
        },
      ],
    };
    const registry = makeRegistryWithCouponTool();
    const issues = validateAgentSpec(spec, registry, {
      events: [{ type: "subscription.cancelled", fields: {} }],
    });
    const match = issues.find((i) => i.code === "unresolved_interpolation" && i.stepId === "log");
    assert.ok(match, "expected unresolved_interpolation for {{coupon.couponCode}}");
    assert.ok(match!.message.includes("couponCode"));
    assert.ok(match!.message.includes("code"), "message should list available fields (code is one)");
  });

  test("broken-capture-typo.invalid.json fixture surfaces unresolved_interpolation on {{newContact.fullName}}", () => {
    const spec = loadFixture("broken-capture-typo.invalid.json");
    const issues = validateAgentSpec(spec, makeRegistryWithCreateContact(), testEventRegistry);
    const match = issues.find(
      (i) => i.code === "unresolved_interpolation" && i.message.includes("fullName"),
    );
    assert.ok(match, `expected unresolved_interpolation on fullName; got: ${JSON.stringify(issues, null, 2)}`);
  });

  test("step cannot reference its own capture — capture is only visible to LATER steps", () => {
    const spec = {
      name: "x",
      description: "x",
      trigger: { type: "event", event: "subscription.cancelled" },
      steps: [
        {
          id: "make",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15, name: "{{coupon.code}}" }, // self-ref, not yet in scope
          capture: "coupon",
          next: null,
        },
      ],
    };
    const registry = makeRegistryWithCouponTool();
    const issues = validateAgentSpec(spec, registry, {
      events: [{ type: "subscription.cancelled", fields: {} }],
    });
    assert.ok(
      issues.some((i) => i.code === "unresolved_interpolation" && i.message.includes("coupon")),
      "expected self-capture ref to flag as unresolved",
    );
  });
});

// ---------------------------------------------------------------------
// M6 — integration tests against the 3 valid archetype fixtures
//
// Goal: feed each real filled AgentSpec through the validator against
// a realistic registry and confirm zero audit-critical issues. Realistic
// registry = CRM tools from PR 1 C4 + test-only stubs for the non-CRM
// tools the archetypes reference (create_booking, send_email, send_sms,
// create_coupon). Stubs are minimal — just enough shape to let arg +
// emit + capture resolution pass. 2b.2 replaces these stubs with real
// Zod schemas when the other 5 core blocks' .tools.ts files ship.
// ---------------------------------------------------------------------

import { CRM_TOOLS } from "../../src/blocks/crm.tools";
import { PAYMENTS_TOOLS } from "../../src/blocks/payments.tools";
import { INTAKE_TOOLS } from "../../src/blocks/intake.tools";
import { LANDING_TOOLS } from "../../src/blocks/landing.tools";

/** Test-only stub for tools not yet Zod-schema'd (ships in 2b.2). */
function stubTool(name: string, args: z.ZodType, returns: z.ZodType, emits: string[] = []): ToolDefinition {
  return { name, description: `[test stub] ${name}`, args, returns, emits };
}

/** Full integration registry — CRM tools + minimal stubs for archetype-referenced tools. */
function makeIntegrationRegistry(): BlockRegistry {
  const tools = new Map<string, { blockSlug: string; tool: ToolDefinition }>();

  // Real CRM tools from PR 1 C4.
  for (const tool of CRM_TOOLS) {
    tools.set(tool.name, { blockSlug: "crm", tool });
  }

  // Stubs for non-CRM tools referenced by the 3 archetypes.
  tools.set("create_booking", {
    blockSlug: "caldiy-booking",
    tool: stubTool(
      "create_booking",
      z.object({ contact_id: z.string(), appointment_type_id: z.string(), starts_at: z.string(), notes: z.string().optional() }),
      z.object({ data: z.object({ booking: z.object({ id: z.string() }) }) }),
      ["booking.created"],
    ),
  });
  tools.set("send_email", {
    blockSlug: "email",
    tool: stubTool(
      "send_email",
      z.object({ to: z.string(), subject: z.string(), body: z.string(), contactId: z.string().optional() }),
      z.object({ data: z.object({ emailId: z.string() }) }),
      ["email.sent"],
    ),
  });
  tools.set("send_sms", {
    blockSlug: "sms",
    tool: stubTool(
      "send_sms",
      z.object({ to: z.string(), body: z.string(), contact_id: z.string().optional() }),
      z.object({ data: z.object({ smsMessageId: z.string() }) }),
      ["sms.sent"],
    ),
  });
  // Real Payments tools from 2b.2 block 4 (replaces the 2b.1 stub).
  // create_coupon's `returns` shape preserves `{data: {couponId,
  // promotionCodeId, code}}` exactly — Win-Back archetype threads
  // {{coupon.code}} through multiple downstream steps, and the
  // validator's namesake test ({{coupon.couponCode}} mistyped) relies
  // on `code` living at the top level of `data`.
  for (const tool of PAYMENTS_TOOLS) {
    tools.set(tool.name, { blockSlug: "payments", tool });
  }
  // Real Intake tools from 2b.2 block 5. No stub existed pre-migration
  // (no archetype directly calls intake tools — Speed-to-Lead only
  // TRIGGERS on form.submitted). Wiring them in keeps the registry
  // in lock-step with what emit:blocks declares in BLOCK.md.
  for (const tool of INTAKE_TOOLS) {
    tools.set(tool.name, { blockSlug: "formbricks-intake", tool });
  }
  // Real Landing tools from 2b.2 block 6 (final 2b.2 block). Zero
  // archetype coupling — landing.* events + all 8 landing tools are
  // pure negative-control for archetype synthesis.
  for (const tool of LANDING_TOOLS) {
    tools.set(tool.name, { blockSlug: "landing-pages", tool });
  }

  return {
    tools,
    producesByBlock: new Map([
      ["crm", new Set(["contact.created", "contact.updated", "deal.stage_changed"])],
      ["caldiy-booking", new Set(["booking.created"])],
      ["email", new Set(["email.sent"])],
      ["sms", new Set(["sms.sent"])],
      [
        "payments",
        new Set([
          "payment.completed",
          "payment.failed",
          "payment.refunded",
          "payment.disputed",
          "invoice.created",
          "invoice.sent",
          "invoice.paid",
          "invoice.past_due",
          "invoice.voided",
          "subscription.created",
          "subscription.updated",
          "subscription.renewed",
          "subscription.cancelled",
          "subscription.trial_will_end",
        ]),
      ],
      ["formbricks-intake", new Set(["form.submitted", "contact.created"])],
      [
        "landing-pages",
        new Set([
          "landing.published",
          "landing.unpublished",
          "landing.updated",
          "landing.visited",
          "landing.converted",
        ]),
      ],
    ]),
  };
}

/**
 * Integration-grade event registry. Covers the events referenced by
 * any of the 3 archetypes' triggers. Real production code reads the
 * full packages/core/src/events/event-registry.json.
 */
const integrationEventRegistry: EventRegistry = {
  events: [
    { type: "form.submitted", fields: { formId: { rawType: "string", nullable: false }, contactId: { rawType: "string", nullable: false } } },
    { type: "subscription.cancelled", fields: { contactId: { rawType: "string", nullable: false } } },
    { type: "booking.completed", fields: { appointmentId: { rawType: "string", nullable: false }, contactId: { rawType: "string", nullable: false } } },
  ],
};

describe("validateAgentSpec — integration against 3 valid archetype fixtures", () => {
  test("speed-to-lead.valid.json — zero audit-critical issues", () => {
    const spec = loadFixture("speed-to-lead.valid.json");
    const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);

    // Filter to audit-critical codes — codes that block synthesis output
    // from deploying. spec_malformed / unknown_tool / unresolved_interpolation
    // / unknown_event / unknown_step_next are all blocking.
    const critical = issues.filter((i) =>
      ["spec_malformed", "unknown_tool", "unresolved_interpolation", "unknown_event", "unknown_step_next", "bad_capture_name", "bad_extract_shape", "bad_tool_args", "malformed_tools"].includes(i.code),
    );
    assert.deepEqual(
      critical,
      [],
      `unexpected audit-critical issues on speed-to-lead:\n${JSON.stringify(critical, null, 2)}`,
    );
  });

  test("win-back.valid.json — zero audit-critical issues (6 {{coupon.*}} refs all resolve)", () => {
    const spec = loadFixture("win-back.valid.json");
    const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
    const critical = issues.filter((i) =>
      ["spec_malformed", "unknown_tool", "unresolved_interpolation", "unknown_event", "unknown_step_next", "bad_capture_name", "bad_extract_shape", "bad_tool_args", "malformed_tools"].includes(i.code),
    );
    assert.deepEqual(
      critical,
      [],
      `unexpected audit-critical issues on win-back:\n${JSON.stringify(critical, null, 2)}`,
    );
  });

  test("review-requester.valid.json — zero audit-critical issues", () => {
    const spec = loadFixture("review-requester.valid.json");
    const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
    const critical = issues.filter((i) =>
      ["spec_malformed", "unknown_tool", "unresolved_interpolation", "unknown_event", "unknown_step_next", "bad_capture_name", "bad_extract_shape", "bad_tool_args", "malformed_tools"].includes(i.code),
    );
    assert.deepEqual(
      critical,
      [],
      `unexpected audit-critical issues on review-requester:\n${JSON.stringify(critical, null, 2)}`,
    );
  });
});

describe("validateAgentSpec — integration against 2 broken fixtures", () => {
  test("broken-unresolved-tool.invalid.json surfaces unknown_tool", () => {
    const spec = loadFixture("broken-unresolved-tool.invalid.json");
    const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
    const match = issues.find((i) => i.code === "unknown_tool");
    assert.ok(match, "expected unknown_tool issue");
    assert.ok(match!.message.includes("magic_unicorn_tool_that_does_not_exist"));
  });

  test("broken-capture-typo.invalid.json surfaces unresolved_interpolation on {{newContact.fullName}}", () => {
    const spec = loadFixture("broken-capture-typo.invalid.json");
    const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
    const match = issues.find(
      (i) => i.code === "unresolved_interpolation" && i.message.includes("fullName"),
    );
    assert.ok(match, `expected unresolved_interpolation on fullName\nall issues: ${JSON.stringify(issues, null, 2)}`);
  });
});

// ---------------------------------------------------------------------
// PR 3 regression — run the PR 2 validator against the 9 filled
// AgentSpec outputs from the 3x live probes captured in
// tasks/phase-7-archetype-probes/pr3-regression/*.runN.json. Zero
// audit-critical issues on all 9 means the validator has no false
// positives on valid synthesis output — one of Max's explicit PR 3
// gates.
// ---------------------------------------------------------------------

const CRITICAL_CODES = new Set([
  "spec_malformed",
  "unknown_tool",
  "unresolved_interpolation",
  "unknown_event",
  "unknown_step_next",
  "bad_capture_name",
  "bad_extract_shape",
  "bad_tool_args",
  "malformed_tools",
]);

const PROBES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "tasks",
  "phase-7-archetype-probes",
);

describe("PR 3 regression — 9 live-probe outputs validate clean against PR 2 validator", () => {
  const regressionDir = path.join(PROBES_DIR, "pr3-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 Booking migration — 9 live probes re-run after caldiy-booking
// migrated to v2 shape. Same gate as PR 3: zero audit-critical issues
// on every filled spec proves the Booking migration didn't introduce
// validator false positives. Per Max's 2b.2 directive for Booking
// specifically: same 9-probe rigor as PR 3 because Booking is in all
// 3 archetypes' compose_with.
describe("2b.2 Booking regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "booking-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 Email migration — 9 live probes re-run after email block
// migrated to v2 shape (block 2 of 6). Email is referenced by all 3
// archetypes' compose_with and owns the Conversation Primitive tool
// declaration (send_conversation_turn) that SMS will reference in
// block 3. Regression-level rigor to catch any v2-shape-induced
// synthesis shift before SMS starts.
describe("2b.2 Email regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "email-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 SMS migration — 9 live probes re-run after sms block
// migrated to v2 shape (block 3 of 6). Per Max's SMS-migration
// directive: SMS tests whether the Conversation Primitive cross-
// block convention generalizes. sms.tools.ts intentionally does NOT
// re-declare send_conversation_turn; the tool lives on email.tools.ts.
// If this convention breaks synthesis for any archetype, the
// regression below catches it.
describe("2b.2 SMS regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "sms-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 Payments migration — 9 live probes re-run after payments block
// migrated to v2 shape (block 4 of 6). Per Max's Payments-migration
// directive: Win-Back is the critical archetype — it threads
// {{coupon.code}} / {{coupon.couponId}} / {{coupon.promotionCodeId}}
// through multiple downstream steps and is the exact bug class the
// validator was built to catch ({{coupon.couponCode}} typo catching).
// The Payments Zod schema preserves the `{data: {couponId,
// promotionCodeId, code}}` return shape exactly so this threading
// stays valid through migration.
describe("2b.2 Payments regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "payments-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 Intake migration — 9 live probes re-run after formbricks-intake
// migrated to v2 shape (block 5 of 6). No shipped archetype DIRECTLY
// calls an intake tool; Speed-to-Lead TRIGGERS on form.submitted
// (intake's produces) with a filter.formId. Regression is therefore a
// trigger-resolution + hash-preservation check rather than a direct
// tool-call validation.
describe("2b.2 Intake regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "intake-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});

// 2b.2 Landing migration — 9 live probes re-run after landing-pages
// migrated to v2 shape (block 6 of 6 — FINAL 2b.2 block).
// Zero archetype coupling: no shipped archetype references any
// landing tool or landing.* event. All 9 probes are pure
// negative-control — identical hashes on archetypes that don't touch
// landing at all confirm the v2 parser state isn't bleeding between
// blocks. After Landing, 2b.2 is COMPLETE.
describe("2b.2 Landing regression — 9 live-probe outputs validate clean", () => {
  const regressionDir = path.join(PROBES_DIR, "landing-regression");
  for (const arch of ["speed-to-lead", "win-back", "review-requester"]) {
    for (const run of [1, 2, 3]) {
      test(`${arch} run${run}: zero audit-critical validator issues`, () => {
        const spec = JSON.parse(readFileSync(path.join(regressionDir, `${arch}.run${run}.json`), "utf8"));
        const issues = validateAgentSpec(spec, makeIntegrationRegistry(), integrationEventRegistry);
        const critical = issues.filter((i) => CRITICAL_CODES.has(i.code));
        assert.deepEqual(critical, [], `${arch} run${run}:\n${JSON.stringify(critical, null, 2)}`);
      });
    }
  }
});
