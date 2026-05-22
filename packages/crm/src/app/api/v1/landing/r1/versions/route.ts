// GET /api/v1/landing/r1/versions
//
// Return the version history for the current workspace's R1 landing payload.
// Auth: workspace bearer OR x-org-id + x-api-key.
//
// Query params: limit (optional, default 20, max 100).

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { listLandingVersions } from "@/lib/landing/r1-customize";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "20", 10) || 20), 100);

  const versions = await listLandingVersions(guard.orgId, limit);

  return NextResponse.json({ data: versions });
}
