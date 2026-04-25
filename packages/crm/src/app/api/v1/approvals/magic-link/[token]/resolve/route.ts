// POST /api/v1/approvals/magic-link/[token]/resolve — client_owner
// resolves an approval via the emailed magic-link token.
// SLICE 10 PR 1 C5 per audit §8.3 + G-10-8.
//
// No session required (token IS the auth). Uniform error responses
// to defeat user enumeration:
//   200 ok / 410 expired / 410 invalid_token / 409 already_resolved /
//   422 invalid_body
//
// Body: { decision: "approve" | "reject", comment?: string }

import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  DrizzleApprovalStorage,
  authorizeMagicLinkResolution,
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
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const body = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body", details: body.error.issues }, { status: 422 });
  }

  const storage = new DrizzleApprovalStorage(db);

  // Magic-link tokens are workspace-scoped; we need the workspace
  // signing secret to verify. The token itself doesn't carry an
  // orgId in clear text (the approvalId IS in the payload, but the
  // approval row has the orgId). For PR 1 v1 we use a single
  // env-var secret (workspace-scoped secrets land in v1.1 alongside
  // per-workspace key rotation).
  let secret: string;
  try {
    // PR 1 simplification: single env-var secret regardless of orgId.
    secret = await getMagicLinkSecretForWorkspace("");
  } catch {
    return NextResponse.json({ error: "magic_link_disabled" }, { status: 503 });
  }

  const authz = await authorizeMagicLinkResolution(storage, {
    token,
    secret,
    now: new Date(),
  });

  if (authz.kind === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (authz.kind === "invalid_token") return NextResponse.json({ error: "invalid_token" }, { status: 410 });
  if (authz.kind === "already_resolved") {
    return NextResponse.json({ error: "already_resolved", status: authz.approval.status }, { status: 409 });
  }
  if (authz.kind !== "ok") {
    // not_found / forbidden / wrong_org are unreachable on the magic-link
    // path but defensive.
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
    // resolverUserId is null on magic-link path — the token IS the
    // identity; we don't have a SeldonFrame user_id for the client.
    // The audit-trail magic_link_token_hash + the approverUserId
    // (snapshotted at create time) provide forensic traceability.
    resolution: body.data.decision === "approve" ? "approved" : "rejected",
    resolverUserId: null,
    comment: body.data.comment ?? null,
    overrideFlag: false,
  });
  if (!result.resumed) {
    return NextResponse.json({ error: "race_lost" }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    runId: result.runId,
    status: body.data.decision === "approve" ? "approved" : "rejected",
  });
}
