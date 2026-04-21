import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getPaymentRecord } from "@/lib/payments/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const row = await getPaymentRecord(guard.orgId, id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row });
}
