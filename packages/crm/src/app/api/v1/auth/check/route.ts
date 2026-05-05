// v1.7.0 — GET /api/v1/auth/check?atok=...
//
// Polled by the MCP server while it waits for the operator to click
// the email link + approve on the browser page. Returns:
//
//   { status: "pending" }       — keep polling
//   { status: "approved", token, workspace_id, expires_at }
//                                — one-shot. Subsequent polls return
//                                  "already_claimed".
//   { status: "rejected" | "expired" | "not_found" | "already_claimed" }
//                                — terminal. Stop polling.
//
// Possession of the atok is the only credential. atoks are 256-bit
// random URL-safe strings — guessing one is computationally infeasible.

import { NextResponse } from "next/server";
import { checkDeviceAuth } from "@/lib/auth/device-auth";

export async function GET(request: Request) {
  // v1.7.2 — wrap to guarantee JSON response shape even on crashes.
  // The MCP polling loop chokes on non-JSON; consistent shape lets it
  // surface a clean error to the agent instead of looking like a
  // network failure.
  try {
    const url = new URL(request.url);
    const atok = url.searchParams.get("atok")?.trim() ?? "";
    if (!atok) {
      return NextResponse.json(
        { ok: false, error: "missing_atok" },
        { status: 400 },
      );
    }
    const result = await checkDeviceAuth({ atok });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auth/check] unexpected error: ${message}`);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    );
  }
}
