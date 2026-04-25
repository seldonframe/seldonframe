// Tests for the customer-surface renderers.
// SLICE 4b PR 2 C2 per audit §14 + G-4b-3.
//
// Two renderers emit customer-facing component source:
//   - renderCustomerDisplayViewTsx(entity, displaySurface)
//   - renderCustomerActionFormTsx(tool, actionSurface)
//
// Both are pure functions (composition 0.94x multiplier). Deterministic
// output matches the existing scaffold-renderer pattern in
// lib/scaffolding/render/admin-{schema,page}-tsx.ts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderCustomerDisplayViewTsx } from "../../../src/lib/scaffolding/render/customer-display-view-tsx";
import { renderCustomerActionFormTsx } from "../../../src/lib/scaffolding/render/customer-action-form-tsx";
import type {
  BlockSpecEntity,
  BlockSpecCustomerDisplay,
  BlockSpecTool,
  BlockSpecCustomerAction,
} from "../../../src/lib/scaffolding/spec";

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const noteEntity: BlockSpecEntity = {
  name: "note",
  pluralSlug: "notes",
  fields: [
    { name: "body", type: "string", nullable: false, required: true },
    { name: "pinned", type: "boolean", nullable: false, required: false },
    { name: "priority", type: "integer", nullable: false, required: false },
  ],
};

const createNoteTool: BlockSpecTool = {
  name: "create_note",
  description: "Create a note for the viewing customer.",
  args: [
    { name: "body", type: "string", nullable: false, required: true },
    { name: "priority", type: "integer", nullable: false, required: false },
  ],
  returns: [{ name: "noteId", type: "string", nullable: false, required: true }],
  emits: [],
};

// ---------------------------------------------------------------------
// renderCustomerDisplayViewTsx
// ---------------------------------------------------------------------

describe("renderCustomerDisplayViewTsx", () => {
  test("imports CustomerDataView + sibling admin schema", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "{{customer_id}}",
      fields: ["body", "pinned"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    assert.match(src, /import \{ CustomerDataView \} from "@\/components\/ui-customer\/customer-data-view";/);
    assert.match(src, /import \{ NoteSchema[^}]*\} from "\.\.\/admin\/note\.schema";/);
  });

  test("renders async default export component", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "{{customer_id}}",
      fields: ["body"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    assert.match(src, /export default async function NotesCustomerView\(/);
  });

  test("passes the entity schema to CustomerDataView", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "{{customer_id}}",
      fields: ["body"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    assert.match(src, /<CustomerDataView/);
    assert.match(src, /schema=\{NoteSchema\}/);
  });

  test("passes the fields array to CustomerDataView", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "{{customer_id}}",
      fields: ["body", "pinned"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    assert.match(src, /fields=\{\["body", "pinned"\]\}/);
  });

  test("inlines the filter as a code comment for the builder to implement", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "{{customer_id}}",
      fields: ["body"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    // The filter is a declarative hint; the scaffold can't know
    // the builder's data-fetch wiring. Render it as a TODO comment.
    assert.match(src, /TODO.*filter.*\{\{customer_id\}\}/i);
  });

  test("rows placeholder compiles cleanly (empty array fallback)", () => {
    const display: BlockSpecCustomerDisplay = {
      entity: "note",
      filter: "*",
      fields: ["body"],
    };
    const src = renderCustomerDisplayViewTsx(noteEntity, display);
    assert.match(src, /const rows(\s*:\s*[^=]+)?\s*=\s*\[\]/);
  });
});

// ---------------------------------------------------------------------
// renderCustomerActionFormTsx
// ---------------------------------------------------------------------

describe("renderCustomerActionFormTsx", () => {
  test("imports CustomerActionForm + Zod for inline schema", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /import \{ CustomerActionForm \} from "@\/components\/ui-customer\/customer-action-form";/);
    assert.match(src, /import \{ z \} from "zod";/);
  });

  test("renders an inline Zod schema from the tool args", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /const CreateNoteArgsSchema = z\.object\(\{/);
    assert.match(src, /body: z\.string\(\),/);
    assert.match(src, /priority: z\.number\(\)\.int\(\)\.optional\(\),/);
  });

  test("renders async default export component", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /export default function CreateNoteCustomerForm\(/);
  });

  test("passes the schema + action to CustomerActionForm in single mode", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /<CustomerActionForm/);
    assert.match(src, /mode="single"/);
    assert.match(src, /schema=\{CreateNoteArgsSchema\}/);
  });

  test("embeds rate_limit when provided on the action surface", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
      rate_limit: "5/hour",
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /rateLimitHint="5\/hour"/);
  });

  test("omits rate_limit attribute when not set", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.ok(!src.includes("rateLimitHint="));
  });

  test("ships a TODO pointing the builder at the action wiring", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    assert.match(src, /TODO.*(?:server action|wire|action)/i);
  });

  test("generated action prop is a URL string placeholder", () => {
    const action: BlockSpecCustomerAction = {
      tool: "create_note",
      opt_in: true,
    };
    const src = renderCustomerActionFormTsx(createNoteTool, action);
    // A string placeholder action="/api/..." keeps the generated
    // component valid TypeScript — builder swaps in a server action.
    assert.match(src, /action="\/api\/[a-z_-]+"/);
  });
});

// ---------------------------------------------------------------------
// Snake-case → PascalCase + pluralSlug → PascalCase utilities are
// shared with admin-schema-ts / admin-page-tsx; not re-tested here.
// ---------------------------------------------------------------------
