import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { getPaymentRecord, refundPaymentFromApi } from "@/lib/payments/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as {
    amount?: unknown;
    reason?: unknown;
  };

  const { id } = await params;
  const payment = await getPaymentRecord(guard.orgId, id);
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (!payment.stripePaymentIntentId) {
    return NextResponse.json({ error: "Payment has no provider intent id" }, { status: 422 });
  }

  const validReasons = ["duplicate", "fraudulent", "requested_by_customer"] as const;
  const reason =
    typeof body.reason === "string" && (validReasons as readonly string[]).includes(body.reason)
      ? (body.reason as (typeof validReasons)[number])
      : undefined;

  try {
    const result = await refundPaymentFromApi({
      orgId: guard.orgId,
      paymentId: id,
      externalPaymentIntentId: payment.stripePaymentIntentId,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      reason,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
