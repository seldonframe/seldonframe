// v1.11.0 — GET /api/v1/workspace/v2/landing/structure
//
// Returns the workspace's landing-page section list with INDEX as the
// addressing primitive plus a 1-line preview per section. The agent
// uses this to discover the page structure before calling move_section
// or delete_section — replaces the v1.10 workflow where the agent had
// to fetch + parse landing_pages.blueprintJson manually (which forced
// PowerShell hunts that took several minutes).
//
// Auth: workspace bearer token. Bearer's orgId is the only workspace
// the call can read.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { getLandingStructureForWorkspace } from "@/lib/page-blocks/landing-structure";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const result = await getLandingStructureForWorkspace(guard.orgId);

  if (!result.ok) {
    logEvent(
      "v2_get_landing_structure_failed",
      { error: result.error, validation_errors: result.validation_errors },
      { request, orgId: guard.orgId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_get_landing_structure_succeeded",
    { sections_count: result.sections.length },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
