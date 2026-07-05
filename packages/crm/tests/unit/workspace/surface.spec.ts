// Unit tests for lib/workspace/surface.ts — Task 2 of the simple-home plan.
// All DB dependencies are injected (following set-booking-policy.spec.ts's
// convention) so this spec never touches a real database.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  readEnabledModules,
  buildMinimalSurfacePatch,
  buildSetSurfacePatch,
  buildSurfaceAbsentWhere,
  canDisableModule,
  setModuleEnabled,
  type CanDisableModuleDeps,
  type SetModuleEnabledDeps,
} from "../../../src/lib/workspace/surface";
import { MODULE_IDS } from "../../../src/lib/workspace/modules";

/**
 * Flatten a drizzle `sql\`...\`` query into its literal string/param pieces,
 * skipping opaque column/table references — same helper as
 * ladder-server.spec.ts, used here to assert the 42P18-safe SQL shape
 * without touching a real DB.
 */
function flattenSqlChunks(query: { queryChunks: unknown[] }): string[] {
  return query.queryChunks
    .map((chunk) => {
      if (Array.isArray(chunk)) return chunk.join("");
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in (chunk as Record<string, unknown>)) {
        const value = (chunk as { value: unknown }).value;
        return Array.isArray(value) ? value.join("") : String(value);
      }
      return null;
    })
    .filter((piece): piece is string => piece !== null);
}

function canDisableDeps(overrides: Partial<CanDisableModuleDeps> = {}): CanDisableModuleDeps {
  return {
    hasActiveSubscription: async () => false,
    hasActiveDeployment: async () => false,
    ...overrides,
  };
}

function setModuleDeps(overrides: Partial<SetModuleEnabledDeps> = {}): SetModuleEnabledDeps {
  return {
    hasActiveSubscription: async () => false,
    hasActiveDeployment: async () => false,
    readSettings: async () => null,
    writeSurface: async () => {},
    ...overrides,
  };
}

describe("readEnabledModules", () => {
  test("returns null when settings is null", () => {
    assert.equal(readEnabledModules(null), null);
  });

  test("returns null when settings is {}", () => {
    assert.equal(readEnabledModules({}), null);
  });

  test("returns null when settings.surface is garbage (not an object)", () => {
    assert.equal(readEnabledModules({ surface: "nonsense" }), null);
  });

  test("returns null when settings.surface.modules is not an array", () => {
    assert.equal(readEnabledModules({ surface: { modules: "nonsense" } }), null);
  });

  test("parses a valid modules array and always includes home", () => {
    const result = readEnabledModules({ surface: { modules: ["website", "bookings"] } });
    assert.deepEqual(result, ["home", "website", "bookings"]);
  });

  test("strips unknown ids", () => {
    const result = readEnabledModules({
      surface: { modules: ["website", "not_a_real_module", 123, null] },
    });
    assert.deepEqual(result, ["home", "website"]);
  });

  test("injects home even when absent from the stored array", () => {
    const result = readEnabledModules({ surface: { modules: ["money"] } });
    assert.deepEqual(result, ["home", "money"]);
  });

  test("preserves MODULE_IDS canonical order regardless of input order", () => {
    const result = readEnabledModules({ surface: { modules: ["agents", "website", "money"] } });
    assert.deepEqual(result, ["home", "website", "money", "agents"]);
  });
});

