// packages/crm/src/app/(auth)/signup/page.tsx
//
// 2026-05-22 — Reads the ?url= / ?biz= / ?intent=build query params the
// marketing hero forwards, then routes them through the two-step
// signup flow:
//
//   /signup?url=https://acme.com&intent=build
//     → magic-link → /signup/connect-ai?next=/clients/new?url=...&intent=build
//     → key save → /clients/new?url=...&intent=build (auto-submits)
//
// The form's hidden `redirectTo` field carries the eventual destination
// so the magic-link callback lands the visitor on /signup/connect-ai
// without dropping the original prompt.
//
// 2026-05-27 — Step 2/2 moved from /signup/billing (card capture) to
// /signup/connect-ai (Anthropic BYOK). Card capture was a 100% drop-off
// wall in early telemetry (0/12 real signups in 3.5d). The new step is
// far more achievable AND directly unblocks the next action (/clients/new
// extraction requires the operator's key), so the gate stops being
// "optional friction the user can't see value in" and becomes "the thing
// they need to do their first build". Card capture still lives at
// /signup/billing and is reached via the over-limit upgrade prompt.

import { SignupForm } from "./signup-form";
import Link from "next/link";
import { buildSignupConnectAiRedirect } from "@/lib/auth/signup-redirect";

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
  //      the BYOK step because claim flows attach the new user to an
  //      existing agency org which inherits the agency operator's key.
  //   2. Prompt-driven signup (?url= or ?biz= present) — route through
  //      /signup/connect-ai so the BYOK step runs, then land on
  //      /clients/new with the prefill + auto-submit signal.
  //   3. Bare /signup — also route through /signup/connect-ai. /clients/new
  //      requires the operator's Anthropic key to extract a workspace, so
  //      gating signup on the key is the cheapest way to avoid the
  //      mid-build "needs_byok" prompt that strands visitors who don't
  //      know what to do next.
  let redirectTo: string;
  if (token) {
    redirectTo = `/claim?token=${encodeURIComponent(token)}`;
  } else {
    redirectTo = buildSignupConnectAiRedirect({
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
