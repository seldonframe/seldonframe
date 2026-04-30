import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { resolveAdminTokenContext } from "@/lib/auth/admin-token";
import { claimAnonymousWorkspaceForEmail } from "@/lib/billing/orgs";
import {
  isAllowedCheckoutPriceId,
} from "@/lib/billing/price-ids";
import {
  buildCheckoutLineItemsForTier,
  tierFromBasePriceId,
} from "@/lib/billing/checkout-items";
import type { TierId } from "@/lib/billing/plans";

/**
 * POST /api/v1/billing/claim-and-checkout
 *
 * P0-2 launch blocker fix. Lets a guest (admin-token) operator upgrade
 * to a paid plan without signing up first via the normal /signup form.
 *
 * The flow:
 *   1. Operator on `/settings/billing` sees a "Claim + Upgrade" form
 *      (only if they're on an admin-token session, see billing/page.tsx)
 *   2. Submits email + chosen plan price_id
 *   3. This route:
 *      a. Detects the admin-token cookie + resolves the workspace id
 *      b. Calls claimAnonymousWorkspaceForEmail(orgId, email):
 *         - inserts a `users` row with `orgId = workspaceId`
 *         - sets `organizations.ownerId = newUser.id`
 *      c. Creates a Stripe Checkout session referencing the new user
 *      d. Returns the checkout URL → client redirects
 *   4. Customer enters card on Stripe → webhook updates subscription
 *      tier on the org
 *   5. Operator returns to the dashboard fully claimed + paid
 *
 * Why this isn't just a tweak to /api/stripe/checkout:
 *   - That endpoint requires a real `users.id` already in the table
 *     and validates auth via NextAuth or `x-seldon-api-key`. Admin-
 *     token sessions have neither. We need a single transaction that
 *     creates the user FIRST, then creates the checkout session.
 *
 * Body shape: { email: string, name?: string, priceId: string }
 */

type Body = {
  email?: unknown;
  name?: unknown;
  /** Either a base price id (preferred — server derives tier) OR a
   *  raw `tier` string ("growth" | "scale"). Both are accepted so the
   *  client can pass whichever it has on hand without serialization
   *  drift between the marketing /pricing page and /settings/billing. */
  priceId?: unknown;
  tier?: unknown;
  successPath?: unknown;
  cancelPath?: unknown;
};

function normalizeReturnPath(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  return trimmed;
}

