// Workspace copilot toolset — pure surface test (TDD, win-ladder P0/Task 1;
// update_theme added in hotfix H2).
//
// buildCopilotTools() wraps the already-shipped admin action layer (landing
// structure, intake structure, R1 customize/versions, section mutate, theme)
// as thin AgentTool zod wrappers. This spec asserts ONLY the surface: tool
// names, jsonSchema shape, delete_section's confirm requirement, and
// update_theme's zod-level input validation (bad hex / at-least-one-field).
// It does NOT call execute() for DB-backed tools — same scope as the
// original Task 1 spec (see file history); update_theme's execute() path
// (saveThemeForOrg call + orgId sourcing) is covered by save-theme.spec.ts's
// integration-shaped test at the save-theme layer instead. Mocks nothing:
// no DB, no network.

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
  "update_theme",
];

describe("COPILOT_CAPABILITY", () => {
  test("is the expected capability string", () => {
    assert.equal(COPILOT_CAPABILITY, "workspace_copilot");
  });
});

describe("buildCopilotTools", () => {
  test("returns exactly the 9 expected tool names", () => {
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

  test("update_theme rejects a bad hex color", () => {
    const tools = buildCopilotTools();
    const updateTheme = tools.find((t) => t.name === "update_theme");
    assert.ok(updateTheme, "update_theme tool must exist");

    const badHex = updateTheme!.inputSchema.safeParse({ accentColor: "powder blue" });
    assert.equal(badHex.success, false, "color names must be rejected — model must convert to hex");

    const shortHex = updateTheme!.inputSchema.safeParse({ accentColor: "#abc" });
    assert.equal(shortHex.success, false, "3-digit hex must be rejected");

    const goodHex = updateTheme!.inputSchema.safeParse({ accentColor: "#7fb3d5" });
    assert.equal(goodHex.success, true);
  });

  test("update_theme requires at least one field", () => {
    const tools = buildCopilotTools();
    const updateTheme = tools.find((t) => t.name === "update_theme");
    assert.ok(updateTheme, "update_theme tool must exist");

    const empty = updateTheme!.inputSchema.safeParse({});
    assert.equal(empty.success, false, "empty input must be rejected");

    const oneField = updateTheme!.inputSchema.safeParse({ mode: "dark" });
    assert.equal(oneField.success, true);
  });

  test("update_theme only offers enum values normalizeTheme accepts", () => {
    const tools = buildCopilotTools();
    const updateTheme = tools.find((t) => t.name === "update_theme");
    assert.ok(updateTheme, "update_theme tool must exist");

    const badFont = updateTheme!.inputSchema.safeParse({ fontFamily: "Comic Sans" });
    assert.equal(badFont.success, false);

    const badMode = updateTheme!.inputSchema.safeParse({ mode: "system" });
    assert.equal(badMode.success, false);

    const badRadius = updateTheme!.inputSchema.safeParse({ borderRadius: "square" });
    assert.equal(badRadius.success, false);

    const allGood = updateTheme!.inputSchema.safeParse({
      fontFamily: "Outfit",
      mode: "light",
      borderRadius: "pill",
    });
    assert.equal(allGood.success, true);
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
