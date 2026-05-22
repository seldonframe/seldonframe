// POST /api/v1/landing/r1/revert
//
// Revert the R1 landing payload to a prior version's snapshot.
// Auth: same as /customize (workspace bearer OR x-org-id + x-api-key).
//
// Body: { workspace_id?: string, version_id: string }
//
// Creates a new immutable versions row (never deletes history).

import { NextResponse } from "next/server";
import { revertLandingR1 } from "@/lib/landing/r1-customize";
import { resolveR1Auth } from "@/lib/landing/r1-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Dual-path auth: session (in-app editor) OR workspace bearer (MCP).
  const authResult = await resolveR1Auth(request);
  if (!authResult.ok) return authResult.response;

  const { orgId, userId } = authResult;

  const body = (await request.json()) as {
    version_id?: unknown;
  };

  if (typeof body.version_id !== "string" || !body.version_id.trim()) {
    return NextResponse.json(
      { error: "version_id is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const result = await revertLandingR1({
    workspaceId: orgId,
    versionId: body.version_id,
    userId,
  });

  if (!result.ok) {
    const status =
      result.reason === "version_not_found"
        ? 404
        : result.reason === "no_landing_exists"
          ? 404
          : 422;
    return NextResponse.json(
      { error: result.reason, detail: result.detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    version_id: result.versionId,
  });
}
