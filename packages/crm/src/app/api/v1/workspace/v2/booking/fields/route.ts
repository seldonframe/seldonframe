// v1.14.0 — POST /api/v1/workspace/v2/booking/fields
//
// One endpoint, four ops via `op`:
//   { workspace_id, op: "add",    field, position? }
//   { workspace_id, op: "move",   from_index, to_index }
//   { workspace_id, op: "delete", index }
//   { workspace_id, op: "update", index, patch }
//
// Standard-field contract (fullName + email) is enforced in the
// pure helpers — destructive ops on indices 0/1 are rejected with
// structured errors before any DB write.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  addBookingFieldForWorkspace,
  moveBookingFieldForWorkspace,
  deleteBookingFieldForWorkspace,
  updateBookingFieldForWorkspace,
} from "@/lib/page-blocks/booking-structure";
import type { BookingFormField } from "@/lib/blueprint/types";

type Body = {
  workspace_id?: unknown;
  op?: unknown;
  field?: unknown;
  position?: unknown;
  from_index?: unknown;
  to_index?: unknown;
  index?: unknown;
  patch?: unknown;
};

const VALID_OPS = ["add", "move", "delete", "update"] as const;
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
    if (!body.field || typeof body.field !== "object") {
      return NextResponse.json(
        { ok: false, error: "missing_field" },
        { status: 400 },
      );
    }
    const position =
      typeof body.position === "number" && Number.isInteger(body.position)
        ? body.position
        : undefined;
    result = await addBookingFieldForWorkspace(
      workspaceId,
      body.field as BookingFormField,
      position,
    );
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
    result = await moveBookingFieldForWorkspace(
      workspaceId,
      body.from_index,
      body.to_index,
    );
  } else if (op === "delete") {
    if (typeof body.index !== "number" || !Number.isInteger(body.index)) {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["index (integer)"] },
        { status: 400 },
      );
    }
    result = await deleteBookingFieldForWorkspace(workspaceId, body.index);
  } else {
    if (
      typeof body.index !== "number" ||
      !Number.isInteger(body.index) ||
      !body.patch ||
      typeof body.patch !== "object"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["index (integer)", "patch (object)"],
        },
        { status: 400 },
      );
    }
    result = await updateBookingFieldForWorkspace(
      workspaceId,
      body.index,
      body.patch as Partial<BookingFormField>,
    );
  }

  if (!result.ok) {
    logEvent(
      "v2_booking_field_op_failed",
      { op, error: result.error, validation_errors: result.validation_errors },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_booking_field_op_succeeded",
    { op, fields_count: result.fields.length },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