describe("buildMinimalSurfacePatch (42P18 regression guard)", () => {
  test("casts the JSON patch param to ::jsonb", () => {
    const query = buildMinimalSurfacePatch();
    const sqlText = flattenSqlChunks(query).join("");
    assert.match(sqlText, /::jsonb/, "the patch param must be cast to ::jsonb");
  });

  test("never emits a bare param as a jsonb_build_object key", () => {
    const query = buildMinimalSurfacePatch();
    const sqlText = flattenSqlChunks(query).join("");
    assert.doesNotMatch(
      sqlText,
      /jsonb_build_object\(\$/,
      "no jsonb_build_object call may take a bound param as its first (key) argument",
    );
  });

  test("merges via COALESCE(settings,'{}'::jsonb) || <patch>::jsonb", () => {
    const query = buildMinimalSurfacePatch();
    const sqlText = flattenSqlChunks(query).join("");
    assert.match(sqlText, /COALESCE\(/);
    assert.match(sqlText, /\|\|/);
  });

  test("the bound param carries the DEFAULT_FRESH_MODULES seed patch", () => {
    const query = buildMinimalSurfacePatch();
    const pieces = flattenSqlChunks(query);
    assert.ok(
      pieces.some((p) => {
        try {
          const parsed = JSON.parse(p);
          return (
            parsed?.surface?.version === 1 &&
            Array.isArray(parsed?.surface?.modules) &&
            parsed.surface.modules.includes("home")
          );
        } catch {
          return false;
        }
      }),
      "expected a bound param carrying the surface seed patch",
    );
  });
});

describe("buildSetSurfacePatch (42P18 regression guard)", () => {
  test("casts the JSON patch param to ::jsonb and avoids the bare-key shape", () => {
    const query = buildSetSurfacePatch({ modules: [...MODULE_IDS], version: 1 });
    const sqlText = flattenSqlChunks(query).join("");
    assert.match(sqlText, /::jsonb/);
    assert.doesNotMatch(sqlText, /jsonb_build_object\(\$/);
  });
});

/**
 * Recursive variant of flattenSqlChunks: drizzle's `and(...)` combinator
 * nests each condition as its own SQL object inside queryChunks rather
 * than a flat StringChunk/array, so a single-level flatten misses the
 * inner conditions entirely. Walks into nested `{ queryChunks }` objects.
 */
function flattenSqlChunksDeep(query: { queryChunks: unknown[] }): string[] {
  return query.queryChunks.flatMap((chunk) => {
    if (Array.isArray(chunk)) return chunk.map(String);
    if (typeof chunk === "string") return [chunk];
    if (chunk && typeof chunk === "object" && "queryChunks" in (chunk as Record<string, unknown>)) {
      return flattenSqlChunksDeep(chunk as { queryChunks: unknown[] });
    }
    if (chunk && typeof chunk === "object" && "value" in (chunk as Record<string, unknown>)) {
      const value = (chunk as { value: unknown }).value;
      return Array.isArray(value) ? value.map(String) : [String(value)];
    }
    return [];
  });
}

describe("buildSurfaceAbsentWhere (only-if-absent WHERE guard)", () => {
  test("requires settings->'surface' IS NULL alongside the org-id match", () => {
    const query = buildSurfaceAbsentWhere("org_1");
    assert.ok(query, "expected a SQL fragment");
    const pieces = flattenSqlChunksDeep(query as unknown as { queryChunks: unknown[] });
    const sqlText = pieces.join("");
    assert.match(
      sqlText,
      /->'surface' IS NULL/,
      "the guard must require settings->'surface' IS NULL — dropping this would clobber an operator's own module choices",
    );
    assert.ok(
      pieces.includes("org_1"),
      "the guard must bind the target org id",
    );
  });
});

describe("canDisableModule", () => {
  test("always blocks 'home'", async () => {
    const result = await canDisableModule("org_1", "home", canDisableDeps());
    assert.deepEqual(result, { ok: false, reason: "home_always_on" });
  });

  test("blocks 'money' when the org has an active subscription", async () => {
    const result = await canDisableModule(
      "org_1",
      "money",
      canDisableDeps({ hasActiveSubscription: async () => true }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "active_subscription");
  });

  test("allows 'money' when the org has no active subscription", async () => {
    const result = await canDisableModule("org_1", "money", canDisableDeps());
    assert.deepEqual(result, { ok: true });
  });

  test("blocks 'agents' when the org has an active deployment", async () => {
    const result = await canDisableModule(
      "org_1",
      "agents",
      canDisableDeps({ hasActiveDeployment: async () => true }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "active_deployment");
  });

  test("allows 'agents' when the org has no active deployment", async () => {
    const result = await canDisableModule("org_1", "agents", canDisableDeps());
    assert.deepEqual(result, { ok: true });
  });

  test("allows any other module regardless of deps", async () => {
    const result = await canDisableModule(
      "org_1",
      "website",
      canDisableDeps({ hasActiveSubscription: async () => true, hasActiveDeployment: async () => true }),
    );
    assert.deepEqual(result, { ok: true });
  });
});

describe("setModuleEnabled", () => {
  test("refuses to disable 'home'", async () => {
    let writeCalled = false;
    const result = await setModuleEnabled(
      "org_1",
      "home",
      false,
      setModuleDeps({ writeSurface: async () => { writeCalled = true; } }),
    );
    assert.deepEqual(result, { ok: false, reason: "home_always_on" });
    assert.equal(writeCalled, false, "must not write when refusing home");
  });

  test("returns the guard's reason when disabling is blocked (money)", async () => {
    let writeCalled = false;
    const result = await setModuleEnabled(
      "org_1",
      "money",
      false,
      setModuleDeps({
        hasActiveSubscription: async () => true,
        writeSurface: async () => { writeCalled = true; },
      }),
    );
    assert.deepEqual(result, { ok: false, reason: "active_subscription" });
    assert.equal(writeCalled, false, "must not write when disabling is blocked");
  });

  test("returns the guard's reason when disabling is blocked (agents)", async () => {
    const result = await setModuleEnabled(
      "org_1",
      "agents",
      false,
      setModuleDeps({ hasActiveDeployment: async () => true }),
    );
    assert.deepEqual(result, { ok: false, reason: "active_deployment" });
  });

  test("disabling from a null surface removes just that module from the full MODULE_IDS set", async () => {
    let writtenSurface: { modules: string[]; version: number } | null = null;
    const result = await setModuleEnabled(
      "org_1",
      "website",
      false,
      setModuleDeps({
        readSettings: async () => null,
        writeSurface: async (_orgId, surface) => {
          writtenSurface = surface as { modules: string[]; version: number };
        },
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(!result.modules.includes("website"));
      assert.ok(result.modules.includes("home"));
      // everything else from MODULE_IDS remains present
      for (const id of MODULE_IDS) {
        if (id === "website") continue;
        assert.ok(result.modules.includes(id), `expected ${id} to remain enabled`);
      }
    }
    assert.ok(writtenSurface);
    assert.deepEqual((writtenSurface as unknown as { modules: string[] }).modules, result.ok ? result.modules : []);
  });

  test("enabling a module adds it to the current set and writes home-inclusive modules", async () => {
    const result = await setModuleEnabled(
      "org_1",
      "leads",
      true,
      setModuleDeps({
        readSettings: async () => ({ surface: { modules: ["home", "website"] } }),
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.modules, ["home", "website", "leads"].sort((a, b) =>
        (MODULE_IDS as readonly string[]).indexOf(a) - (MODULE_IDS as readonly string[]).indexOf(b),
      ));
    }
  });

  test("never removes 'home' even if somehow requested indirectly", async () => {
    const result = await setModuleEnabled(
      "org_1",
      "website",
      false,
      setModuleDeps({ readSettings: async () => ({ surface: { modules: ["home"] } }) }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.modules.includes("home"));
    }
  });

  test("preserves sibling surface keys (e.g. chatIntroSeen) in the written patch", async () => {
    let writtenSurface: Record<string, unknown> | null = null;
    const result = await setModuleEnabled(
      "org_1",
      "leads",
      true,
      setModuleDeps({
        readSettings: async () => ({
          surface: { modules: ["home"], chatIntroSeen: true, version: 1 },
        }),
        writeSurface: async (_orgId, surface) => {
          writtenSurface = surface;
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.ok(writtenSurface);
    assert.equal((writtenSurface as unknown as { chatIntroSeen: boolean }).chatIntroSeen, true);
  });
});
