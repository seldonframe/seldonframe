import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export const runtime = "nodejs";

// Creates a Stripe coupon + matching redeemable promotion code on the
// workspace's Connect account. Win-Back archetype needs per-contact
// unique codes; shared codes are vulnerable to abuse + lose attribution
// signal (can't tell which contact redeemed from the code alone).
//
// Shipped 2026-04-21 in the pre-7.c micro-slice per MCP gap audit v2.
// Routes charges through the SMB's connected Stripe, not the platform —
// matches the Phase 5 Connect Standard topology.

type CreateCouponBody = {
  percentOff?: unknown;
  percent_off?: unknown;
  amountOff?: unknown;
  amount_off?: unknown;
  currency?: unknown;
  duration?: unknown;
  durationInMonths?: unknown;
  duration_in_months?: unknown;
  name?: unknown;
  code?: unknown;
  maxRedemptions?: unknown;
  max_redemptions?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  // Relative-expiry alias computed at call time. Useful for archetype
  // templates that need to outlive any single synthesis — "14 days from
  // now" stays meaningful six months into agent deployment, whereas a
  // hardcoded expires_at baked at synthesis would already be stale.
  expiresInDays?: unknown;
  expires_in_days?: unknown;
};

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured on the platform" }, { status: 503 });
  }

  const [connection] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, guard.orgId), eq(stripeConnections.isActive, true)))
    .orderBy(desc(stripeConnections.connectedAt))
    .limit(1);
  if (!connection?.stripeAccountId) {
    return NextResponse.json(
      { error: "Workspace has no active Stripe Connect account. Complete onboarding at /settings/payments first." },
      { status: 422 },
    );
  }

  const body = (await request.json()) as CreateCouponBody;

  const percentOff = typeof body.percentOff === "number" ? body.percentOff : typeof body.percent_off === "number" ? body.percent_off : null;
  const amountOff = typeof body.amountOff === "number" ? body.amountOff : typeof body.amount_off === "number" ? body.amount_off : null;
  if (percentOff === null && amountOff === null) {
    return NextResponse.json({ error: "one of percent_off or amount_off is required" }, { status: 400 });
  }
  if (percentOff !== null && (percentOff <= 0 || percentOff > 100)) {
    return NextResponse.json({ error: "percent_off must be between 0 (exclusive) and 100 (inclusive)" }, { status: 400 });
  }

  const duration =
    body.duration === "forever" || body.duration === "once" || body.duration === "repeating"
      ? body.duration
      : "once";
  const durationInMonths = typeof body.durationInMonths === "number" ? body.durationInMonths : typeof body.duration_in_months === "number" ? body.duration_in_months : null;
  if (duration === "repeating" && (!durationInMonths || durationInMonths < 1)) {
    return NextResponse.json({ error: "duration='repeating' requires duration_in_months >= 1" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.slice(0, 60) : undefined;
  const providedCode = typeof body.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40) : null;
  const maxRedemptions = typeof body.maxRedemptions === "number" ? body.maxRedemptions : typeof body.max_redemptions === "number" ? body.max_redemptions : 1;
  const expiresAtRaw = typeof body.expiresAt === "string" ? body.expiresAt : typeof body.expires_at === "string" ? body.expires_at : null;
  const expiresInDaysRaw = typeof body.expiresInDays === "number" ? body.expiresInDays : typeof body.expires_in_days === "number" ? body.expires_in_days : null;
  let expiresAt: Date | null = expiresAtRaw ? new Date(expiresAtRaw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "expires_at must be a valid ISO timestamp" }, { status: 400 });
  }
  // Relative expiry wins if both are provided — it's the less
  // surprise-prone option for archetype templates that don't want to
  // bake stale timestamps at synthesis.
  if (expiresInDaysRaw !== null) {
    if (expiresInDaysRaw <= 0 || expiresInDaysRaw > 365) {
      return NextResponse.json({ error: "expires_in_days must be between 1 and 365" }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + expiresInDaysRaw * 24 * 60 * 60 * 1000);
  }

  try {
    const couponParams: Stripe.CouponCreateParams = {
      duration,
      name,
    };
    if (percentOff !== null) couponParams.percent_off = percentOff;
    if (amountOff !== null) {
      couponParams.amount_off = Math.round(amountOff * 100);
      couponParams.currency = typeof body.currency === "string" ? body.currency.toLowerCase() : "usd";
    }
    if (duration === "repeating" && durationInMonths !== null) {
      couponParams.duration_in_months = durationInMonths;
    }

    const coupon = await stripe.coupons.create(couponParams, { stripeAccount: connection.stripeAccountId });

    const promoParams: Stripe.PromotionCodeCreateParams = {
      coupon: coupon.id,
      max_redemptions: maxRedemptions,
    };
    if (providedCode) promoParams.code = providedCode;
    if (expiresAt) promoParams.expires_at = Math.floor(expiresAt.getTime() / 1000);

    const promotion = await stripe.promotionCodes.create(promoParams, { stripeAccount: connection.stripeAccountId });

    return NextResponse.json(
      {
        data: {
          couponId: coupon.id,
          promotionCodeId: promotion.id,
          code: promotion.code,
          percentOff: coupon.percent_off,
          amountOff: coupon.amount_off !== null && coupon.amount_off !== undefined ? coupon.amount_off / 100 : null,
          currency: coupon.currency ?? null,
          duration: coupon.duration,
          maxRedemptions: promotion.max_redemptions,
          expiresAt: promotion.expires_at ? new Date(promotion.expires_at * 1000).toISOString() : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coupon create failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
