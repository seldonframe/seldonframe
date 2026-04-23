// Tests for the tools.ts renderer — BlockSpec.tools → TypeScript
// source text. PR 1 C2 per SLICE 2 audit §3.5.
//
// Strategy: exact-substring assertions (the output must land valid
// TypeScript that compiles; the file-writer's compile gate catches
// shape errors). Snapshot testing is out; assertions target the
// structural invariants the template guarantees.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderToolsTs } from "../../../src/lib/scaffolding/render/tools-ts";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

function specWithTools(tools: BlockSpec["tools"]): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Test block",
    triggerPhrases: [],
    frameworks: ["universal"],
    produces: [{ name: "note.created", fields: [] }],
    consumes: [],
    tools,
    subscriptions: [],
  };
}

describe("renderToolsTs — imports + header", () => {
  test("imports z from zod and ToolDefinition from contract-v2", () => {
    const out = renderToolsTs(specWithTools([]));
    assert.match(out, /import \{ z \} from "zod";/);
    assert.match(out, /import type \{ ToolDefinition \} from ["']\.\.\/lib\/blocks\/contract-v2["'];/);
  });

  test("header comment names the block + marks it as scaffolded", () => {
    const out = renderToolsTs(specWithTools([]));
    assert.match(out, /\/\/ Notes block — tool schemas/);
    assert.match(out, /scaffolded/);
  });
});

describe("renderToolsTs — per-tool exports", () => {
  test("single tool renders as `export const <camelName>: ToolDefinition = {...}`", () => {
    const spec = specWithTools([
      {
        name: "create_note",
        description: "Create a note on a contact.",
        args: [
          { name: "contactId", type: "string", nullable: false, required: true },
          { name: "body", type: "string", nullable: false, required: true },
        ],
        returns: [
          { name: "noteId", type: "string", nullable: false, required: true },
        ],
        emits: ["note.created"],
      },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /export const createNote: ToolDefinition = \{/);
    assert.match(out, /name: "create_note"/);
    assert.match(out, /description: "Create a note on a contact\."/);
    assert.match(out, /args: z\.object\(\{/);
    assert.match(out, /contactId: z\.string\(\),/);
    assert.match(out, /body: z\.string\(\),/);
    assert.match(out, /returns: z\.object\(\{/);
    assert.match(out, /noteId: z\.string\(\),/);
    assert.match(out, /emits: \["note\.created"\]/);
  });

  test("optional arg renders with .optional()", () => {
    const spec = specWithTools([
      {
        name: "list_notes",
        description: "List notes for a contact.",
        args: [
          { name: "contactId", type: "string", nullable: false, required: true },
          { name: "limit", type: "number", nullable: false, required: false },
        ],
        returns: [],
        emits: [],
      },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /limit: z\.number\(\)\.optional\(\),/);
  });

  test("nullable arg renders with .nullable()", () => {
    const spec = specWithTools([
      {
        name: "update_note",
        description: "x",
        args: [{ name: "body", type: "string", nullable: true, required: true }],
        returns: [],
        emits: [],
      },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /body: z\.string\(\)\.nullable\(\),/);
  });

  test("integer type renders as z.number().int()", () => {
    const spec = specWithTools([
      {
        name: "set_count",
        description: "x",
        args: [{ name: "count", type: "integer", nullable: false, required: true }],
        returns: [],
        emits: [],
      },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /count: z\.number\(\)\.int\(\),/);
  });

  test("boolean type renders as z.boolean()", () => {
    const spec = specWithTools([
      {
        name: "toggle",
        description: "x",
        args: [{ name: "flag", type: "boolean", nullable: false, required: true }],
        returns: [],
        emits: [],
      },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /flag: z\.boolean\(\),/);
  });

  test("tool with empty emits renders empty array literal", () => {
    const spec = specWithTools([
      { name: "noop", description: "x", args: [], returns: [], emits: [] },
    ]);
    const out = renderToolsTs(spec);
    assert.match(out, /emits: \[\]/);
  });
});

describe("renderToolsTs — collection export", () => {
  test("exports NOTES_TOOLS readonly array containing every tool", () => {
    const spec = specWithTools([
      { name: "create_note", description: "x", args: [], returns: [], emits: [] },
      { name: "list_notes", description: "x", args: [], returns: [], emits: [] },
    ]);
    const out = renderToolsTs(spec);
    assert.match(
      out,
      /export const NOTES_TOOLS: readonly ToolDefinition\[\] = \[\s*createNote,\s*listNotes,?\s*\] as const;/,
    );
  });

  test("multi-word slug renders to UPPER_SNAKE constant", () => {
    const spec = {
      ...specWithTools([
        { name: "create_score", description: "x", args: [], returns: [], emits: [] },
      ]),
      slug: "client-satisfaction",
      title: "Client Satisfaction",
    };
    const out = renderToolsTs(spec);
    assert.match(out, /export const CLIENT_SATISFACTION_TOOLS: readonly ToolDefinition\[\]/);
  });

  test("empty tool array still exports CONST_TOOLS as empty", () => {
    const out = renderToolsTs(specWithTools([]));
    assert.match(
      out,
      /export const NOTES_TOOLS: readonly ToolDefinition\[\] = \[\s*\] as const;/,
    );
  });
});
