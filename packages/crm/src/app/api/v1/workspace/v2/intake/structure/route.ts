// v1.13.0 — GET /api/v1/workspace/v2/intake/structure
//
// Returns the workspace's intake form structure: title, description,
// and indexed list of fields with previews. Mirrors landing/structure.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { getIntakeStructureForWorkspace } from "@/lib/page-blocks/intake-structure";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const result = await getIntakeStructureForWorkspace(guard.orgId);

  if (!result.ok) {
    logEvent(
      "v2_get_intake_structure_failed",
      { error: result.error, validation_errors: result.validation_errors },
      { request, orgId: guard.orgId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_get_intake_structure_succeeded",
    { fields_count: result.fields.length },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
