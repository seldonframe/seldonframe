// POST /api/v1/approvals/[approvalId]/resolve — operator / user_id /
// org-owner resolves a pending approval via the admin surface.
// SLICE 10 PR 1 C5 per audit §7.5 + G-10-7.
//
// Body: { decision: "approve" | "reject", comment?: string }
// Outcomes:
//   200 { ok: true, runId, status }     — resolution claimed + run advanced
//   401 unauthorized                     — no session
//   403 not_bound_approver               — caller isn't the bound approver (use /override)
//   404 not_found                        — approval id unknown
//   409 already_resolved | wrong_org     — race lost or cross-org
//   422 invalid_body                     — bad JSON / missing decision

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

  const isOwner = await callerIsOrgOwner(orgId, user.id);

  const storage = new DrizzleApprovalStorage(db);
  const authz = await authorizeAuthenticatedResolution(
    storage,
    { approvalId, callerOrgId: orgId, callerUserId: user.id, callerIsOrgOwner: isOwner },
    false, // regular path; override route is separate
  );
  return await handleAuthzOutcome(authz, body.data, user.id);
}

async function callerIsOrgOwner(orgId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.ownerId === userId;
}

async function handleAuthzOutcome(
  outcome: Awaited<ReturnType<typeof authorizeAuthenticatedResolution>>,
  body: { decision: "approve" | "reject"; comment?: string },
  userId: string,
): Promise<Response> {
  if (outcome.kind === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (outcome.kind === "wrong_org") return NextResponse.json({ error: "wrong_org" }, { status: 409 });
  if (outcome.kind === "forbidden") {
    return NextResponse.json({ error: outcome.reason }, { status: 403 });
  }
  if (outcome.kind === "already_resolved") {
    return NextResponse.json({ error: "already_resolved", status: outcome.approval.status }, { status: 409 });
  }
  if (outcome.kind === "expired" || outcome.kind === "invalid_token") {
    // Not reachable on the authenticated path, but defensive.
    return NextResponse.json({ error: outcome.kind }, { status: 410 });
  }

  // ok — proceed to runtime resume.
  const context: RuntimeContext = {
    storage: new DrizzleRuntimeStorage(db),
    invokeTool: notImplementedToolInvoker,
    now: () => new Date(),
    approvalStorage: new DrizzleApprovalStorage(db),
    getWorkspaceMagicLinkSecret: getMagicLinkSecretForWorkspace,
  };
  const result = await runtimeResumeApproval(context, {
    approvalId: outcome.approval.id,
    resolution: body.decision === "approve" ? "approved" : "rejected",
    resolverUserId: userId,
    comment: body.comment ?? null,
    overrideFlag: outcome.overrideFlag,
  });
  if (!result.resumed) {
    return NextResponse.json({ error: "race_lost" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, runId: result.runId, status: body.decision === "approve" ? "approved" : "rejected" });
}