function getRequestOrigin(req: NextRequest) {
  try {
    return new URL(req.url).origin;
  } catch {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
}

export async function POST(req: NextRequest) {
  // Step 1 — must be on an admin-token session. Real signed-up users
  // hit /api/stripe/checkout instead.
  const adminCtx = await resolveAdminTokenContext();
  if (!adminCtx) {
    return NextResponse.json(
      {
        error:
          "This endpoint is for guest workspaces. Sign in and use /api/stripe/checkout if you already have an account.",
      },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
  const rawTier = typeof body.tier === "string" ? body.tier.trim().toLowerCase() : "";
  const successPath = normalizeReturnPath(
    body.successPath,
    "/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}"
  );
  const cancelPath = normalizeReturnPath(body.cancelPath, "/settings/billing");

  // Resolve the target tier: prefer an explicit `tier` body field;
  // fall back to deriving from `priceId`. Both must land on a known
  // paid tier (growth | scale).
  let targetTier: TierId | null = null;
  if (rawTier === "growth" || rawTier === "scale") {
    targetTier = rawTier;
  } else if (priceId) {
    targetTier = tierFromBasePriceId(priceId);
  }
  if (priceId && !isAllowedCheckoutPriceId(priceId)) {
    return NextResponse.json({ error: "Unsupported priceId." }, { status: 400 });
  }
  if (!targetTier) {
    return NextResponse.json(
      {
        error:
          "A supported tier is required. Pass { tier: 'growth' | 'scale' } or { priceId: <growth or scale base> }.",
      },
      { status: 400 }
    );
  }
  const lineItems = buildCheckoutLineItemsForTier(targetTier);
  if (!lineItems || lineItems.length === 0) {
    return NextResponse.json(
      { error: `No checkout items configured for tier '${targetTier}'.` },
      { status: 500 }
    );
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

  // Step 2 — resolve the user we'll attach to the Stripe Checkout
  // session. Two scenarios:
  //
  //   (a) Workspace already has an owner → admin-token bearer IS the
  //       proof of ownership for this endpoint. The bearer cookie was
  //       set by the C6 /admin/[workspaceId]?token=... route after
  //       validating the token against api_keys, so the operator
  //       holding it has the same authority as the email-bound owner.
  //       Reuse that owner's user.id regardless of the supplied
  //       email — this is the "owner re-enters the upgrade flow"
  //       path (Starter → Pro, aborted+resumed checkout, etc.).
  //       The supplied email becomes informational only.
  //
  //   (b) Workspace has no owner yet → first-time claim. We need a
  //       valid email to insert a `users` row. If the email is
  //       already taken by an unrelated account, we refuse (confused-
  //       deputy defense — same as before).
  //
  // Removing the email-must-match check from path (a) was the
  // post-launch fix the operator-journey audit asked for: requiring
  // the operator to remember which email they used to claim a
  // workspace just to upgrade it makes the admin-URL flow useless.
  let resolvedUser: { id: string; email: string | null } | null = null;
  let claimFlow: "admin_token_upgrade" | "owner_re_upgrade" =
    "admin_token_upgrade";

  const [orgRow] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, adminCtx.orgId))
    .limit(1);

  if (!orgRow) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (orgRow.ownerId) {
    // Path (a): existing owner. Admin token = ownership proof.
    const [existingOwner] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, orgRow.ownerId))
      .limit(1);

    if (!existingOwner) {
      return NextResponse.json(
        { error: "Workspace owner record missing." },
        { status: 500 }
      );
    }

    resolvedUser = existingOwner;
    claimFlow = "owner_re_upgrade";
  } else {
    // Path (b): first-time claim. Email is required.
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        {
          error: "A valid email is required to claim this workspace.",
          code: "email_required",
        },
        { status: 400 }
      );
    }

    const claim = await claimAnonymousWorkspaceForEmail(adminCtx.orgId, email, name);
    if (claim.ok) {
      const [created] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, claim.userId))
        .limit(1);
      if (!created) {
        return NextResponse.json({ error: "Could not load new user." }, { status: 500 });
      }
      resolvedUser = created;
    } else if (claim.reason === "email_taken") {
      return NextResponse.json(
        {
          error:
            "An account already exists with that email. Sign in at /login and manage your subscription from there.",
          code: "email_taken",
        },
        { status: 409 }
      );
    } else {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
  }

  if (!resolvedUser) {
    // Defensive: every above branch either assigns resolvedUser or
    // returns. If we somehow reach here with null, surface it loudly.
    return NextResponse.json(
      { error: "Could not resolve workspace owner for checkout." },
      { status: 500 }
    );
  }

  // Step 3 — create the Stripe Checkout session referencing the user.
  const checkoutUser = resolvedUser;
  const origin = getRequestOrigin(req);
  const basePriceId = lineItems[0].price; // for metadata + audit
  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: checkoutUser.email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    client_reference_id: checkoutUser.id,
    // Multi-price subscription: base flat price + (optional) metered
    // overage prices. See lib/billing/checkout-items.ts.
    line_items: lineItems,
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
    metadata: {
      seldonframe_user_id: checkoutUser.id,
      userId: checkoutUser.id,
      orgId: adminCtx.orgId,
      workspaceId: adminCtx.orgId,
      tier: targetTier,
      priceId: basePriceId,
      type: "self_service_workspace",
      claim_flow: claimFlow,
    },
    subscription_data: {
      metadata: {
        seldonframe_user_id: checkoutUser.id,
        userId: checkoutUser.id,
        orgId: adminCtx.orgId,
        workspaceId: adminCtx.orgId,
        tier: targetTier,
        priceId: basePriceId,
        type: "self_service_workspace",
        claim_flow: claimFlow,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    url: checkoutSession.url,
    user: { id: checkoutUser.id, email: checkoutUser.email },
    tier: targetTier,
    claim_flow: claimFlow,
  });
}
