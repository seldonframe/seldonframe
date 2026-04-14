import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

const DEFAULT_PRO_WORKSPACE_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";

function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }

      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }

      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  const apiKeyUserId = resolveUserIdFromSeldonApiKey(req.headers);
  const hasApiKeyHeader = Boolean(req.headers.get("x-seldon-api-key")?.trim());

  const session = apiKeyUserId ? null : await auth();
  const userId = apiKeyUserId ?? session?.user?.id ?? null;

  if (hasApiKeyHeader && !apiKeyUserId) {
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const stripe = getStripeClient();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      orgId: users.orgId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceId, billingPeriod, plan } = (await req.json()) as {
    priceId?: string;
    billingPeriod?: string;
    plan?: string;
  };

  let stripePriceId = (priceId ?? "").trim();

  if (!stripePriceId && plan?.trim().toLowerCase() === "pro") {
    stripePriceId = process.env.SELDONFRAME_PRO_PRICE_ID?.trim() || DEFAULT_PRO_WORKSPACE_PRICE_ID;
  }

  if (!stripePriceId && billingPeriod) {
    const prices = await stripe.prices.list({
      lookup_keys: [billingPeriod],
      active: true,
      limit: 1,
    });

    stripePriceId = prices.data[0]?.id || "";
  }

  if (!stripePriceId) {
    return NextResponse.json({ error: "Price not found" }, { status: 400 });
  }

  const orgId = apiKeyUserId ? dbUser.orgId : (await getOrgId()) ?? dbUser.orgId;

  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: dbUser.email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${getAppUrl()}/dashboard?upgraded=1`,
    cancel_url: `${getAppUrl()}/pricing`,
    metadata: {
      userId,
      orgId: orgId ?? "",
      plan: plan?.trim().toLowerCase() === "pro" ? "pro" : "",
    },
    subscription_data: {
      metadata: {
        userId,
        orgId: orgId ?? "",
        plan: plan?.trim().toLowerCase() === "pro" ? "pro" : "",
      },
      trial_period_days: 14,
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
