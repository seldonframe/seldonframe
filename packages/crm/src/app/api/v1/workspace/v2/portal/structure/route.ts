// v1.15.0 — GET /api/v1/workspace/v2/portal/structure
//
// Returns the workspace's portal template structure: indexed list of
// composite-tree sections with previews. Operators read this BEFORE
// add/update/move/delete to find the right index.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { getPortalStructureForWorkspace } from "@/lib/page-blocks/portal/structure";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const result = await getPortalStructureForWorkspace(guard.orgId);

  if (!result.ok) {
    logEvent(
      "v2_get_portal_structure_failed",
      { error: result.error, validation_errors: result.validation_errors },
      { request, orgId: guard.orgId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_get_portal_structure_succeeded",
    { sections_count: result.sections.length },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
