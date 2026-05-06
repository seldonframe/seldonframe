// v1.15.0 — POST /api/v1/workspace/v2/portal/section
//
// Add / update / move / delete a section in the workspace's portal
// template. One endpoint, four ops via `op` field. The portal
// template is CompositeNode[] stored on
// organizations.settings.portal_template — the same composite primitive
// vocabulary used for landing, just rendered against a per-customer
// context at request time.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  addPortalSectionForWorkspace,
  updatePortalSectionForWorkspace,
  movePortalSectionForWorkspace,
  deletePortalSectionForWorkspace,
} from "@/lib/page-blocks/portal/structure";

type Body = {
  workspace_id?: unknown;
  op?: unknown;
  tree?: unknown;
  position?: unknown;
  index?: unknown;
  from_index?: unknown;
  to_index?: unknown;
};

const VALID_OPS = ["add", "update", "move", "delete"] as const;
type Op = (typeof VALID_OPS)[number];

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const op =
    typeof body.op === "string" && (VALID_OPS as readonly string[]).includes(body.op)
      ? (body.op as Op)
      : null;

  if (!workspaceId || !op) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id", `op (${VALID_OPS.join("|")})`],
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
    if (body.tree == null) {
      return NextResponse.json(
        { ok: false, error: "missing_field", required: ["tree"] },
        { status: 400 },
      );
    }
    const position =
      typeof body.position === "number" && Number.isInteger(body.position)
        ? body.position
        : undefined;
    result = await addPortalSectionForWorkspace(workspaceId, body.tree, position);
  } else if (op === "update") {
    if (
      typeof body.index !== "number" ||
      !Number.isInteger(body.index) ||
      body.tree == null
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["index (integer)", "tree"],
        },
        { status: 400 },
      );
    }
    result = await updatePortalSectionForWorkspace(workspaceId, body.index, body.tree);
  } else if (op === "move") {
    if (
      typeof body.from_index !== "number" ||
      typeof body.to_index !== "number" ||
      !Number.isInteger(body.from_index) ||
      !Number.isInteger(body.to_index)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["from_index (integer)", "to_index (integer)"],
        },
        { status: 400 },
      );
    }
    result = await movePortalSectionForWorkspace(
      workspaceId,
      body.from_index,
      body.to_index,
    );
  } else {
    if (typeof body.index !== "number" || !Number.isInteger(body.index)) {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["index (integer)"] },
        { status: 400 },
      );
    }
    result = await deletePortalSectionForWorkspace(workspaceId, body.index);
  }

  if (!result.ok) {
    logEvent(
      "v2_portal_section_op_failed",
      { op, error: result.error, validation_errors: result.validation_errors },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_portal_section_op_succeeded",
    {
      op,
      sections_count: result.sections.length,
      voice_warnings_count: result.validation_warnings.length,
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
