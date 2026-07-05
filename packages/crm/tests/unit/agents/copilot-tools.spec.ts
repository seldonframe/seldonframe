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
import type {
  UpdateThemeDeps,
  ModuleToolsDeps,
  DesignToolsDeps,
} from "../../../src/lib/agents/copilot/tools";
import type { ToolExecuteContext } from "../../../src/lib/agents/tools";
import type { OrgTheme } from "../../../src/lib/theme/types";
import type { ModuleId } from "../../../src/lib/workspace/modules";
import { isWinLadderOn } from "../../../src/lib/web-build/policy";
import type { SetLandingTemplateResult } from "../../../src/lib/landing/set-landing-template-for-org";
import type { SetExplicitArchetypeResult } from "../../../src/lib/workspace/apply-archetype-theme";

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
  "list_designs",
  "update_design",
  "enable_module",
  "disable_module",
  "pin_card",
  "search_media",
  "update_media",
  "delete_media",
];

describe("COPILOT_CAPABILITY", () => {
  test("is the expected capability string", () => {
    assert.equal(COPILOT_CAPABILITY, "workspace_copilot");
  });
});

describe("buildCopilotTools", () => {
  test("returns exactly the 17 expected tool names", () => {
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

describe("update_design / list_designs", () => {
  function designDeps(overrides: Partial<DesignToolsDeps> = {}): DesignToolsDeps {
    return {
      setLandingTemplateForOrg: mock.fn(
        async (_orgId: string, choice: string): Promise<SetLandingTemplateResult> => ({
          ok: true,
          landingTemplate: choice === "auto" ? "earthy-modern-clinical" : choice,
          landingTemplateChoice: choice,
        }),
      ),
      setArchetypeForOrg: mock.fn(
        async (_orgId: string, archetypeId): Promise<SetExplicitArchetypeResult> => ({
          ok: true,
          archetype: archetypeId,
        }),
      ),
      // Default: non-health vertical, so tests must opt in to a health
      // vertical explicitly — matches the "no matching row" real-world
      // default (isHealthVertical("") is false).
      resolveOrgVertical: mock.fn(async (_orgId: string) => ""),
      ...overrides,
    };
  }

  test("update_design zod schema requires a non-empty design string", () => {
    const tools = buildCopilotTools();
    const updateDesign = tools.find((t) => t.name === "update_design");
    assert.ok(updateDesign, "update_design tool must exist");

    assert.equal(updateDesign!.inputSchema.safeParse({}).success, false);
    assert.equal(updateDesign!.inputSchema.safeParse({ design: "" }).success, false);
    assert.equal(updateDesign!.inputSchema.safeParse({ design: "bold-urgency" }).success, true);
  });

  test("update_design rejects an id not valid for the org's vertical (unknown design)", async () => {
    const tools = buildCopilotTools();
    const updateDesign = tools.find((t) => t.name === "update_design");
    assert.ok(updateDesign, "update_design tool must exist");

    const deps = designDeps();
    const ctx = fakeCtx();

    const result = (await (
      updateDesign!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )({ design: "not-a-real-design" }, ctx, deps)) as { ok: boolean; message: string };

    assert.equal(result.ok, false);
    assert.match(result.message, /isn't a design/i);
    assert.equal((deps.setLandingTemplateForOrg as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    assert.equal((deps.setArchetypeForOrg as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  test("archetype key calls the archetype-apply core, using ctx.orgId (malicious args orgId ignored)", async () => {
    const tools = buildCopilotTools();
    const updateDesign = tools.find((t) => t.name === "update_design");
    assert.ok(updateDesign, "update_design tool must exist");

    const deps = designDeps();
    const ctx = fakeCtx({ orgId: "org-real-123" });
    const maliciousArgs = { design: "bold-urgency", orgId: "attacker-org", workspaceId: "attacker-org-2" };

    const result = (await (
      updateDesign!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps)) as { ok: boolean; kind: string; applied: string };

    const setArchetypeForOrg = deps.setArchetypeForOrg as unknown as ReturnType<typeof mock.fn>;
    assert.equal(setArchetypeForOrg.mock.callCount(), 1);
    const [calledOrgId, calledArchetype] = setArchetypeForOrg.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123");
    assert.notEqual(calledOrgId, "attacker-org");
    assert.notEqual(calledOrgId, "attacker-org-2");
    assert.equal(calledArchetype, "bold-urgency");
    assert.equal(result.ok, true);
    assert.equal(result.kind, "archetype");
    assert.equal(result.applied, "bold-urgency");
  });

  test("list_designs reports isHealthWorkspace:false and premiumTemplates:[] for a non-health workspace", async () => {
    const tools = buildCopilotTools();
    const listDesigns = tools.find((t) => t.name === "list_designs");
    assert.ok(listDesigns, "list_designs tool must exist");

    const deps = designDeps(); // default resolveOrgVertical → "" → non-health
    const ctx = fakeCtx();
    const result = (await (
      listDesigns!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )({}, ctx, deps)) as {
      ok: boolean;
      isHealthWorkspace: boolean;
      premiumTemplates: unknown[];
      archetypes: { id: string }[];
    };

    assert.equal(result.ok, true);
    assert.equal(result.isHealthWorkspace, false);
    assert.deepEqual(result.premiumTemplates, []);
    assert.equal(result.archetypes.length, 8);
  });

  test("list_designs reports isHealthWorkspace:true and non-empty premiumTemplates for a health workspace", async () => {
    const tools = buildCopilotTools();
    const listDesigns = tools.find((t) => t.name === "list_designs");
    assert.ok(listDesigns, "list_designs tool must exist");

    const deps = designDeps({ resolveOrgVertical: mock.fn(async () => "chiropractic") });
    const ctx = fakeCtx();
    const result = (await (
      listDesigns!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )({}, ctx, deps)) as { ok: boolean; isHealthWorkspace: boolean; premiumTemplates: { id: string }[] };

    assert.equal(result.ok, true);
    assert.equal(result.isHealthWorkspace, true);
    assert.ok(result.premiumTemplates.length >= 5, "health workspaces should see all 5 premium templates");
  });

  test("a health org accepts a premium template id and calls the template-apply core with ctx.orgId", async () => {
    const tools = buildCopilotTools();
    const updateDesign = tools.find((t) => t.name === "update_design");
    assert.ok(updateDesign, "update_design tool must exist");

    const deps = designDeps({ resolveOrgVertical: mock.fn(async () => "chiropractic") });
    const ctx = fakeCtx({ orgId: "org-real-123" });

    const result = (await (
      updateDesign!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )({ design: "clinical-luxe" }, ctx, deps)) as { ok: boolean; kind: string; applied: string };

    const setLandingTemplateForOrg = deps.setLandingTemplateForOrg as unknown as ReturnType<typeof mock.fn>;
    assert.equal(setLandingTemplateForOrg.mock.callCount(), 1);
    const [calledOrgId, calledChoice] = setLandingTemplateForOrg.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123");
    assert.equal(calledChoice, "clinical-luxe");
    assert.equal(result.ok, true);
    assert.equal(result.kind, "template");
    assert.equal(result.applied, "clinical-luxe");
  });

  test("a non-health org asking for a premium template gets the honest archetype-fallback, not a silent no-op", async () => {
    const tools = buildCopilotTools();
    const updateDesign = tools.find((t) => t.name === "update_design");
    assert.ok(updateDesign, "update_design tool must exist");

    const deps = designDeps(); // default resolveOrgVertical → "" → non-health
    const ctx = fakeCtx();

    const result = (await (
      updateDesign!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: DesignToolsDeps,
      ) => Promise<unknown>
    )({ design: "clinical-luxe" }, ctx, deps)) as { ok: boolean; message: string };

    assert.equal(result.ok, false);
    assert.match(result.message, /health\/wellness only/i);
    assert.match(result.message, /archetype/i);
    assert.equal((deps.setLandingTemplateForOrg as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });
});

describe("enable_module / disable_module / pin_card (Task 8)", () => {
  test("enable_module.execute calls setModuleEnabled(ctx.orgId, module, true), ignoring any orgId-shaped model arg", async () => {
    const tools = buildCopilotTools();
    const enableModule = tools.find((t) => t.name === "enable_module");
    assert.ok(enableModule, "enable_module tool must exist");

    const setModuleEnabled = mock.fn(
      async (_orgId: string, _moduleId: ModuleId, _enabled: boolean) =>
        ({ ok: true as const, modules: ["home", "website", "money"] as ModuleId[] }),
    );
    const deps: ModuleToolsDeps = { setModuleEnabled, setPinned: mock.fn(async () => {}) };

    const ctx = fakeCtx({ orgId: "org-real-123" });
    const maliciousArgs = { module: "money", orgId: "attacker-org", workspaceId: "attacker-org-2" };

    const result = await (
      enableModule!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: ModuleToolsDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps);

    assert.equal(setModuleEnabled.mock.callCount(), 1);
    const [calledOrgId, calledModule, calledEnabled] = setModuleEnabled.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123");
    assert.notEqual(calledOrgId, "attacker-org");
    assert.notEqual(calledOrgId, "attacker-org-2");
    assert.equal(calledModule, "money");
    assert.equal(calledEnabled, true);
    assert.equal((result as { ok: boolean }).ok, true);
    assert.match((result as { message: string }).message, /money/i);
  });

  test("disable_module surfaces the guard's reason verbatim when blocked", async () => {
    const tools = buildCopilotTools();
    const disableModule = tools.find((t) => t.name === "disable_module");
    assert.ok(disableModule, "disable_module tool must exist");

    const setModuleEnabled = mock.fn(
      async (_orgId: string, _moduleId: ModuleId, _enabled: boolean) =>
        ({ ok: false as const, reason: "active_subscription" }),
    );
    const deps: ModuleToolsDeps = { setModuleEnabled, setPinned: mock.fn(async () => {}) };

    const ctx = fakeCtx();
    const result = await (
      disableModule!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: ModuleToolsDeps,
      ) => Promise<unknown>
    )({ module: "money" }, ctx, deps);

    assert.equal((result as { ok: boolean }).ok, false);
    assert.equal((result as { message: string }).message, "active_subscription");
  });

  test("enable_module/disable_module zod schema rejects an unknown module id", () => {
    const tools = buildCopilotTools();
    const enableModule = tools.find((t) => t.name === "enable_module");
    const disableModule = tools.find((t) => t.name === "disable_module");
    assert.ok(enableModule && disableModule);

    assert.equal(enableModule!.inputSchema.safeParse({ module: "not_a_real_module" }).success, false);
    assert.equal(disableModule!.inputSchema.safeParse({ module: "not_a_real_module" }).success, false);
    assert.equal(enableModule!.inputSchema.safeParse({ module: "money" }).success, true);
  });

  test("pin_card zod schema rejects more than 4 modules and unknown ids", () => {
    const tools = buildCopilotTools();
    const pinCard = tools.find((t) => t.name === "pin_card");
    assert.ok(pinCard, "pin_card tool must exist");

    assert.equal(
      pinCard!.inputSchema.safeParse({ modules: ["home", "website", "bookings", "customers", "money"] })
        .success,
      false,
      "more than 4 modules must be rejected",
    );
    assert.equal(
      pinCard!.inputSchema.safeParse({ modules: [] }).success,
      false,
      "empty array must be rejected",
    );
    assert.equal(
      pinCard!.inputSchema.safeParse({ modules: ["not_a_real_module"] }).success,
      false,
      "unknown module ids must be rejected",
    );
    assert.equal(
      pinCard!.inputSchema.safeParse({ modules: ["home", "money"] }).success,
      true,
    );
  });

  test("pin_card.execute calls setPinned with exactly the given array, using ctx.orgId", async () => {
    const tools = buildCopilotTools();
    const pinCard = tools.find((t) => t.name === "pin_card");
    assert.ok(pinCard, "pin_card tool must exist");

    const setPinned = mock.fn(async (_orgId: string, _pinned: ModuleId[]) => {});
    const deps: ModuleToolsDeps = {
      setModuleEnabled: mock.fn(async () => ({ ok: true as const, modules: [] as ModuleId[] })),
      setPinned,
    };

    const ctx = fakeCtx({ orgId: "org-real-123" });
    const maliciousArgs = { modules: ["home", "money"], orgId: "attacker-org" };

    const result = await (
      pinCard!.execute as unknown as (
        input: unknown,
        ctx: ToolExecuteContext,
        deps: ModuleToolsDeps,
      ) => Promise<unknown>
    )(maliciousArgs, ctx, deps);

    assert.equal(setPinned.mock.callCount(), 1);
    const [calledOrgId, calledPinned] = setPinned.mock.calls[0]!.arguments;
    assert.equal(calledOrgId, "org-real-123");
    assert.deepEqual(calledPinned, ["home", "money"]);
    assert.equal((result as { ok: boolean }).ok, true);
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
