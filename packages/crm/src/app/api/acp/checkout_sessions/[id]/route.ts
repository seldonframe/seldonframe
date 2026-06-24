// ACP checkout sessions — GET (retrieve) + POST (update).
//   GET  /api/acp/checkout_sessions/{id}  → the CheckoutSession.
//   POST /api/acp/checkout_sessions/{id}  → apply a partial { items?, buyer? }.
//
// Thin wrappers over the DI'd handleGet / handleUpdate. Update re-resolves
// items + recomputes totals/fee (5%, recorded) when items change. MONEY-SAFE:
// no charge happens on get/update.

import { NextRequest, NextResponse } from "next/server";
import { handleGet, handleUpdate } from "@/lib/acp/handler";
import { buildRealAcpDeps } from "@/lib/acp/real-deps";
import { readJsonBody, acpServerError } from "@/lib/acp/route-helpers";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const outcome = await handleGet(id, buildRealAcpDeps());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return acpServerError(err, "get");
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const outcome = await handleUpdate(id, body, buildRealAcpDeps());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return acpServerError(err, "update");
  }
}
