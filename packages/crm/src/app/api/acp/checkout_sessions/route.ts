// ACP checkout sessions — CREATE. POST /api/acp/checkout_sessions
//
// ChatGPT (OpenAI Instant Checkout) opens a session here: it posts
// { items:[{ id, quantity }], buyer? } and gets back a 201 CheckoutSession
// (ready_for_payment once the items resolve to published, paid agents). The
// Idempotency-Key header is honored (a repeat returns the same session).
//
// Thin wrapper: parse body + headers, call the DI'd handleCreate with the real
// deps, map { status, body } onto NextResponse. All logic (validation, listing
// resolution, totals, recorded 5% fee, persistence) lives in lib/acp/handler
// (unit-tested with fakes). MONEY-SAFE: the wired processor is a no-charge stub.

import { NextRequest, NextResponse } from "next/server";
import { handleCreate } from "@/lib/acp/handler";
import { buildRealAcpDeps } from "@/lib/acp/real-deps";
import { readIdempotencyKey, readJsonBody, acpServerError } from "@/lib/acp/route-helpers";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const idempotencyKey = readIdempotencyKey(request);
    const outcome = await handleCreate(body, idempotencyKey, buildRealAcpDeps());
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return acpServerError(err, "create");
  }
}
