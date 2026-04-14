import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

const WORKSPACE_MONTHLY_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";

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

function getRequestOrigin(req: NextRequest) {
  try {
    return new URL(req.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
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

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY (or STRIPE_LIVE_SECRET_KEY / STRIPE_TEST_SECRET_KEY).",
      },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { quantity?: unknown };
  const quantity = typeof body.quantity === "number" ? body.quantity : 1;

  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
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

  const orgId = apiKeyUserId ? dbUser.orgId : (await getOrgId()) ?? dbUser.orgId;
  const origin = getRequestOrigin(req);

  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: dbUser.email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: WORKSPACE_MONTHLY_PRICE_ID, quantity }],
    success_url: `${origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    metadata: {
      userId,
      orgId: orgId ?? "",
      type: "workspace_addon",
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
