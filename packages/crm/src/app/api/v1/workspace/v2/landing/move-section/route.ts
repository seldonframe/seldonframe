// v1.11.0 — POST /api/v1/workspace/v2/landing/move-section
//
// Moves ONE landing section atomically. Index-based addressing handles
// duplicate types (the case v1.10's reorder_landing_sections refused).
//
// Body: { workspace_id, from_index, to_index }
// Splice semantics: section is removed from from_index, inserted at
// to_index in the resulting array.
//
// Auth: workspace bearer token; bearer's orgId must match workspace_id.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { moveSectionForWorkspace } from "@/lib/page-blocks/landing-structure";

type Body = {
  workspace_id?: unknown;
  from_index?: unknown;
  to_index?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const fromIndex =
    typeof body.from_index === "number" ? body.from_index : NaN;
  const toIndex =
    typeof body.to_index === "number" ? body.to_index : NaN;

  if (
    !workspaceId ||
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id", "from_index (integer)", "to_index (integer)"],
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

  const result = await moveSectionForWorkspace(workspaceId, fromIndex, toIndex);

  if (!result.ok) {
    logEvent(
      "v2_move_section_failed",
      {
        from_index: fromIndex,
        to_index: toIndex,
        error: result.error,
        validation_errors: result.validation_errors,
      },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_move_section_succeeded",
    {
      from_index: fromIndex,
      to_index: toIndex,
      sections_count: result.sections.length,
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
