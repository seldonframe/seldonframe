// v1.10.0 — POST /api/v1/workspace/v2/landing/reorder
//
// Reorders landing-page sections without changing their content.
// Body: { workspace_id, new_order: string[] } where new_order is the
// ordered array of section types (e.g. ["hero", "services-grid",
// "mid-cta", "faq"]).
//
// Auth: workspace bearer token; bearer's orgId must match
// workspace_id.
//
// Validation: the multiset of section types in new_order must equal
// the current blueprint's section types. No add/remove. For content
// edits use update_landing_section. For new generation use
// regenerate_block / persist_block.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { applyReorderForWorkspace } from "@/lib/page-blocks/reorder";

type Body = {
  workspace_id?: unknown;
  new_order?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const newOrder = Array.isArray(body.new_order)
    ? body.new_order.filter((v): v is string => typeof v === "string")
    : null;

  if (!workspaceId || !newOrder) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id", "new_order"],
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

  const result = await applyReorderForWorkspace(workspaceId, newOrder);

  if (!result.ok) {
    logEvent(
      "v2_reorder_landing_failed",
      {
        error: result.error,
        validation_errors: result.validation_errors,
      },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_reorder_landing_succeeded",
    { sections_order: result.sections_order },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
