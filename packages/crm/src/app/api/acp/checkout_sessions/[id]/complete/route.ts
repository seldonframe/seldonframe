// ACP checkout sessions — COMPLETE.
//   POST /api/acp/checkout_sessions/{id}/complete
//   body { buyer?, payment_data:{ token, provider:"stripe" } }
//
// Runs the payment processor and (on ok) stamps the order + status:completed +
// logs an acp_order_completed event (so seller earnings can attribute it later).
//
// ─── MONEY-SAFETY ───────────────────────────────────────────────────────────
// The processor is resolveProcessor() — the NO-CHARGE dev stub in v1. It returns
// a fake paymentRef (acp_stub_… / acp_free) and moves NO money. The delegated
// payment_data.token is validated for presence but NEVER charged. If ACP_LIVE is
// flipped without a real processor wired, buildRealAcpDeps() → resolveProcessor()
// THROWS here and this returns a 500 — a deploy can never silently charge.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { handleComplete } from "@/lib/acp/handler";
import { buildRealAcpDeps } from "@/lib/acp/real-deps";
import { readIdempotencyKey, readJsonBody, acpServerError } from "@/lib/acp/route-helpers";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const idempotencyKey = readIdempotencyKey(request);
    const outcome = await handleComplete(id, body, idempotencyKey, buildRealAcpDeps());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return acpServerError(err, "complete");
  }
}
