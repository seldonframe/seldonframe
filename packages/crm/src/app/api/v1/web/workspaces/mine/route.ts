// packages/crm/src/app/api/v1/web/workspaces/mine/route.ts
//
// Thin Next route handler that delegates to `runListMineWorkspaces`.
// Wires the real billing/rollup helpers as DI deps so the orchestrator
// tests can swap them for fakes. Mirrors the Cut A pattern in
// create-from-url/route.ts.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getWorkspaceLimitStatusForUser,
  listManagedOrganizationsForUser,
} from "@/lib/billing/orgs";
import { rollupWorkspace } from "@/lib/workspaces/rollup";
import { runListMineWorkspaces } from "@/lib/workspaces/run-list-mine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const session = await auth();
  const sessionUser = session?.user?.id ? { id: session.user.id } : null;

  const workspaceBaseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";

  const result = await runListMineWorkspaces({
    deps: {
      listManagedOrganizationsForUser,
      getWorkspaceLimitStatusForUser,
      rollupWorkspace,
      workspaceBaseDomain,
      now: new Date(),
    },
    sessionUser,
  });

  return NextResponse.json(result.body, { status: result.status });
}
