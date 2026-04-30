import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  isAllowedCheckoutPriceId,
  isSelfServiceCheckoutPriceId,
} from "@/lib/billing/price-ids";
import {
  buildCheckoutLineItemsForTier,
  tierFromBasePriceId,
} from "@/lib/billing/checkout-items";
import type { TierId } from "@/lib/billing/plans";

function normalizeReturnPath(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed;
}

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

  const body = (await req.json().catch(() => ({}))) as {
    quantity?: unknown;
    successPath?: unknown;
    cancelPath?: unknown;
    priceId?: unknown;
    /** New (April 30, 2026): direct tier selection. Preferred over
     *  priceId so the multi-price (base + metered) item array is
     *  assembled server-side from a single source of truth. */
    tier?: unknown;
    workspaceId?: unknown;
    /** Lookup keys are how the marketing /pricing page identifies a
     *  tier (e.g. "growth_monthly", "scale_monthly"). Server-side we
     *  resolve them to the corresponding tier id. */
    billingPeriod?: unknown;
  };
  const quantity = typeof body.quantity === "number" ? body.quantity : 1;
  const successPath = normalizeReturnPath(body.successPath, "/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}");
  const cancelPath = normalizeReturnPath(body.cancelPath, "/pricing");
  const requestedPriceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
  const rawTier = typeof body.tier === "string" ? body.tier.trim().toLowerCase() : "";
  const lookupKey = typeof body.billingPeriod === "string" ? body.billingPeriod.trim().toLowerCase() : "";

  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }

  if (requestedPriceId && !isAllowedCheckoutPriceId(requestedPriceId)) {
    return NextResponse.json({ error: "Unsupported priceId." }, { status: 400 });
  }

  // Resolve the target tier. Three paths, in order of precedence:
  //   1. Explicit `tier: "growth" | "scale"` body field (preferred —
  //      the marketing page's new pricing buttons send this).
  //   2. Marketing lookup_key like "growth_monthly" / "scale_monthly".
  //   3. priceId derived from the legacy starter / cloud_pro / agency
  //      payloads still floating around (mapped via tierFromBasePriceId
  //      with legacy ids accepted as growth/scale per migration).
  let targetTier: TierId | null = null;
  if (rawTier === "growth" || rawTier === "scale") {
    targetTier = rawTier;
  } else if (lookupKey === "growth_monthly" || lookupKey === "growth_yearly") {
    targetTier = "growth";
  } else if (lookupKey === "scale_monthly" || lookupKey === "scale_yearly") {
    targetTier = "scale";
  } else if (requestedPriceId === GROWTH_BASE_PRICE_ID) {
    targetTier = "growth";
  } else if (requestedPriceId === SCALE_BASE_PRICE_ID) {
    targetTier = "scale";
  } else if (requestedPriceId) {
    // Legacy ids (Cloud Starter / Pro / Agency) — server-side
    // grandfather them to the closest new tier so existing checkout
    // links still work for one cycle of marketing emails.
    targetTier = tierFromBasePriceId(requestedPriceId);
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
  const requestedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  const targetWorkspaceId = requestedWorkspaceId || orgId || "";

  // Resolve the line items + checkout type.
  let lineItems: Array<{ price: string; quantity?: 1 }>;
  let basePriceId: string;
  let checkoutType: "self_service_workspace" | "workspace_addon";

  if (targetTier === "growth" || targetTier === "scale") {
    const tierItems = buildCheckoutLineItemsForTier(targetTier);
    if (!tierItems || tierItems.length === 0) {
      return NextResponse.json(
        { error: `No checkout items configured for tier '${targetTier}'.` },
        { status: 500 }
      );
    }
    lineItems = tierItems;
    basePriceId = tierItems[0].price;
    checkoutType = "self_service_workspace";
  } else {
    // Fallback: legacy single-price subscription (workspace add-on).
    // Used by old links that explicitly request the addon price id.
    const resolvedPriceId = requestedPriceId || WORKSPACE_ADDON_MONTHLY_PRICE_ID;
    lineItems = [{ price: resolvedPriceId, quantity: 1 }];
    basePriceId = resolvedPriceId;
    checkoutType = isSelfServiceCheckoutPriceId(resolvedPriceId)
      ? "self_service_workspace"
      : "workspace_addon";
  }

  // Self-service tiers are bound to a specific workspace. Only the
  // legacy workspace-addon price doesn't require a workspaceId.
  if (checkoutType === "self_service_workspace" && !targetWorkspaceId) {
    return NextResponse.json({ error: "workspaceId is required for self-service tiers." }, { status: 400 });
  }

  // Honor the legacy `quantity` request only on the workspace-addon
  // path. Multi-price tier subscriptions never use quantity (metered
  // lines must omit it; the base flat line is already 1).
  if (checkoutType === "workspace_addon" && quantity > 1) {
    lineItems = [{ price: basePriceId, quantity: 1 }];
    // (We previously honored quantity here for the per-seat add-on;
    // the new pricing model has no per-seat surface so we collapse
    // to 1. Operators that still hold legacy add-on subscriptions
    // can adjust quantity via the Stripe Billing portal.)
  }

  const origin = getRequestOrigin(req);

  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: dbUser.email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    client_reference_id: userId,
    line_items: lineItems,
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
    metadata: {
      seldonframe_user_id: userId,
      userId,
      orgId: orgId ?? "",
      workspaceId: targetWorkspaceId,
      tier: targetTier ?? "",
      priceId: basePriceId,
      type: checkoutType,
    },
    subscription_data: {
      metadata: {
        seldonframe_user_id: userId,
        userId,
        orgId: orgId ?? "",
        workspaceId: targetWorkspaceId,
        tier: targetTier ?? "",
        priceId: basePriceId,
        type: checkoutType,
      },
    },
  });

  return NextResponse.json({ url: checkoutSession.url, tier: targetTier });
}
