// ACP checkout sessions — CANCEL.
//   POST /api/acp/checkout_sessions/{id}/cancel → status:"canceled".
//
// Thin wrapper over the DI'd handleCancel. No body, no charge.

import { NextRequest, NextResponse } from "next/server";
import { handleCancel } from "@/lib/acp/handler";
import { buildRealAcpDeps } from "@/lib/acp/real-deps";
import { acpServerError } from "@/lib/acp/route-helpers";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const outcome = await handleCancel(id, buildRealAcpDeps());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return acpServerError(err, "cancel");
  }
}
