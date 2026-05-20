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
      bookingsThisWeek: 0,
      originalSiteUrl: null,
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

describe("runListMineWorkspaces — populated user", () => {
  test("returns WorkspaceSummary[] with id, slug, name, urls, status, contactCount, lastActivityAt, newLeadsThisWeek", async () => {
    const NOW = new Date("2026-05-16T12:00:00.000Z");

    const deps = baseDeps({
      now: NOW,
      listManagedOrganizationsForUser: async () => [
        {
          id: "org-1",
          slug: "acme",
          name: "Acme Corp",
          contactCount: 5,
        },
      ],
      getWorkspaceLimitStatusForUser: async () => ({
        tier: "growth",
        currentOrgs: 1,
        maxOrgs: 3,
        canCreate: true,
        plan: null,
        features: {},
      }),
      rollupWorkspace: async (orgId: string) => ({
        orgId,
        soulCompletedAt: new Date("2026-04-01T00:00:00.000Z"),
        lastActivityAt: new Date("2026-05-15T00:00:00.000Z"),
        newLeadsThisWeek: 2,
        bookingsThisWeek: 1,
        originalSiteUrl: "https://acme.example",
      }),
    });

    const result = await runListMineWorkspaces({
      deps,
      sessionUser: { id: "user-1" },
    });

    assert.equal(result.status, 200);
    if (result.status !== 200) throw new Error("unreachable");
    assert.equal(result.body.workspaces.length, 1);

    const summary = result.body.workspaces[0]!;
    assert.equal(summary.id, "org-1");
    assert.equal(summary.slug, "acme");
    assert.equal(summary.name, "Acme Corp");
    assert.equal(summary.publicUrl, "https://acme.seldonframe.app");
    assert.equal(summary.dashboardUrl, "/dashboard?workspace=org-1");
    assert.equal(summary.contactCount, 5);
    assert.equal(summary.newLeadsThisWeek, 2);
    assert.equal(summary.status, "active");
    assert.equal(summary.lastActivityAt, "2026-05-15T00:00:00.000Z");

    assert.equal(result.body.tier, "growth");
    assert.equal(result.body.used, 1);
    assert.equal(result.body.limit, 3);
  });

  test("multiple workspaces preserve listManaged ordering and pair with their rollups by orgId", async () => {
    const NOW = new Date("2026-05-16T12:00:00.000Z");

    const deps = baseDeps({
      now: NOW,
      listManagedOrganizationsForUser: async () => [
        { id: "org-a", slug: "alpha", name: "Alpha", contactCount: 10 },
        { id: "org-b", slug: "bravo", name: "Bravo", contactCount: 2 },
      ],
      getWorkspaceLimitStatusForUser: async () => ({
        tier: "growth",
        currentOrgs: 2,
        maxOrgs: 3,
        canCreate: true,
        plan: null,
        features: {},
      }),
      rollupWorkspace: async (orgId: string) => {
        if (orgId === "org-a") {
          return {
            orgId,
            soulCompletedAt: new Date("2026-04-01T00:00:00.000Z"),
            lastActivityAt: new Date("2026-05-10T00:00:00.000Z"),
            newLeadsThisWeek: 7,
            bookingsThisWeek: 3,
            originalSiteUrl: "https://alpha.example",
          };
        }
        // org-b: never finished onboarding → "setup"
        return {
          orgId,
          soulCompletedAt: null,
          lastActivityAt: null,
          newLeadsThisWeek: 0,
          bookingsThisWeek: 0,
          originalSiteUrl: null,
        };
      },
    });

    const result = await runListMineWorkspaces({
      deps,
      sessionUser: { id: "user-1" },
    });

    assert.equal(result.status, 200);
    if (result.status !== 200) throw new Error("unreachable");
    assert.equal(result.body.workspaces.length, 2);
    assert.equal(result.body.workspaces[0]!.id, "org-a");
    assert.equal(result.body.workspaces[0]!.status, "active");
    assert.equal(result.body.workspaces[0]!.newLeadsThisWeek, 7);
    assert.equal(result.body.workspaces[1]!.id, "org-b");
    assert.equal(result.body.workspaces[1]!.status, "setup");
    assert.equal(result.body.workspaces[1]!.lastActivityAt, null);
  });
});
