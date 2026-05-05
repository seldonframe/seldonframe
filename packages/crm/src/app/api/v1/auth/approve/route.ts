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
  // v1.7.2 — wrap the entire handler so an unexpected crash (e.g.
  // missing ENCRYPTION_KEY, DB blip, etc.) still returns valid JSON.
  // Pre-1.7.2 a crash returned an empty 500, the browser's
  // `await res.json()` choked with "Unexpected end of JSON input",
  // and the operator saw a generic frontend error instead of the
  // specific server reason.
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth/approve] unexpected error: ${message}`);
    logEvent(
      "device_auth_approve_crashed",
      { error: message },
      { request, status: 500, severity: "error" },
    );
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    );
  }
}
