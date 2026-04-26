// POST /api/v1/approvals/[approvalId]/override — org-owner emergency
// unblock. Per G-10-7, sets override_flag=true in the audit trail.
// SLICE 10 PR 1 C5.
//
// Body: { decision: "approve" | "reject", comment?: string }
// Outcomes:
//   200 { ok: true, runId, status, override: true }
//   401 unauthorized
//   403 override_requires_org_owner — caller isn't the workspace owner
//   404 not_found | 409 already_resolved | wrong_org | 422 invalid_body

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import {
  DrizzleApprovalStorage,
  authorizeAuthenticatedResolution,
  getMagicLinkSecretForWorkspace,
} from "@/lib/workflow/approvals";
import { runtimeResumeApproval } from "@/lib/workflow/runtime";
import { DrizzleRuntimeStorage } from "@/lib/workflow/storage-drizzle";
import { notImplementedToolInvoker, type RuntimeContext } from "@/lib/workflow/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  const { approvalId } = await params;

  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await getOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body", details: body.error.issues }, { status: 422 });
  }

  const [orgRow] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const isOwner = orgRow?.ownerId === user.id;

  const storage = new DrizzleApprovalStorage(db);
  const authz = await authorizeAuthenticatedResolution(
    storage,
    { approvalId, callerOrgId: orgId, callerUserId: user.id, callerIsOrgOwner: isOwner },
    true, // override path
  );

  if (authz.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (authz.kind === "wrong_org") return NextResponse.json({ error: "wrong_org" }, { status: 409 });
  if (authz.kind === "forbidden") return NextResponse.json({ error: authz.reason }, { status: 403 });
  if (authz.kind === "already_resolved") {
    return NextResponse.json({ error: "already_resolved", status: authz.approval.status }, { status: 409 });
  }
  if (authz.kind !== "ok") {
    return NextResponse.json({ error: authz.kind }, { status: 410 });
  }

  const context: RuntimeContext = {
    storage: new DrizzleRuntimeStorage(db),
    invokeTool: notImplementedToolInvoker,
    now: () => new Date(),
    approvalStorage: new DrizzleApprovalStorage(db),
    getWorkspaceMagicLinkSecret: getMagicLinkSecretForWorkspace,
  };
  const result = await runtimeResumeApproval(context, {
    approvalId: authz.approval.id,
    resolution: body.data.decision === "approve" ? "approved" : "rejected",
    resolverUserId: user.id,
    comment: body.data.comment ?? null,
    overrideFlag: true,
  });
  if (!result.resumed) {
    return NextResponse.json({ error: "race_lost" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    runId: result.runId,
    status: body.data.decision === "approve" ? "approved" : "rejected",
    override: true,
  });
}
