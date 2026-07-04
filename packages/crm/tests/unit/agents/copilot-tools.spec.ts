// Workspace copilot toolset — pure surface test (TDD, win-ladder P0/Task 1).
//
// buildCopilotTools() wraps the already-shipped admin action layer (landing
// structure, intake structure, R1 customize/versions, section mutate, theme)
// as thin AgentTool zod wrappers. This spec asserts ONLY the surface: tool
// names, jsonSchema shape, and the delete_section confirm requirement. It
// does NOT call execute() — that's covered by later integration coverage
// once the agent row (Task 2) exists. Mocks nothing: no DB, no network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  COPILOT_CAPABILITY,
  buildCopilotTools,
} from "../../../src/lib/agents/copilot/tools";
import { isWinLadderOn } from "../../../src/lib/web-build/policy";

const EXPECTED_TOOL_NAMES = [
  "get_site_structure",
  "edit_site",
  "update_section_field",
  "move_section",
  "delete_section",
  "add_intake_field",
  "list_versions",
  "undo_last_change",
];

describe("COPILOT_CAPABILITY", () => {
  test("is the expected capability string", () => {
    assert.equal(COPILOT_CAPABILITY, "workspace_copilot");
  });
});

describe("buildCopilotTools", () => {
  test("returns exactly the 8 expected tool names", () => {
    const tools = buildCopilotTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...EXPECTED_TOOL_NAMES].sort());
  });

  test("every tool exposes an object-typed jsonSchema", () => {
    const tools = buildCopilotTools();
    for (const tool of tools) {
      assert.equal(
        tool.jsonSchema.type,
        "object",
        `${tool.name} jsonSchema.type must be "object"`,
      );
      assert.ok(tool.description && tool.description.length > 0, `${tool.name} needs a description`);
    }
  });

  test("delete_section requires confirm:true in its schema", () => {
    const tools = buildCopilotTools();
    const deleteSection = tools.find((t) => t.name === "delete_section");
    assert.ok(deleteSection, "delete_section tool must exist");
    const schema = deleteSection!.jsonSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    assert.ok(schema.required?.includes("confirm"), "confirm must be required");
    assert.ok(schema.properties?.confirm, "confirm must be a declared property");

    // Zod-level check too: parsing without confirm must fail.
    const parseResult = deleteSection!.inputSchema.safeParse({ index: 0 });
    assert.equal(parseResult.success, false);

    const okResult = deleteSection!.inputSchema.safeParse({ index: 0, confirm: true });
    assert.equal(okResult.success, true);
  });
});

describe("isWinLadderOn", () => {
  test("true only for strict '1'", () => {
    assert.equal(isWinLadderOn({ SF_WIN_LADDER: "1" }), true);
  });

  test("false for 'true'", () => {
    assert.equal(isWinLadderOn({ SF_WIN_LADDER: "true" }), false);
  });

  test("false for undefined", () => {
    assert.equal(isWinLadderOn({ SF_WIN_LADDER: undefined }), false);
  });
});
