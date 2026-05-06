// v1.12.0 — POST /api/v1/workspace/v2/landing/composite
//
// Add OR update a composite-tree section on the landing page.
//
// Body shapes (one of):
//   { workspace_id, op: "add",    tree, position? }
//   { workspace_id, op: "update", tree, index    }
//
// Auth: workspace bearer token; bearer's orgId must match workspace_id.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  addCompositeSection,
  updateCompositeSection,
} from "@/lib/page-blocks/composite/persist";

type Body = {
  workspace_id?: unknown;
  op?: unknown;
  tree?: unknown;
  position?: unknown;
  index?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const op = typeof body.op === "string" ? body.op.trim() : "";
  const tree = body.tree;

  if (!workspaceId || (op !== "add" && op !== "update") || tree == null) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id", "op (add|update)", "tree"],
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

  let result;
  if (op === "add") {
    const position =
      typeof body.position === "number" && Number.isInteger(body.position)
        ? body.position
        : undefined;
    result = await addCompositeSection(workspaceId, tree, position);
  } else {
    if (typeof body.index !== "number" || !Number.isInteger(body.index)) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["index (integer) for op=update"],
        },
        { status: 400 },
      );
    }
    result = await updateCompositeSection(workspaceId, body.index, tree);
  }

  if (!result.ok) {
    logEvent(
      "v2_composite_section_failed",
      {
        op,
        error: result.error,
        validation_errors: result.validation_errors,
      },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_composite_section_succeeded",
    {
      op,
      index: result.index,
      sections_count: result.sections.length,
      voice_warnings_count: result.validation_warnings.length,
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
