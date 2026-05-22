// packages/crm/src/app/(auth)/signup/page.tsx
//
// 2026-05-22 — Reads the ?url= / ?biz= / ?intent=build query params the
// marketing hero forwards, then routes them through the two-step
// signup flow:
//
//   /signup?url=https://acme.com&intent=build
//     → magic-link → /signup/billing?next=/clients/new?url=...&intent=build
//     → card confirm → /clients/new?url=...&intent=build (auto-submits)
//
// The form's hidden `redirectTo` field carries the eventual destination
// so the magic-link callback lands the visitor on /signup/billing
// without dropping the original prompt. The card-collection step is
// what closes the credibility gap between the marketing FAQ promise
// ("we ask for a card at sign-up so future upgrades are one click")
// and the previous email-only signup.

import { SignupForm } from "./signup-form";
import Link from "next/link";
import { buildSignupBillingRedirect } from "@/lib/auth/signup-redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    url?: string;
    biz?: string;
    intent?: string;
  }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  // Build the post-magic-link redirectTo. Three cases:
  //   1. Token-claim flow (visitor came via a claim invite) — preserve
  //      the existing /claim?token=... destination unchanged. Bypasses
  //      the card-collection step because claim flows have their own
  //      pricing UX on the post-claim screen.
  //   2. Prompt-driven signup (?url= or ?biz= present) — route through
  //      /signup/billing so the card collection step runs, then land on
  //      /clients/new with the prefill + auto-submit signal.
  //   3. Bare /signup — also route through /signup/billing so the FAQ
  //      claim "card at signup" stays accurate for every signup path.
  let redirectTo: string;
  if (token) {
    redirectTo = `/claim?token=${encodeURIComponent(token)}`;
  } else {
    redirectTo = buildSignupBillingRedirect({
      url: typeof params.url === "string" ? params.url : null,
      biz: typeof params.biz === "string" ? params.biz : null,
      intent: typeof params.intent === "string" ? params.intent : null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-section-title text-foreground">Welcome to SeldonFrame</h1>
          <p className="mt-1 text-label text-[hsl(var(--color-text-secondary))]">
            One Soul powering every block in your business.
          </p>
        </div>
        <SignupForm redirectTo={redirectTo} />
      </div>

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
