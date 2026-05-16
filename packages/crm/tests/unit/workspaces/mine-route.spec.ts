// packages/crm/tests/unit/workspaces/mine-route.spec.ts
//
// Tests the GET /api/v1/web/workspaces/mine orchestrator. Mirrors the
// Cut A `runCreateFromUrl` pattern: the route handler is thin and
// delegates to a DI-friendly orchestrator (`runListMineWorkspaces`)
// so tests inject fake billing/rollup helpers instead of mocking
// modules. This is necessary because tsx's CJS interop makes
// `mock.method(module, "name", ...)` unreliable for named exports
// (see has-feature.spec.ts header note for the same convention).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runListMineWorkspaces } from "../../../src/lib/workspaces/run-list-mine";

type Deps = Parameters<typeof runListMineWorkspaces>[0]["deps"];

function baseDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    listManagedOrganizationsForUser: async () => [],
    getWorkspaceLimitStatusForUser: async () => ({
      tier: "free",
      currentOrgs: 0,
      maxOrgs: 1,
      canCreate: true,
      plan: null,
      features: {},
    }),
    rollupWorkspace: async (orgId: string) => ({
      orgId,
      soulCompletedAt: null,
      lastActivityAt: null,
      newLeadsThisWeek: 0,
    }),
    workspaceBaseDomain: "seldonframe.app",
    now: new Date("2026-05-16T12:00:00.000Z"),
    ...overrides,
  };
}

describe("runListMineWorkspaces — auth", () => {
  test("returns 401 envelope when sessionUser is null", async () => {
    const result = await runListMineWorkspaces({
      deps: baseDeps(),
      sessionUser: null,
    });

    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "Unauthorized" });
  });
});

describe("runListMineWorkspaces — empty user", () => {
  test("returns empty workspaces + free-tier envelope when user owns nothing", async () => {
    const deps = baseDeps({
      listManagedOrganizationsForUser: async () => [],
      getWorkspaceLimitStatusForUser: async () => ({
        tier: "free",
        currentOrgs: 0,
        maxOrgs: 1,
        canCreate: true,
        plan: null,
        features: {},
      }),
    });

    const result = await runListMineWorkspaces({
      deps,
      sessionUser: { id: "user-1" },
    });

    assert.equal(result.status, 200);
    if (result.status !== 200) throw new Error("unreachable");
    assert.deepEqual(result.body, {
      workspaces: [],
      tier: "free",
      used: 0,
      limit: 1,
    });
  });

  test("reads tier + used + limit straight from the injected helpers", async () => {
    const deps = baseDeps({
      listManagedOrganizationsForUser: async () => [],
      getWorkspaceLimitStatusForUser: async () => ({
        tier: "growth",
        currentOrgs: 0,
        maxOrgs: 3,
        canCreate: true,
        plan: null,
        features: {},
      }),
    });

    const result = await runListMineWorkspaces({
      deps,
      sessionUser: { id: "user-1" },
    });

    assert.equal(result.status, 200);
    if (result.status !== 200) throw new Error("unreachable");
    assert.equal(result.body.tier, "growth");
    assert.equal(result.body.used, 0);
    assert.equal(result.body.limit, 3);
  });
});
