// POST /api/v1/build/payout — withdraw the caller's accrued marketplace earnings
// to their connected bank (a Stripe Connect Transfer). Bearer-authed (wst_) so the
// CLI + agents can call it. Thin wrapper over the PURE requestPayout with the real
// deps (payout-deps.ts) — money-safe by construction: flag-gated, inert without a
// Stripe key, idempotent, min-withdraw enforced. THE ONLY money-OUT endpoint.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { requestPayout } from "@/lib/build/payout";
import { buildPayoutDeps } from "@/lib/build/payout-deps";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) {
    return NextResponse.json({ status: "disabled" }, { status: 401 });
  }

  const result = await requestPayout({ orgId }, buildPayoutDeps());
  return NextResponse.json(result);
}
