// packages/crm/src/app/(auth)/signup/billing/page.tsx
//
// 2026-05-22 — Step 2 of the new two-step signup. The marketing FAQ +
// /pricing FAQ both claim "we ask for a card at sign-up so future
// upgrades are one click and you can build live workspaces without
// artificial trial limits". This page is what makes that claim true.
//
// Flow recap (from /signup → here):
//   /signup → form submit → magic-link email → user clicks link →
//   NextAuth callback creates session → redirects to
//   /signup/billing?next=/clients/new?url=https://... (with the
//   visitor's original prompt baked into ?next=).
//
// This page:
//   - Auth-gates. No session → bounce to /signup.
//   - Provisions a Stripe SetupIntent (creates customer if needed,
//     writes back users.stripe_customer_id).
//   - Renders <SignupCardForm> with the Stripe Elements PaymentElement.
//   - If Stripe is not configured in this environment (no
//     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY or no STRIPE_SECRET_KEY),
//     falls through to a skip-card path so dev/local envs aren't
//     blocked. The skip is logged so prod can alarm if it ever fires.
//
// The next= query param survives the round trip via sanitizeNextPath
// (open-redirect-safe) — eventual landing is /clients/new with the
// original ?url= / ?biz= / ?intent= intact.

import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { provisionSetupIntent } from "@/lib/billing/setup-intent";
import { sanitizeNextPath } from "@/lib/auth/signup-redirect";

import { SignupCardForm } from "./signup-card-form";
import { skipSignupCardAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignupBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Visitor reached /signup/billing without a session — back to
    // /signup so they can start over with their email.
    redirect("/signup");
  }

  const params = await searchParams;
  const next = sanitizeNextPath(params.next);

  // Provision the SetupIntent server-side so the client mounts with
  // clientSecret in hand — no extra round trip on first paint.
  const setup = await provisionSetupIntent(session.user.id);

  // Two reasons we'd fall through to skip-card:
  //   - not_configured: env keys missing (local dev without Stripe).
  //   - stripe_error: transient failure provisioning. We surface a
  //     skip button so the user isn't stuck.
  const showSkipFallback = !setup.ok;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-text-secondary))]">
          Step 2 of 2
        </p>
        <h1 className="text-section-title text-foreground">Save a card on file</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          We&apos;ll never charge your card while you stay on Free.
          When you upgrade later, it&apos;s one click — no card-entry friction.
        </p>
      </div>

      {setup.ok ? (
        <SignupCardForm
          publishableKey={setup.data.publishableKey}
          clientSecret={setup.data.clientSecret}
          next={next}
        />
      ) : (
        // Fallback — Stripe not configured OR provisioning failed.
        // The skip-card path keeps the visitor moving; we log the
        // skip on the server so we can spot environments that need
        // Stripe wired up.
        <form action={skipSignupCardAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div
            role="alert"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            Card collection is temporarily unavailable. You can continue and
            add a card later from <Link href="/settings/billing" className="underline">Settings &rarr; Billing</Link>.
          </div>
          <button type="submit" className="crm-button-primary h-10 w-full px-4">
            Continue without saving a card
          </button>
        </form>
      )}

      {/* Quiet escape hatch when Stripe IS available — visitors who
          really don't want to save a card can still proceed. Surfaced
          as a secondary link so it doesn't steal attention from the
          primary card-save flow. */}
      {setup.ok ? (
        <form action={skipSignupCardAction} className="text-center">
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="text-xs text-[hsl(var(--color-text-secondary))] underline-offset-4 hover:underline"
          >
            Skip for now — add a card later
          </button>
        </form>
      ) : null}

      <footer className="border-t border-border pt-4 text-xs text-[hsl(var(--color-text-secondary))]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          <span className="ml-auto">&copy; 2026 SeldonFrame</span>
        </div>
      </footer>
    </div>
  );
}
