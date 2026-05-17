// packages/crm/src/lib/billing/setup-intent.ts
//
// 2026-05-17 — Server-side SetupIntent provisioning for the embedded
// Stripe Payment Element on /pricing.
//
// Purpose: when an authenticated operator lands on /pricing with the Free
// tier selected, we render a Stripe Elements form so they can attach a
// card-on-file at signup time. That card is never charged on Free — it
// exists only so a future Growth/Scale upgrade is one click instead of
// re-entering payment details. Postiz uses the same pattern; we keep the
// $0/mo Free tier intact and just add the optional CC capture.
//
// What this helper does, idempotently:
//   1. Resolves the operator's Stripe Customer (creates one if the user
//      row has no stripeCustomerId yet, then writes the id back).
//   2. Creates a SetupIntent against that customer with
//      `usage: 'off_session'` so the saved PaymentMethod can be charged
//      later without re-authentication (3DS-friendly path).
//   3. Returns `{ clientSecret, publishableKey, customerId }` for the
//      client-side Elements provider.
//
// Why a separate file (not inlined in the Server Action):
//   - The same provisioning logic is also useful from /settings/billing
//     when we eventually add an inline "Update payment method" flow.
//   - Keeps the Server Action tiny + testable in isolation if we add
//     unit tests later.
//
// Env contract:
//   - STRIPE_SECRET_KEY (server) — already resolved by @seldonframe/payments
//   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (client) — must be set in Vercel
//     env for the embedded form to render. If absent, the caller should
//     fall back to the existing 1-click Free Server Action (no card
//     capture) — see pricing-picker.tsx.

import { eq } from "drizzle-orm";
import { getStripeClient } from "@seldonframe/payments";

import { db } from "@/db";
import { users } from "@/db/schema";

export type SetupIntentBundle = {
  clientSecret: string;
  publishableKey: string;
  customerId: string;
};

export type SetupIntentResult =
  | { ok: true; data: SetupIntentBundle }
  | { ok: false; reason: "not_configured" | "no_user" | "stripe_error"; detail?: string };

/**
 * Resolve the publishable key from env. Server-readable because
 * NEXT_PUBLIC_* vars are inlined at build time; we still read it
 * server-side here so the client-side hydration doesn't need to know
 * the env name (avoids accidental coupling).
 */
function resolvePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

/**
 * Get or create the Stripe Customer for this user. Writes the id back
 * to users.stripeCustomerId on first creation so subsequent calls hit
 * the cached value.
 */
async function getOrCreateStripeCustomer(args: {
  userId: string;
  email: string | null;
  existingCustomerId: string | null;
}): Promise<{ id: string } | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  // Reuse existing customer when present. Verify it still exists in Stripe
  // before trusting it — a manual deletion in the Stripe dashboard would
  // otherwise make every future SetupIntent fail with `resource_missing`.
  if (args.existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(args.existingCustomerId);
      if (!customer.deleted) {
        return { id: customer.id };
      }
      // Fall through to creating a new one — the stored id is stale.
    } catch (err) {
      // resource_missing or auth error — treat as if no customer exists.
      console.warn(
        JSON.stringify({
          event: "stripe_customer_retrieve_failed",
          customer_id: args.existingCustomerId,
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Create new customer + persist the id so future calls skip this branch.
  const created = await stripe.customers.create({
    email: args.email ?? undefined,
    metadata: { seldonframe_user_id: args.userId },
  });

  await db
    .update(users)
    .set({ stripeCustomerId: created.id, updatedAt: new Date() })
    .where(eq(users.id, args.userId));

  return { id: created.id };
}

/**
 * Provision a SetupIntent for the operator's pending card-on-file
 * collection. Caller is responsible for auth — this helper trusts that
 * `userId` is the signed-in user.
 */
export async function provisionSetupIntent(userId: string): Promise<SetupIntentResult> {
  const stripe = getStripeClient();
  const publishableKey = resolvePublishableKey();

  if (!stripe || !publishableKey) {
    return { ok: false, reason: "not_configured" };
  }

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser) {
    return { ok: false, reason: "no_user" };
  }

  let customer;
  try {
    customer = await getOrCreateStripeCustomer({
      userId: dbUser.id,
      email: dbUser.email,
      existingCustomerId: dbUser.stripeCustomerId,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "stripe_error",
      detail: err instanceof Error ? err.message : "Failed to provision customer",
    };
  }

  if (!customer) {
    return { ok: false, reason: "not_configured" };
  }

  let setupIntent;
  try {
    setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      // off_session lets us charge the saved card later (on Growth/Scale
      // upgrade) without forcing the operator through 3DS re-auth. Stripe
      // returns a stronger setup that satisfies the SCA mandate up front.
      usage: "off_session",
      metadata: {
        seldonframe_user_id: userId,
        flow: "pricing_card_on_file",
      },
    });
  } catch (err) {
    return {
      ok: false,
      reason: "stripe_error",
      detail: err instanceof Error ? err.message : "Failed to create SetupIntent",
    };
  }

  if (!setupIntent.client_secret) {
    return { ok: false, reason: "stripe_error", detail: "SetupIntent missing client_secret" };
  }

  return {
    ok: true,
    data: {
      clientSecret: setupIntent.client_secret,
      publishableKey,
      customerId: customer.id,
    },
  };
}
