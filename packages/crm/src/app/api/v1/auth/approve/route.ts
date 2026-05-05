// v1.7.0 — POST /api/v1/auth/approve
//
// Called by the browser approval page when the operator clicks "Yes".
// Anonymous endpoint — the only credential is possession of the atok
// (which is in the magic-link URL the operator received via email).
// CSRF-safe: this endpoint accepts POST only, the atok is in the body
// (not a cookie), and the page that POSTs is on the same origin as the
// atok-generating origin.

import { NextResponse } from "next/server";
import { approveDeviceAuth } from "@/lib/auth/device-auth";
import { logEvent } from "@/lib/observability/log";

type Body = { atok?: unknown };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const atok = typeof body.atok === "string" ? body.atok.trim() : "";
  if (!atok) {
    return NextResponse.json(
      { ok: false, error: "missing_atok" },
      { status: 400 },
    );
  }

  const result = await approveDeviceAuth({ atok });
  if (!result.ok) {
    logEvent(
      "device_auth_approve_failed",
      { error: result.error },
      { request, status: 400 },
    );
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }

  logEvent(
    "device_auth_approved",
    { workspace_id: result.workspace_id },
    { request, orgId: result.workspace_id, status: 200 },
  );
  return NextResponse.json({ ok: true });
}
