// Unit tests for lib/agents/types.ts — Predicate / ConversationExit /
// ExtractField / Duration. Ships with C2 per Max's "tests alongside code"
// directive.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ConversationExitSchema,
  DurationSchema,
  ExtractFieldSchema,
  PredicateSchema,
} from "../../src/lib/agents/types";

// ---------------------------------------------------------------------
// PredicateSchema
// ---------------------------------------------------------------------

describe("PredicateSchema", () => {
  test("accepts field_equals with string/number/boolean values", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "field_equals", field: "status", value: "done" }).success, true);
    assert.equal(PredicateSchema.safeParse({ kind: "field_equals", field: "n", value: 42 }).success, true);
    assert.equal(PredicateSchema.safeParse({ kind: "field_equals", field: "flag", value: true }).success, true);
  });

  test("rejects field_equals with null or undefined value", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "field_equals", field: "status", value: null }).success, false);
    assert.equal(PredicateSchema.safeParse({ kind: "field_equals", field: "status" }).success, false);
  });

  test("accepts field_contains with non-empty substring", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "field_contains", field: "notes", substring: "urgent" }).success, true);
  });

  test("rejects field_contains with empty field or substring", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "field_contains", field: "", substring: "x" }).success, false);
    assert.equal(PredicateSchema.safeParse({ kind: "field_contains", field: "f", substring: "" }).success, false);
  });

  test("accepts event_emitted with a dot-notation event name", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "event_emitted", eventType: "booking.created" }).success, true);
  });

  test("rejects event_emitted with a malformed event name", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "event_emitted", eventType: "BookingCreated" }).success, false);
    assert.equal(PredicateSchema.safeParse({ kind: "event_emitted", eventType: "booking" }).success, false);
    assert.equal(PredicateSchema.safeParse({ kind: "event_emitted", eventType: "booking-created" }).success, false);
  });

  test("accepts nested all/any composites", () => {
    const nested = {
      kind: "all",
      of: [
        { kind: "field_exists", field: "email" },
        {
          kind: "any",
          of: [
            { kind: "field_equals", field: "status", value: "done" },
            { kind: "event_emitted", eventType: "form.submitted" },
          ],
        },
      ],
    };
    assert.equal(PredicateSchema.safeParse(nested).success, true);
  });

  test("rejects all/any with empty of: []", () => {
    assert.equal(PredicateSchema.safeParse({ kind: "all", of: [] }).success, false);
    assert.equal(PredicateSchema.safeParse({ kind: "any", of: [] }).success, false);
  });

  test("rejects unknown predicate kinds (e.g., external_state reserved for 2e)", () => {
    assert.equal(
      PredicateSchema.safeParse({ kind: "external_state", event: "review.submitted", window: "48h" }).success,
      false,
    );
  });
});

// ---------------------------------------------------------------------
// ExtractFieldSchema
// ---------------------------------------------------------------------

describe("ExtractFieldSchema", () => {
  test("accepts a basic required string field", () => {
    assert.equal(
      ExtractFieldSchema.safeParse({ type: "string", required: true, description: "Customer's first name" }).success,
      true,
    );
  });

  test("accepts an enum field with non-empty enum_values", () => {
    assert.equal(
      ExtractFieldSchema.safeParse({
        type: "enum",
        enum_values: ["yes", "no", "unsure"],
        required: true,
        description: "Insurance status",
      }).success,
      true,
    );
  });

  test("rejects an enum field with missing or empty enum_values", () => {
    assert.equal(
      ExtractFieldSchema.safeParse({ type: "enum", required: true, description: "x" }).success,
      false,
    );
    assert.equal(
      ExtractFieldSchema.safeParse({ type: "enum", enum_values: [], required: true, description: "x" }).success,
      false,
    );
  });

  test("rejects a non-enum field that carries enum_values", () => {
    assert.equal(
      ExtractFieldSchema.safeParse({ type: "string", enum_values: ["a"], required: true, description: "x" }).success,
      false,
    );
  });

  test("rejects empty description", () => {
    assert.equal(
      ExtractFieldSchema.safeParse({ type: "string", required: true, description: "" }).success,
      false,
    );
  });
});

// ---------------------------------------------------------------------
// DurationSchema
// ---------------------------------------------------------------------

describe("DurationSchema", () => {
  test("accepts supported sub-day forms", () => {
    for (const v of ["PT30S", "PT45M", "PT1H", "PT180M"]) {
      assert.equal(DurationSchema.safeParse(v).success, true, `should accept ${v}`);
    }
  });

  test("accepts supported day-and-up forms", () => {
    for (const v of ["P3D", "P1W", "P2M", "P1Y"]) {
      assert.equal(DurationSchema.safeParse(v).success, true, `should accept ${v}`);
    }
  });

  test("rejects malformed or mixed forms", () => {
    for (const v of ["30m", "PT", "P", "3D", "P1Y2M", "PT1H30M"]) {
      assert.equal(DurationSchema.safeParse(v).success, false, `should reject ${v}`);
    }
  });
});

// ---------------------------------------------------------------------
// ConversationExitSchema
// ---------------------------------------------------------------------

describe("ConversationExitSchema", () => {
  test("accepts a predicate exit with typed extract fields", () => {
    const exit = {
      type: "predicate",
      predicate: { kind: "field_exists", field: "preferred_start" },
      extract: {
        preferred_start: { type: "iso8601", required: true, description: "ISO 8601 timestamp for preferred start" },
        insurance_status: {
          type: "enum",
          enum_values: ["yes", "no", "unsure", "not_asked"],
          required: true,
          description: "Whether the customer has insurance",
        },
      },
      next: "book_consultation",
    };
    assert.equal(ConversationExitSchema.safeParse(exit).success, true);
  });

  test("accepts a timeout exit with ISO 8601 duration and optional extract", () => {
    const exit = {
      type: "timeout",
      after: "PT30M",
      next: "fallback_step",
    };
    assert.equal(ConversationExitSchema.safeParse(exit).success, true);
  });

  test("rejects a predicate exit with missing extract", () => {
    const exit = {
      type: "predicate",
      predicate: { kind: "field_exists", field: "x" },
      next: "y",
    };
    assert.equal(ConversationExitSchema.safeParse(exit).success, false);
  });

  test("rejects a timeout exit with non-ISO duration", () => {
    const exit = { type: "timeout", after: "30 minutes", next: "x" };
    assert.equal(ConversationExitSchema.safeParse(exit).success, false);
  });

  test("accepts next: null (terminal step)", () => {
    const exit = {
      type: "predicate",
      predicate: { kind: "field_exists", field: "x" },
      extract: { x: { type: "string", required: true, description: "x" } },
      next: null,
    };
    assert.equal(ConversationExitSchema.safeParse(exit).success, true);
  });
});
