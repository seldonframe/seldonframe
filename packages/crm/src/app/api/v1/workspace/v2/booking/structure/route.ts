// v1.14.0 — GET /api/v1/workspace/v2/booking/structure
//
// Returns the workspace's booking event-type + indexed field list
// with previews. Standard fields (fullName, email) are flagged
// is_standard:true so the agent knows they can't be mutated.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { getBookingStructureForWorkspace } from "@/lib/page-blocks/booking-structure";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const result = await getBookingStructureForWorkspace(guard.orgId);

  if (!result.ok) {
    logEvent(
      "v2_get_booking_structure_failed",
      { error: result.error, validation_errors: result.validation_errors },
      { request, orgId: guard.orgId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_get_booking_structure_succeeded",
    { fields_count: result.fields.length },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
