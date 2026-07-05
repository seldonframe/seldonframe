// Workspace copilot toolset — pure surface test (TDD, win-ladder P0/Task 1;
// update_theme added in hotfix H2; execute()-level regression tests added
// in hotfix H2b).
//
// buildCopilotTools() wraps the already-shipped admin action layer (landing
// structure, intake structure, R1 customize/versions, section mutate, theme)
// as thin AgentTool zod wrappers. This spec asserts the surface (tool names,
// jsonSchema shape, delete_section's confirm requirement, update_theme's
// zod-level input validation) PLUS update_theme's execute() path via
// dependency injection (UpdateThemeDeps, lib/agents/copilot/tools.ts) — this
// repo prefers DI over node:test mock.module / vi.mock because tsx's CJS
// interop makes module mocking unreliable (see
// agents/voice/realtime-tools.spec.ts's PATTERN NOTE and
// deployments/set-booking-policy.spec.ts). It does NOT call execute() for the
// other DB-backed tools — same scope as the original Task 1 spec (see file
// history). Mocks nothing via module interception: no DB, no network.

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";

import {
  COPILOT_CAPABILITY,
  buildCopilotTools,
} from "../../../src/lib/agents/copilot/tools";
import type { UpdateThemeDeps } from "../../../src/lib/agents/copilot/tools";
import type { ToolExecuteContext } from "../../../src/lib/agents/tools";
import type { OrgTheme } from "../../../src/lib/theme/types";
import { isWinLadderOn } from "../../../src/lib/web-build/policy";

function fakeCtx(overrides: Partial<ToolExecuteContext> = {}): ToolExecuteContext {
  return {
    orgId: "org-real-123",
    orgSlug: "acme",
    agentId: "agt-1",
    conversationId: "conv-1",
    testMode: false,
    ...overrides,
  };
}

function fakeTheme(overrides: Partial<OrgTheme> = {}): OrgTheme {
  return {
    primaryColor: "#111111",
    accentColor: "#222222",
    fontFamily: "Inter",
    mode: "light",
    borderRadius: "rounded",
    logoUrl: null,
    ...overrides,
  };
}

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

  test("update_theme.execute calls saveThemeForOrg with ctx.orgId, ignoring any orgId-shaped field on the model args", async () => {
    const tools = buildCopilotTools();
    const updateTheme = tools.find((t) => t.name === "update_theme");
    assert.ok(updateTheme, "update_theme tool must exist");

    const saveThemeForOrg = mock.fn(async (_orgId: string, _patch: Partial<OrgTheme>) =>
      fakeTheme({ accentColor: "#7fb3d5" }),
    );
    const deps: UpdateThemeDeps = { saveThemeForOrg };

    // A malicious/hallucinated args object carrying a different orgId-like
    // field. update_theme's zod schema has no orgId-shaped property at all,
    // so this can only ever be ignored — the org write MUST come from
    // ctx.orgId, never from model-supplied args.
    const maliciousArgs = {
      accentColor: "#7fb3d5",
      orgId: "attacker-org",
      workspaceId: "attacker-org-2",
    };

    const ctx = fakeCtx({ orgId: "org-real-123" });
    const result = await (
      updateTheme!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: UpdateThemeDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps);

    assert.equal(saveThemeForOrg.mock.callCount(), 1);
    const [calledOrgId] = saveThemeForOrg.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123", "must write to ctx.orgId, not any args-supplied org field");
    assert.notEqual(calledOrgId, "attacker-org");
    assert.notEqual(calledOrgId, "attacker-org-2");
    assert.deepEqual(result, { ok: true, theme: fakeTheme({ accentColor: "#7fb3d5" }) });
  });

  test("update_theme.execute passes an accent-only patch to saveThemeForOrg as exactly { accentColor } (no other fields injected)", async () => {
    const tools = buildCopilotTools();
    const updateTheme = tools.find((t) => t.name === "update_theme");
    assert.ok(updateTheme, "update_theme tool must exist");

    const saveThemeForOrg = mock.fn(async (_orgId: string, _patch: Partial<OrgTheme>) =>
      fakeTheme({ accentColor: "#abcdef" }),
    );
    const deps: UpdateThemeDeps = { saveThemeForOrg };

    const ctx = fakeCtx();
    await (
      updateTheme!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: UpdateThemeDeps,
      ) => Promise<unknown>
    )({ accentColor: "#abcdef" }, ctx, deps);

    assert.equal(saveThemeForOrg.mock.callCount(), 1);
    const [, calledPatch] = saveThemeForOrg.mock.calls[0]!.arguments;
    assert.deepEqual(calledPatch, { accentColor: "#abcdef" });
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
