// Starter Pack — TDD for the one-click instantiate composition.
//
// Run: node --import tsx --test tests/unit/agent-templates/instantiate-starter.spec.ts
//
// instantiateStarter is the pure, DI'd orchestrator that
// createTemplateFromStarterAction ("use server") delegates to verbatim — so
// covering it here (no DB, no session) is the repo-idiomatic way to test the
// thin action (the action only adds getOrgId() + assertWritable()). It must:
//   - reject an unknown starterId WITHOUT creating anything
//   - create a template of the starter's exact type + name
//   - persist the starter's seed blueprint via the same save path the editor uses
//   - return the new id (best-effort blueprint: a save failure still yields the id)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  instantiateStarter,
  getStarterTemplate,
  STARTER_TEMPLATES,
  type InstantiateStarterDeps,
} from "../../../src/lib/agent-templates/starter-pack";
import { TemplateBlueprintPatchSchema } from "../../../src/lib/agent-templates/schema";

// A capturing fake of the two injected seams (create + saveBlueprint).
function makeDeps(over: Partial<InstantiateStarterDeps> = {}): {
  deps: InstantiateStarterDeps;
  calls: {
    create: Array<{ builderOrgId: string; name: string; type: string }>;
    save: Array<{ templateId: string; patch: unknown }>;
  };
} {
  const calls = {
    create: [] as Array<{ builderOrgId: string; name: string; type: string }>,
    save: [] as Array<{ templateId: string; patch: unknown }>,
  };
  const deps: InstantiateStarterDeps = {
    create: async (input) => {
      calls.create.push(input);
      return { id: "tmpl-new" };
    },
    saveBlueprint: async ({ templateId, patch }) => {
      calls.save.push({ templateId, patch });
      return { ok: true };
    },
    ...over,
  };
  return { deps, calls };
}

describe("instantiateStarter — unknown id", () => {
  test("returns unknown_starter and creates nothing", async () => {
    const { deps, calls } = makeDeps();
    const result = await instantiateStarter(
      { builderOrgId: "builder-1", starterId: "nope" },
      deps,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /unknown_starter/);
    assert.equal(calls.create.length, 0, "must not create on unknown starter");
    assert.equal(calls.save.length, 0, "must not save on unknown starter");
  });
});

describe("instantiateStarter — happy path", () => {
  test("creates a template of the starter's exact type + name", async () => {
    const starter = getStarterTemplate("ai-phone-receptionist");
    const { deps, calls } = makeDeps();

    const result = await instantiateStarter(
      { builderOrgId: "builder-1", starterId: starter.id },
      deps,
    );

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.id, "tmpl-new");
    assert.equal(calls.create.length, 1, "create called once");
    assert.deepEqual(calls.create[0], {
      builderOrgId: "builder-1",
      name: starter.name,
      type: starter.type, // voice_receptionist
    });
  });

  test("persists the starter's seed blueprint to the new template id", async () => {
    const starter = getStarterTemplate("website-support-chat");
    const { deps, calls } = makeDeps();

    await instantiateStarter(
      { builderOrgId: "b1", starterId: starter.id },
      deps,
    );

    assert.equal(calls.save.length, 1, "saveBlueprint called once");
    assert.equal(calls.save[0]!.templateId, "tmpl-new", "saved to the created id");
    // The persisted patch is exactly the starter's blueprint, and it must pass
    // the real schema (the save path validates it).
    assert.deepEqual(calls.save[0]!.patch, starter.blueprint);
    const parsed = TemplateBlueprintPatchSchema.safeParse(calls.save[0]!.patch);
    assert.equal(parsed.success, true, "persisted blueprint must pass the schema");
  });

  test("works for every starter in the registry (type + name flow)", async () => {
    for (const starter of STARTER_TEMPLATES) {
      const { deps, calls } = makeDeps();
      const result = await instantiateStarter(
        { builderOrgId: "b1", starterId: starter.id },
        deps,
      );
      assert.equal(result.ok, true, `${starter.id} should instantiate`);
      assert.equal(calls.create[0]!.type, starter.type, `${starter.id} type`);
      assert.equal(calls.create[0]!.name, starter.name, `${starter.id} name`);
      assert.deepEqual(calls.save[0]!.patch, starter.blueprint, `${starter.id} blueprint`);
    }
  });
});

describe("instantiateStarter — resilience", () => {
  test("a create failure surfaces an error (no id)", async () => {
    const { deps } = makeDeps({
      create: async () => {
        throw new Error("db down");
      },
    });
    const result = await instantiateStarter(
      { builderOrgId: "b1", starterId: "ai-phone-receptionist" },
      deps,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /db down/);
  });

  test("a blueprint-save failure still returns the new id (best-effort, no orphan)", async () => {
    let saveAttempted = false;
    const { deps, calls } = makeDeps({
      saveBlueprint: async () => {
        saveAttempted = true;
        return { ok: false, error: "template_not_found" };
      },
    });
    const result = await instantiateStarter(
      { builderOrgId: "b1", starterId: "ai-phone-receptionist" },
      deps,
    );
    // Mirrors createAndRoute in new-agent-button.tsx: don't strand the builder.
    assert.equal(result.ok, true, "still routes the builder to a valid template");
    if (result.ok) assert.equal(result.id, "tmpl-new");
    assert.equal(calls.create.length, 1);
    assert.equal(saveAttempted, true, "save was attempted");
  });
});
