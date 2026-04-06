import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifyStripeWebhook } from "@seldonframe/payments";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPlanByStripePriceId } from "@/lib/billing/plans";
import { finalizeBlockPurchaseFromWebhook, finalizeSoulPurchaseFromWebhook } from "@/lib/marketplace/actions";

type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | "unpaid";

function mapSubscriptionStatus(value: string | undefined): BillingStatus {
  switch (value) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    default:
      return "active";
  }
}

async function updateUserBillingByIdentifiers(params: {
  userId?: string | null;
  customerId?: string | null;
  values: Partial<{
    planId: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    billingPeriod: "monthly" | "yearly";
    subscriptionStatus: BillingStatus;
    trialEndsAt: Date | null;
  }>;
}) {
  const hasUserId = Boolean(params.userId);
  const hasCustomerId = Boolean(params.customerId);

  if (!hasUserId && !hasCustomerId) {
    return;
  }

  const where = hasUserId && hasCustomerId
    ? or(eq(users.id, params.userId as string), eq(users.stripeCustomerId, params.customerId as string))
    : hasUserId
      ? eq(users.id, params.userId as string)
      : eq(users.stripeCustomerId, params.customerId as string);

  await db
    .update(users)
    .set({
      ...params.values,
      updatedAt: new Date(),
    })
    .where(where);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_BILLING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  let event: ReturnType<typeof verifyStripeWebhook>;

  try {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    event = verifyStripeWebhook({ payload, signature });
    process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const object = event.data.object as {
        client_reference_id?: string | null;
        customer?: string | { id?: string } | null;
        subscription?: string | { id?: string } | null;
        payment_intent?: string | { id?: string } | null;
        metadata?: Record<string, string> | null;
      };

      if (object.metadata?.type === "block_purchase") {
        const stripePaymentId =
          typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id || null;

        await finalizeBlockPurchaseFromWebhook({
          orgId: object.metadata?.orgId || "",
          userId: object.metadata?.userId || null,
          blockId: object.metadata?.blockId || "",
          stripePaymentId,
        });

        break;
      }

      if (object.metadata?.type === "soul_purchase") {
        const stripePaymentId =
          typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id || null;

        await finalizeSoulPurchaseFromWebhook({
          orgId: object.metadata?.orgId || "",
          userId: object.metadata?.userId || null,
          listingId: object.metadata?.listingId || null,
          listingSlug: object.metadata?.listingSlug || null,
          stripePaymentId,
        });

        break;
      }

      const userId = object.metadata?.seldonframe_user_id || object.client_reference_id || null;
      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id || null;
      const subscriptionId =
        typeof object.subscription === "string" ? object.subscription : object.subscription?.id || null;
      const planId = object.metadata?.seldonframe_plan_id ?? null;

      await updateUserBillingByIdentifiers({
        userId,
        customerId,
        values: {
          planId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: "trialing",
        },
      });

      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const object = event.data.object as {
        id?: string;
        customer?: string | { id?: string };
        status?: string;
        items?: {
          data?: Array<{
            price?: {
              id?: string;
            };
          }>;
        };
      };

      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id || null;
      const firstPriceId = object.items?.data?.[0]?.price?.id;
      const resolvedPlan = firstPriceId ? getPlanByStripePriceId(firstPriceId) : null;

      await updateUserBillingByIdentifiers({
        customerId,
        values: {
          planId: resolvedPlan?.plan.id ?? null,
          billingPeriod: resolvedPlan?.billingPeriod,
          stripeSubscriptionId: object.id ?? null,
          subscriptionStatus: event.type === "customer.subscription.deleted" ? "canceled" : mapSubscriptionStatus(object.status),
        },
      });

      break;
    }

    case "invoice.payment_failed":
    case "invoice.paid": {
      const object = event.data.object as {
        customer?: string | { id?: string };
        subscription?: string | { id?: string } | null;
      };

      const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id || null;
      const subscriptionId =
        typeof object.subscription === "string" ? object.subscription : object.subscription?.id || null;

      await updateUserBillingByIdentifiers({
        customerId,
        values: {
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: event.type === "invoice.payment_failed" ? "past_due" : "active",
        },
      });

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
