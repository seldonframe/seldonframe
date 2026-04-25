// Tests for BlockSpec — the structured intermediate form that the
// scaffold's template engine renders to files. PR 1 C1 per SLICE 2
// audit §3.2. BlockSpec is the contract between the (future PR 2)
// NL parser and the template engine; every downstream file's shape
// is a function of what BlockSpec carries.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  BlockSpecSchema,
  isValidBlockSlug,
  isValidHandlerName,
  isValidToolName,
  slugToConstName,
  slugToPascalCase,
  stripBlockSlugPrefix,
  type BlockSpec,
} from "../../../src/lib/scaffolding/spec";

// Fixtures --------------------------------------------------------

function minimalSpec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Simple note-taking block for internal notes.",
    triggerPhrases: ["Add a notes block", "Install notes"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
    customer_surfaces: { display: [], actions: [] },
  };
}

describe("BlockSpecSchema — minimal valid spec", () => {
  test("accepts a minimal spec", () => {
    const result = BlockSpecSchema.safeParse(minimalSpec());
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });
});

describe("BlockSpecSchema — slug validation", () => {
  test("accepts kebab-case slugs", () => {
    for (const slug of ["notes", "client-satisfaction", "a1-bc-2"]) {
      const result = BlockSpecSchema.safeParse({ ...minimalSpec(), slug });
      assert.ok(result.success, `expected ${slug} to pass`);
    }
  });

  test("rejects upper-case, snake_case, spaces, or reserved words", () => {
    for (const slug of ["Notes", "my_block", "my block", "crm", ""]) {
      const result = BlockSpecSchema.safeParse({ ...minimalSpec(), slug });
      assert.ok(!result.success, `expected "${slug}" to be rejected`);
    }
  });
});

describe("BlockSpecSchema — tools", () => {
  test("accepts a tool with args/returns fields", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      produces: [{ name: "note.created", fields: [{ name: "noteId", type: "string", nullable: false }] }],
      tools: [
        {
          name: "create_note",
          description: "Create a note on a contact.",
          args: [{ name: "body", type: "string", nullable: false, required: true }],
          returns: [{ name: "noteId", type: "string", nullable: false, required: true }],
          emits: ["note.created"],
        },
      ],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("rejects tool names that aren't lowercase snake_case", () => {
    const spec = minimalSpec();
    spec.tools = [
      { name: "CreateNote", description: "x", args: [], returns: [], emits: [] },
    ];
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects emits references to events not in produces (cross-ref)", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      produces: [{ name: "note.created", fields: [] }],
      tools: [
        {
          name: "create_note",
          description: "x",
          args: [],
          returns: [],
          emits: ["unknown.event"],
        },
      ],
    };
    const result = BlockSpecSchema.safeParse(spec);
    // Cross-ref is a SUPERREFINE — Zod's safeParse returns success=false
    // when refine fails.
    assert.ok(!result.success, "emits refers to an event not in produces");
  });
});

describe("BlockSpecSchema — subscriptions", () => {
  test("accepts subscriptions with fully-qualified event names", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      subscriptions: [
        {
          event: "caldiy-booking:booking.created",
          handlerName: "logNoteOnBookingCreate",
          description: "Log a note on the contact when a booking is created.",
          idempotencyKey: "{{id}}",
        },
      ],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("rejects subscription events that aren't fully-qualified", () => {
    const spec = minimalSpec();
    spec.subscriptions = [
      {
        event: "booking.created", // missing block-slug prefix
        handlerName: "h",
        description: "x",
        idempotencyKey: "{{id}}",
      },
    ];
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects handler names that aren't lowerCamelCase", () => {
    const spec = minimalSpec();
    spec.subscriptions = [
      {
        event: "caldiy-booking:booking.created",
        handlerName: "Log_Activity",
        description: "x",
        idempotencyKey: "{{id}}",
      },
    ];
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });
});

describe("BlockSpecSchema — events", () => {
  test("accepts produces with dot-separated event names + typed fields", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      produces: [
        {
          name: "note.created",
          fields: [
            { name: "noteId", type: "string", nullable: false },
            { name: "contactId", type: "string", nullable: true },
          ],
        },
      ],
    };
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success);
  });

  test("rejects event names that aren't dot-separated lowercase", () => {
    for (const name of ["notecreated", "Note.Created", "note"]) {
      const spec = minimalSpec();
      spec.produces = [{ name, fields: [] }];
      const result = BlockSpecSchema.safeParse(spec);
      assert.ok(!result.success, `expected "${name}" to be rejected`);
    }
  });
});

describe("helper predicates", () => {
  test("isValidBlockSlug — kebab-case lowercase only", () => {
    assert.ok(isValidBlockSlug("notes"));
    assert.ok(isValidBlockSlug("client-satisfaction"));
    assert.ok(!isValidBlockSlug("Notes"));
    assert.ok(!isValidBlockSlug("notes_block"));
    assert.ok(!isValidBlockSlug(""));
    assert.ok(!isValidBlockSlug("-leading-dash"));
  });

  test("isValidToolName — lowercase snake_case", () => {
    assert.ok(isValidToolName("create_note"));
    assert.ok(isValidToolName("list"));
    assert.ok(!isValidToolName("CreateNote"));
    assert.ok(!isValidToolName("create-note"));
  });

  test("isValidHandlerName — lowerCamelCase", () => {
    assert.ok(isValidHandlerName("logNoteOnBookingCreate"));
    assert.ok(isValidHandlerName("x"));
    assert.ok(!isValidHandlerName("LogNote"));
    assert.ok(!isValidHandlerName("log-note"));
  });
});

describe("helper transforms", () => {
  test("slugToConstName — kebab-case → UPPER_SNAKE", () => {
    assert.equal(slugToConstName("notes"), "NOTES");
    assert.equal(slugToConstName("client-satisfaction"), "CLIENT_SATISFACTION");
    assert.equal(slugToConstName("a-b-c"), "A_B_C");
  });

  test("slugToPascalCase — kebab-case → PascalCase", () => {
    assert.equal(slugToPascalCase("notes"), "Notes");
    assert.equal(slugToPascalCase("client-satisfaction"), "ClientSatisfaction");
  });

  test("stripBlockSlugPrefix — splits on first colon only", () => {
    assert.equal(stripBlockSlugPrefix("caldiy-booking:booking.created"), "booking.created");
    assert.equal(stripBlockSlugPrefix("crm:contact.created"), "contact.created");
    assert.equal(stripBlockSlugPrefix("no-colon"), null);
  });
});

describe("BlockSpecSchema — reserved slug names", () => {
  test("rejects slugs that collide with existing core blocks", () => {
    for (const reserved of ["crm", "caldiy-booking", "email", "sms", "payments", "formbricks-intake", "landing-pages"]) {
      const result = BlockSpecSchema.safeParse({ ...minimalSpec(), slug: reserved });
      assert.ok(!result.success, `expected reserved slug "${reserved}" to be rejected`);
    }
  });
});
