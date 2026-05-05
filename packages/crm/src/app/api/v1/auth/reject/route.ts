// v1.7.0 — POST /api/v1/auth/reject
//
// Called by the browser approval page when the operator clicks "No,
// this wasn't me". Marks the atok as rejected so the polling MCP
// stops waiting + the operator gets a clear failure message.

import { NextResponse } from "next/server";
import { rejectDeviceAuth } from "@/lib/auth/device-auth";
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
  const result = await rejectDeviceAuth({ atok });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
  logEvent(
    "device_auth_rejected",
    {},
    { request, status: 200 },
  );
  return NextResponse.json({ ok: true });
}
