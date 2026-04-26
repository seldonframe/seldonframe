// GET /api/v1/approvals/pending — list pending approvals for the
// caller's workspace.
// SLICE 10 PR 1 C5 per audit §7.1 + Max's gate-resolution prompt.
//
// Workspace-scoped (uses getOrgId from session). Returns the rows
// directly serialized. Pagination via ?limit=N&offset=M (defaults
// 50/0). PR 2 admin UI consumes this for the dedicated
// /agents/approvals page + the drawer block.

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { getOrgId } from "@/lib/auth/helpers";
import { DrizzleApprovalStorage } from "@/lib/workflow/approvals/storage-drizzle";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = clampInt(request.nextUrl.searchParams.get("limit"), 1, 100, 50);
  const offset = clampInt(request.nextUrl.searchParams.get("offset"), 0, 10_000, 0);

  const storage = new DrizzleApprovalStorage(db);
  const rows = await storage.listPendingApprovalsForOrg(orgId, { limit, offset });

  return NextResponse.json({
    approvals: rows.map((r) => ({
      id: r.id,
      runId: r.runId,
      stepId: r.stepId,
      orgId: r.orgId,
      approverType: r.approverType,
      approverUserId: r.approverUserId,
      contextTitle: r.contextTitle,
      contextSummary: r.contextSummary,
      contextPreview: r.contextPreview,
      contextMetadata: r.contextMetadata,
      timeoutAction: r.timeoutAction,
      timeoutAt: r.timeoutAt ? r.timeoutAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { limit, offset },
  });
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
