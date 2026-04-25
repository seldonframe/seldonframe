// Unit tests for lib/blocks/emit-tools.ts — the emit pipeline that
// renders Zod-authored tool schemas into JSON-Schema blocks inside
// BLOCK.md. Ships with C6 per Max's "tests alongside code" directive.
//
// Coverage:
//   - emitToolEntries produces ToolEntrySchema-valid output for every
//     tool in CRM_TOOLS (13 tools from C4).
//   - applyToolsToMarkdown replaces between markers, idempotent,
//     no-op when markers absent, malformed-markers returns applied=false.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  applyToolsToMarkdown,
  emitToolEntries,
  renderToolEntries,
  TOOLS_END_MARKER,
  TOOLS_START_MARKER,
} from "../../src/lib/blocks/emit-tools";
import { ToolEntrySchema } from "../../src/lib/blocks/contract-v2";
import { CRM_TOOLS } from "../../src/blocks/crm.tools";

describe("emitToolEntries — CRM tools", () => {
  const entries = emitToolEntries(CRM_TOOLS);

  test("emits one entry per CRM tool (13 total)", () => {
    assert.equal(entries.length, 13);
  });

  test("every entry validates against ToolEntrySchema", () => {
    for (const entry of entries) {
      const result = ToolEntrySchema.safeParse(entry);
      assert.ok(
        result.success,
        `entry ${entry.name} failed validation: ${result.success ? "" : JSON.stringify(result.error.issues)}`,
      );
    }
  });

  test("each entry's args block is a JSON-Schema object with type: object", () => {
    for (const entry of entries) {
      assert.equal(entry.args.type, "object", `${entry.name} args should be object-shaped`);
      assert.equal(typeof entry.args.properties, "object", `${entry.name} args.properties should exist`);
    }
  });

  test("create_contact emit carries first_name as required", () => {
    const entry = entries.find((e) => e.name === "create_contact");
    assert.ok(entry, "create_contact entry exists");
    const required = entry!.args.required as string[] | undefined;
    assert.ok(Array.isArray(required));
    assert.ok(required!.includes("first_name"));
  });

  test("create_contact emit exposes the status enum values", () => {
    const entry = entries.find((e) => e.name === "create_contact");
    const statusProp = (entry!.args.properties as Record<string, { enum?: string[] }>).status;
    assert.ok(statusProp.enum, "status property should expose enum");
    assert.deepEqual(statusProp.enum!.sort(), ["customer", "inactive", "lead", "prospect"]);
  });

  test("read-only tools carry empty emits array", () => {
    for (const name of ["list_contacts", "get_contact", "list_deals", "get_deal", "list_activities"]) {
      const entry = entries.find((e) => e.name === name);
      assert.deepEqual(entry!.emits, [], `${name} should emit nothing`);
    }
  });

  test("create_contact emits contact.created", () => {
    const entry = entries.find((e) => e.name === "create_contact");
    assert.deepEqual(entry!.emits, ["contact.created"]);
  });
});

describe("renderToolEntries", () => {
  test("returns pretty-printed JSON with 2-space indent", () => {
    const rendered = renderToolEntries([
      { name: "x_tool", description: "x", args: {}, returns: {}, emits: [] },
    ]);
    assert.ok(rendered.startsWith("[\n  "));
    assert.ok(rendered.endsWith("\n]"));
  });

  test("is deterministic — same input produces byte-identical output", () => {
    const input = [
      { name: "a", description: "a", args: { type: "object" }, returns: {}, emits: ["a.b"] },
    ];
    assert.equal(renderToolEntries(input), renderToolEntries(input));
  });
});

describe("applyToolsToMarkdown", () => {
  const entries = [
    { name: "fake", description: "fake desc", args: {}, returns: {}, emits: [] },
  ];

  test("replaces content between markers when both are present", () => {
    const before = `# BLOCK: Test

## Composition Contract

produces: [fake.event]

${TOOLS_START_MARKER}
old content that should be replaced
${TOOLS_END_MARKER}

more prose
`;
    const result = applyToolsToMarkdown(before, entries);
    assert.equal(result.applied, true);
    assert.ok(result.content.includes('"name": "fake"'));
    assert.ok(!result.content.includes("old content that should be replaced"));
    // Content outside markers is preserved verbatim
    assert.ok(result.content.includes("produces: [fake.event]"));
    assert.ok(result.content.includes("more prose"));
  });

  test("is idempotent — applying twice produces the same output", () => {
    const before = `${TOOLS_START_MARKER}\nold\n${TOOLS_END_MARKER}`;
    const first = applyToolsToMarkdown(before, entries);
    const second = applyToolsToMarkdown(first.content, entries);
    assert.equal(first.content, second.content);
  });

  test("no-op when markers are missing", () => {
    const before = "# Block with no TOOLS markers\n\n## Composition Contract\n\nproduces: [x.y]\n";
    const result = applyToolsToMarkdown(before, entries);
    assert.equal(result.applied, false);
    assert.equal(result.content, before);
  });

  test("no-op when only the start marker is present (malformed)", () => {
    const before = `${TOOLS_START_MARKER}\ncontent\n# no end marker`;
    const result = applyToolsToMarkdown(before, entries);
    assert.equal(result.applied, false);
  });

  test("no-op when markers are reversed (end before start)", () => {
    const before = `${TOOLS_END_MARKER}\n...\n${TOOLS_START_MARKER}`;
    const result = applyToolsToMarkdown(before, entries);
    assert.equal(result.applied, false);
  });

  test("output round-trips through the parser's ToolEntrySchema", () => {
    const before = `${TOOLS_START_MARKER}\n[]\n${TOOLS_END_MARKER}`;
    const result = applyToolsToMarkdown(before, emitToolEntries(CRM_TOOLS));
    assert.equal(result.applied, true);
    // Extract JSON between markers and re-parse
    const start = result.content.indexOf(TOOLS_START_MARKER) + TOOLS_START_MARKER.length;
    const end = result.content.indexOf(TOOLS_END_MARKER);
    const payload = result.content.slice(start, end).trim();
    const parsed = JSON.parse(payload);
    assert.equal(Array.isArray(parsed), true);
    assert.equal(parsed.length, 13);
    for (const entry of parsed) {
      assert.equal(ToolEntrySchema.safeParse(entry).success, true);
    }
  });
});
