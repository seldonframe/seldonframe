// GET /api/v1/landing/r1/versions
//
// Return the version history for the current workspace's R1 landing payload.
// Auth: workspace bearer OR x-org-id + x-api-key.
//
// Query params: limit (optional, default 20, max 100).

import { NextResponse } from "next/server";
import { listLandingVersions } from "@/lib/landing/r1-customize";
import { resolveR1Auth } from "@/lib/landing/r1-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Dual-path auth: session (in-app editor) OR workspace bearer (MCP).
  const authResult = await resolveR1Auth(request);
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "20", 10) || 20), 100);

  const versions = await listLandingVersions(authResult.orgId, limit);

  return NextResponse.json({ data: versions });
}
