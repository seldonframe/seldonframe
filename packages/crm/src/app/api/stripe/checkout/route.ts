import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  isAllowedCheckoutPriceId,
  isSelfServiceCheckoutPriceId,
  isPlaceholderPriceId,
} from "@/lib/billing/price-ids";
import {
  buildCheckoutSessionParams,
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

  // Resolve the target tier (builder / workspace / agency). Paths in
  // order of precedence:
  //   1. Explicit `tier` body field (the new pricing buttons send this).
  //      Legacy "growth"/"scale" are accepted and remapped.
  //   2. Marketing lookup_key (e.g. "workspace_monthly", legacy
  //      "growth_monthly").
  //   3. priceId — new base ids directly, or legacy Growth/Scale/Cloud
  //      base ids grandfathered to workspace/agency.
  let targetTier: TierId | null = null;
  if (rawTier === "builder" || rawTier === "workspace" || rawTier === "agency") {
    targetTier = rawTier;
  } else if (rawTier === "growth") {
    targetTier = "workspace";
  } else if (rawTier === "scale") {
    targetTier = "agency";
  } else if (lookupKey === "builder_monthly" || lookupKey === "builder_yearly") {
    targetTier = "builder";
  } else if (
    lookupKey === "workspace_monthly" ||
    lookupKey === "workspace_yearly" ||
    lookupKey === "growth_monthly" ||
    lookupKey === "growth_yearly"
  ) {
    targetTier = "workspace";
  } else if (
    lookupKey === "agency_monthly" ||
    lookupKey === "agency_yearly" ||
    lookupKey === "scale_monthly" ||
    lookupKey === "scale_yearly"
  ) {
    targetTier = "agency";
  } else if (requestedPriceId === BUILDER_PRICE_ID) {
    targetTier = "builder";
  } else if (requestedPriceId === WORKSPACE_PRICE_ID || requestedPriceId === GROWTH_BASE_PRICE_ID) {
    targetTier = "workspace";
  } else if (requestedPriceId === AGENCY_BASE_PRICE_ID || requestedPriceId === SCALE_BASE_PRICE_ID) {
    targetTier = "agency";
  } else if (requestedPriceId) {
    // Legacy Cloud Starter / Pro / Agency ids → closest new tier.
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

  const origin = getRequestOrigin(req);

  // ── Tier path (Builder / Workspace / Agency) ────────────────────────
  // The self-service tiers go through the pure session-params builder so
  // the payment-critical metadata (orgId + tier on BOTH the session and
  // subscription_data — the Phase 2 webhook contract) is assembled from
  // a single, unit-tested source of truth.
  if (targetTier) {
    // Self-service tiers are bound to a specific workspace.
    if (!targetWorkspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required for self-service tiers." },
        { status: 400 }
      );
    }

    const params = buildCheckoutSessionParams({
      tier: targetTier,
      userId,
      orgId: orgId ?? "",
      workspaceId: targetWorkspaceId,
      customerEmail: dbUser.email,
      origin,
      successPath,
      cancelPath,
    });

    if (!params) {
      return NextResponse.json(
        { error: `No checkout items configured for tier '${targetTier}'.` },
        { status: 500 }
      );
    }

    // Hotfix H4b — fail soft when the resolved base price is still the
    // unconfigured placeholder (Stripe would otherwise reject it with a raw
    // "No such price" 500). Never call Stripe with a placeholder id.
    const unconfiguredPrice = params.line_items.find((item) => isPlaceholderPriceId(item.price));
    if (unconfiguredPrice) {
      console.error(
        "[stripe/checkout] STRIPE_WORKSPACE_PRICE_ID is not set — checkout blocked on placeholder price id."
      );
      return NextResponse.json(
        { error: "Checkout isn't configured yet. Please try again soon." },
        { status: 503 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      ...params,
      payment_method_types: ["card"],
      // 14-day free trial on the PLATFORM subscription (SF billing the
      // customer their own $29). Merge — don't clobber the metadata that
      // buildCheckoutSessionParams stamped on subscription_data (the
      // Phase 2 webhook contract). NOTE: this is SF's own platform
      // subscription, NOT a connected account — it carries NO GMV
      // application fee.
      subscription_data: {
        ...params.subscription_data,
        trial_period_days: 14,
      },
    });

    return NextResponse.json({ url: checkoutSession.url, tier: targetTier });
  }

  // ── Legacy fallback: single-price subscription (workspace add-on) ────
  // Used only by old links that explicitly request the add-on price id.
  // The new pricing model never lands here.
  const resolvedPriceId = requestedPriceId || WORKSPACE_ADDON_MONTHLY_PRICE_ID;
  const checkoutType: "self_service_workspace" | "workspace_addon" =
    isSelfServiceCheckoutPriceId(resolvedPriceId)
      ? "self_service_workspace"
      : "workspace_addon";

  if (checkoutType === "self_service_workspace" && !targetWorkspaceId) {
    return NextResponse.json({ error: "workspaceId is required for self-service tiers." }, { status: 400 });
  }

  // The per-seat add-on has no surface in the new pricing model; the
  // legacy `quantity` body field (still range-validated above) is
  // collapsed to 1 here. Operators on a legacy add-on can adjust quantity
  // via the Stripe Billing portal.
  // Hotfix H4b — same placeholder guard as the tier path above; the legacy
  // fallback can also resolve to an unconfigured "price_PLACEHOLDER_*" id
  // when no explicit priceId was requested.
  if (isPlaceholderPriceId(resolvedPriceId)) {
    console.error(
      "[stripe/checkout] STRIPE_WORKSPACE_PRICE_ID is not set — checkout blocked on placeholder price id."
    );
    return NextResponse.json(
      { error: "Checkout isn't configured yet. Please try again soon." },
      { status: 503 }
    );
  }

  const lineItems = [{ price: resolvedPriceId, quantity: 1 as const }];

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
      tier: "",
      priceId: resolvedPriceId,
      type: checkoutType,
    },
    subscription_data: {
      metadata: {
        seldonframe_user_id: userId,
        userId,
        orgId: orgId ?? "",
        workspaceId: targetWorkspaceId,
        tier: "",
        priceId: resolvedPriceId,
        type: checkoutType,
      },
    },
  });

  return NextResponse.json({ url: checkoutSession.url, tier: targetTier });
}
