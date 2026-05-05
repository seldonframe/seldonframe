// v1.11.0 — POST /api/v1/workspace/v2/landing/delete-section
//
// Removes ONE landing section atomically. Refuses to leave 0 sections
// (empty landing pages are broken UX).
//
// Body: { workspace_id, index }
//
// Auth: workspace bearer token; bearer's orgId must match workspace_id.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { deleteSectionForWorkspace } from "@/lib/page-blocks/landing-structure";

type Body = {
  workspace_id?: unknown;
  index?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const index = typeof body.index === "number" ? body.index : NaN;

  if (!workspaceId || !Number.isInteger(index)) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id", "index (integer)"],
      },
      { status: 400 },
    );
  }

  if (guard.orgId !== workspaceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "workspace_mismatch",
        message: "Bearer token does not match workspace_id.",
      },
      { status: 403 },
    );
  }

  const result = await deleteSectionForWorkspace(workspaceId, index);

  if (!result.ok) {
    logEvent(
      "v2_delete_section_failed",
      {
        index,
        error: result.error,
        validation_errors: result.validation_errors,
      },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_delete_section_succeeded",
    { index, sections_count: result.sections.length },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
