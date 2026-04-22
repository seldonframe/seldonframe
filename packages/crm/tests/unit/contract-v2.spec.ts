// Unit tests for lib/blocks/contract-v2.ts — typed produces/consumes
// entries, trigger-payload field, and the BLOCK.md parse-side tool
// entry shape. Ships with C3 per Max's "tests alongside code" directive.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EventNameSchema,
  SoulFieldTypeDescriptorSchema,
  ToolEntrySchema,
  TriggerPayloadFieldSchema,
  TypedConsumesEntrySchema,
  TypedProducesEntrySchema,
} from "../../src/lib/blocks/contract-v2";

describe("EventNameSchema", () => {
  test("accepts two-segment dot-notation", () => {
    assert.equal(EventNameSchema.safeParse("contact.created").success, true);
    assert.equal(EventNameSchema.safeParse("booking.no_show").success, true);
    assert.equal(EventNameSchema.safeParse("conversation.turn_received").success, true);
  });

  test("accepts three-segment dot-notation (real events like conversation.turn.received)", () => {
    assert.equal(EventNameSchema.safeParse("conversation.turn.received").success, true);
    assert.equal(EventNameSchema.safeParse("conversation.turn.sent").success, true);
  });

  test("rejects wrong casing, missing dot, or hyphens", () => {
    assert.equal(EventNameSchema.safeParse("ContactCreated").success, false);
    assert.equal(EventNameSchema.safeParse("contact").success, false);
    assert.equal(EventNameSchema.safeParse("contact-created").success, false);
  });
});

describe("TypedProducesEntrySchema", () => {
  test("accepts a typed produces entry with a valid event name", () => {
    assert.equal(TypedProducesEntrySchema.safeParse({ event: "booking.created" }).success, true);
  });

  test("rejects an entry without `event` key", () => {
    assert.equal(TypedProducesEntrySchema.safeParse({ name: "booking.created" }).success, false);
  });

  test("rejects entries where event name fails the dot-notation check", () => {
    assert.equal(TypedProducesEntrySchema.safeParse({ event: "BookingCreated" }).success, false);
  });
});

describe("SoulFieldTypeDescriptorSchema", () => {
  test("accepts primitive descriptors", () => {
    assert.equal(SoulFieldTypeDescriptorSchema.safeParse("string").success, true);
    assert.equal(SoulFieldTypeDescriptorSchema.safeParse("number").success, true);
  });

  test("accepts composite descriptors as strings (structural check is PR 2's job)", () => {
    assert.equal(
      SoulFieldTypeDescriptorSchema.safeParse("Array<{ key: string; label: string }>").success,
      true,
    );
  });

  test("rejects empty string", () => {
    assert.equal(SoulFieldTypeDescriptorSchema.safeParse("").success, false);
  });
});

describe("TriggerPayloadFieldSchema", () => {
  test("accepts a required string field with format hint", () => {
    assert.equal(
      TriggerPayloadFieldSchema.safeParse({ type: "string", format: "uuid", required: true }).success,
      true,
    );
  });

  test("accepts all supported primitive types", () => {
    for (const t of ["string", "number", "boolean", "integer"]) {
      assert.equal(TriggerPayloadFieldSchema.safeParse({ type: t, required: true }).success, true);
    }
  });

  test("required defaults to true when omitted", () => {
    const parsed = TriggerPayloadFieldSchema.parse({ type: "string" });
    assert.equal(parsed.required, true);
  });

  test("rejects unsupported types (e.g., object, array)", () => {
    assert.equal(TriggerPayloadFieldSchema.safeParse({ type: "object", required: true }).success, false);
    assert.equal(TriggerPayloadFieldSchema.safeParse({ type: "array", required: true }).success, false);
  });
});

describe("TypedConsumesEntrySchema", () => {
  test("accepts an event consumer variant", () => {
    assert.equal(
      TypedConsumesEntrySchema.safeParse({ kind: "event", event: "form.submitted" }).success,
      true,
    );
  });

  test("accepts a soul_field consumer variant", () => {
    assert.equal(
      TypedConsumesEntrySchema.safeParse({
        kind: "soul_field",
        soul_field: "workspace.soul.business_type",
        type: "string",
      }).success,
      true,
    );
  });

  test("rejects a soul_field with a malformed path", () => {
    assert.equal(
      TypedConsumesEntrySchema.safeParse({
        kind: "soul_field",
        soul_field: "contact.email", // not workspace.soul.* or workspace.theme.*
        type: "string",
      }).success,
      false,
    );
  });

  test("accepts a trigger_payload consumer variant", () => {
    assert.equal(
      TypedConsumesEntrySchema.safeParse({
        kind: "trigger_payload",
        trigger_payload: {
          contactId: { type: "string", format: "uuid", required: true },
          firstName: { type: "string", required: false },
        },
      }).success,
      true,
    );
  });

  test("rejects an unknown variant kind (e.g., external_state reserved for 2e)", () => {
    assert.equal(
      TypedConsumesEntrySchema.safeParse({ kind: "external_state", event: "review.submitted" }).success,
      false,
    );
  });
});

describe("ToolEntrySchema (BLOCK.md parse-side)", () => {
  test("accepts a well-formed tool entry with JSON-Schema-shaped args/returns", () => {
    const entry = {
      name: "create_contact",
      description: "Create a new CRM contact.",
      args: {
        type: "object",
        properties: { first_name: { type: "string" } },
        required: ["first_name"],
      },
      returns: {
        type: "object",
        properties: { contact: { type: "object" } },
      },
      emits: ["contact.created"],
    };
    assert.equal(ToolEntrySchema.safeParse(entry).success, true);
  });

  test("rejects a tool name that is not snake_case", () => {
    const base = { description: "x", args: {}, returns: {}, emits: [] };
    assert.equal(ToolEntrySchema.safeParse({ ...base, name: "CreateContact" }).success, false);
    assert.equal(ToolEntrySchema.safeParse({ ...base, name: "create-contact" }).success, false);
    assert.equal(ToolEntrySchema.safeParse({ ...base, name: "Create_Contact" }).success, false);
  });

  test("rejects emits with non-event-name strings", () => {
    const entry = {
      name: "create_contact",
      description: "x",
      args: {},
      returns: {},
      emits: ["ContactCreated"],
    };
    assert.equal(ToolEntrySchema.safeParse(entry).success, false);
  });

  test("accepts empty emits list (some tools are pure reads and emit nothing)", () => {
    const entry = {
      name: "list_contacts",
      description: "List contacts.",
      args: {},
      returns: {},
      emits: [],
    };
    assert.equal(ToolEntrySchema.safeParse(entry).success, true);
  });
});
