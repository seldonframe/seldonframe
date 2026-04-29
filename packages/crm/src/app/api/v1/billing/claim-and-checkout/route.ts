import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";
import { db } from "@/db";
import { users } from "@/db/schema";
import { resolveAdminTokenContext } from "@/lib/auth/admin-token";
import { claimAnonymousWorkspaceForEmail } from "@/lib/billing/orgs";
import {
  isAllowedCheckoutPriceId,
} from "@/lib/billing/price-ids";

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
  priceId?: unknown;
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
  const successPath = normalizeReturnPath(
    body.successPath,
    "/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}"
  );
  const cancelPath = normalizeReturnPath(body.cancelPath, "/settings/billing");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!priceId || !isAllowedCheckoutPriceId(priceId)) {
    return NextResponse.json({ error: "A supported priceId is required." }, { status: 400 });
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

  // Step 2 — claim the workspace.
  const claim = await claimAnonymousWorkspaceForEmail(adminCtx.orgId, email, name);
  if (!claim.ok) {
    if (claim.reason === "email_taken") {
      return NextResponse.json(
        {
          error:
            "An account already exists with that email. Sign in at /login and manage your subscription from there.",
          code: "email_taken",
        },
        { status: 409 }
      );
    }
    if (claim.reason === "workspace_already_claimed") {
      return NextResponse.json(
        {
          error:
            "This workspace is already attached to an account. Sign in to manage its subscription.",
          code: "workspace_already_claimed",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  // Step 3 — create the Stripe Checkout session referencing the new user.
  const [newUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, claim.userId))
    .limit(1);

  if (!newUser) {
    // Should never happen — we just inserted them. Defensive.
    return NextResponse.json({ error: "Could not load new user." }, { status: 500 });
  }

  const origin = getRequestOrigin(req);
  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: newUser.email,
    mode: "subscription",
    payment_method_types: ["card"],
    client_reference_id: newUser.id,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
    metadata: {
      seldonframe_user_id: newUser.id,
      userId: newUser.id,
      orgId: adminCtx.orgId,
      workspaceId: adminCtx.orgId,
      priceId,
      type: "self_service_workspace",
      claim_flow: "admin_token_upgrade",
    },
    subscription_data: {
      metadata: {
        seldonframe_user_id: newUser.id,
        userId: newUser.id,
        orgId: adminCtx.orgId,
        workspaceId: adminCtx.orgId,
        priceId,
        type: "self_service_workspace",
        claim_flow: "admin_token_upgrade",
      },
    },
  });

  return NextResponse.json({
    ok: true,
    url: checkoutSession.url,
    user: { id: newUser.id, email: newUser.email },
  });
}
