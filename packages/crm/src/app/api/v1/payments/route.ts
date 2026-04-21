import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { listPaymentsForOrg } from "@/lib/payments/api";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const rows = await listPaymentsForOrg(guard.orgId, limit);
  return NextResponse.json({ data: rows });
}
