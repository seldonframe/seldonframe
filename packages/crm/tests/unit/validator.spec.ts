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
// Unsupported step types (branch / await_event — future scope)
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
