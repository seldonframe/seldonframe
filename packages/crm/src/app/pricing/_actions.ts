// packages/crm/src/app/pricing/_actions.ts
//
// Server Actions for the /pricing page. Pulled into a separate file so the
// Client Component (pricing-picker.tsx) can import them — Next.js requires
// Server Actions consumed by Client Components to live in a file with a
// top-level "use server" directive.

"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import { provisionSetupIntent, type SetupIntentResult } from "@/lib/billing/setup-intent";

/**
 * Pick the Free tier in one click — NO card collected. Stamps
 * users.planId='free' (only if currently NULL) and redirects to
 * /dashboard. This is the fallback path when the embedded Stripe form
 * isn't available (no publishable key, unauthed user, etc.).
 *
 * Without this, the plain <Link href="/dashboard"> sent the user into an
 * infinite /dashboard ↔ /pricing loop because plan-gate.ts:74 sees
 * !planId and 307s back here.
 */
export async function selectFreeTierAction() {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  await db
    .update(users)
    .set({ planId: "free", updatedAt: new Date() })
    .where(and(eq(users.id, session.user.id), isNull(users.planId)));

  redirect("/dashboard");
}

/**
 * Called by the Client Component on mount to provision a Stripe
 * SetupIntent + return the publishable key. The client then loads
 * Stripe.js, mounts the PaymentElement, and lets the operator save a
 * card. See lib/billing/setup-intent.ts for the actual provisioning.
 *
 * Returns the SetupIntentResult discriminated union so the client can
 * branch on `ok: false` to render the fallback flow gracefully.
 */
export async function createSetupIntentAction(): Promise<SetupIntentResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "no_user" };
  }
  return provisionSetupIntent(session.user.id);
}

/**
 * Called from the Client Component after stripe.confirmSetup() succeeds.
 * Stamps planId='free' (idempotent, same as selectFreeTierAction) and
 * redirects to /dashboard. The card-on-file is already attached to the
 * Stripe Customer via the SetupIntent; future upgrade flows can read
 * users.stripeCustomerId and use the default PaymentMethod without
 * re-prompting.
 *
 * Separate from selectFreeTierAction because the path matters for
 * analytics — we want to know who entered card vs who skipped.
 */
export async function confirmFreeWithCardAction() {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  await db
    .update(users)
    .set({ planId: "free", updatedAt: new Date() })
    .where(and(eq(users.id, session.user.id), isNull(users.planId)));

  // Telemetry hook — useful when we wire pricing-page analytics. Logged
  // as a structured event so a future log search can attribute Free
  // signups to the embedded-card-on-file path vs the bare 1-click path.
  console.log(
    JSON.stringify({
      event: "pricing_free_with_card_confirmed",
      user_id: session.user.id,
    }),
  );

  redirect("/dashboard");
}
