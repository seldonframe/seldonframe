import { NextResponse } from "next/server";
import { mapStripeEvent, verifyStripeWebhook } from "@seldonframe/payments";
import { handleStripeCheckoutCompleted } from "@/lib/payments/actions";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ReturnType<typeof verifyStripeWebhook>;

  try {
    event = verifyStripeWebhook({ payload, signature });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const mapped = mapStripeEvent(event);

  if (mapped.type === "checkout.completed") {
    const object = mapped.event.data.object as {
      id?: string;
      metadata?: Record<string, string> | null;
      amount_total?: number | null;
      currency?: string | null;
      payment_intent?: string | null | { id?: string };
    };

    if (!object.id) {
      return NextResponse.json({ ok: true });
    }

    await handleStripeCheckoutCompleted({
      id: object.id,
      metadata: object.metadata,
      amount_total: object.amount_total,
      currency: object.currency,
      payment_intent: typeof object.payment_intent === "string" ? object.payment_intent : null,
    });
  }

  return NextResponse.json({ ok: true });
}
