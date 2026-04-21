import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { voidInvoiceFromApi } from "@/lib/payments/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    const result = await voidInvoiceFromApi(guard.orgId, id);
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Void failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
