// packages/crm/src/lib/workspaces/run-list-mine.ts
//
// Orchestrator for GET /api/v1/web/workspaces/mine. Pure function over
// injected dependencies — keeps the Next route handler thin (auth +
// adapt) and lets us test all branches (auth, empty, populated)
// without touching the DB.
//
// Mirrors the Cut A pattern from runCreateFromUrl: the orchestrator
// owns the business shape, the route owns wiring real dependencies.

import type { WorkspaceRollup } from "./rollup";
import { summarizeWorkspace, type WorkspaceSummary } from "./summarize";

export type ListMineSessionUser = {
  id: string;
} | null;

export type ListMineOrgRow = {
  id: string;
  slug: string;
  name: string;
  contactCount: number;
};

export type ListMineLimitStatus = {
  tier: string;
  maxOrgs: number;
  // Carries any other fields the upstream helper returns; we only read
  // tier + maxOrgs at this layer.
  [key: string]: unknown;
};

export type ListMineDeps = {
  listManagedOrganizationsForUser: (
    userId: string,
  ) => Promise<ListMineOrgRow[]>;
  getWorkspaceLimitStatusForUser: (
    userId: string,
  ) => Promise<ListMineLimitStatus>;
  rollupWorkspace: (orgId: string) => Promise<WorkspaceRollup>;
  workspaceBaseDomain: string;
  now: Date;
};

export type ListMineResult =
  | {
      status: 401;
      body: { error: "Unauthorized" };
    }
  | {
      status: 200;
      body: {
        workspaces: WorkspaceSummary[];
        tier: string;
        used: number;
        limit: number;
      };
    };

export async function runListMineWorkspaces(args: {
  deps: ListMineDeps;
  sessionUser: ListMineSessionUser;
}): Promise<ListMineResult> {
  const { deps, sessionUser } = args;

  if (!sessionUser?.id) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const [orgs, limitStatus] = await Promise.all([
    deps.listManagedOrganizationsForUser(sessionUser.id),
    deps.getWorkspaceLimitStatusForUser(sessionUser.id),
  ]);

  const rollups = await Promise.all(
    orgs.map((org) => deps.rollupWorkspace(org.id)),
  );
  const rollupById = new Map(rollups.map((r) => [r.orgId, r]));

  const workspaces = orgs.map((org) => {
    const rollup = rollupById.get(org.id);
    return summarizeWorkspace({
      id: org.id,
      slug: org.slug,
      name: org.name,
      soulCompletedAt: rollup?.soulCompletedAt ?? null,
      contactCount: org.contactCount,
      lastActivityAt: rollup?.lastActivityAt ?? null,
      newLeadsThisWeek: rollup?.newLeadsThisWeek ?? 0,
      workspaceBaseDomain: deps.workspaceBaseDomain,
      now: deps.now,
    });
  });

  return {
    status: 200,
    body: {
      workspaces,
      tier: limitStatus.tier,
      used: orgs.length,
      limit: limitStatus.maxOrgs,
    },
  };
}
