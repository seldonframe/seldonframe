// packages/crm/src/app/(auth)/signup/page.tsx
//
// 2026-05-22 — Reads the ?url= / ?biz= / ?intent=build query params the
// marketing hero forwards, then routes the new account straight to the
// build screen:
//
//   /signup?url=https://acme.com&intent=build
//     → magic-link → /clients/new?url=...&intent=build (auto-submits)
//
// The form's hidden `redirectTo` field carries the eventual destination
// so the magic-link callback lands the visitor on /clients/new without
// dropping the original prompt.
//
// 2026-06-22 — Removed the forced /signup/connect-ai (Anthropic BYOK)
// stop from the first-run path. New accounts build their first workspace
// on the SeldonFrame platform key, so the key step is now skippable: we
// land brand-new operators directly on /clients/new instead of detouring
// through the (optional) key page. /signup/connect-ai is still reachable
// for operators who want to add their own key up front — it's just no
// longer a counted step in the forced onboarding arc.
//
// History: the step here was previously /signup/connect-ai (Anthropic
// BYOK, 2026-05-27), which itself replaced /signup/billing (card capture)
// after card capture proved a 100% drop-off wall (0/12 real signups in
// 3.5d). Card capture still lives at /signup/billing and is reached via
// the over-limit upgrade prompt.

import { SignupForm } from "./signup-form";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildSignupNextPath, toInternalRedirectPath } from "@/lib/auth/signup-redirect";
import { isGoogleAuthEnabled } from "@/lib/auth/google-enabled";
import { isDemoReadonly } from "@/lib/demo/server";
import { resolveAppOrigin } from "@/lib/marketplace/buy-box-auth";

// 2026-07-04 — Prod incident: Google OAuth failed with
// `InvalidCheck: pkceCodeVerifier value could not be parsed` because sign-in
// was INITIATED on the marketing host (www.seldonframe.com — the /try → Save
// → /signup flow renders there). NextAuth's pkce/state cookies are HOST-ONLY
// (no cookies.domain override in authConfig — see the PKCE-cookie note in
// lib/auth/signup-redirect.ts), so they're set on www but Google calls back
// to app.seldonframe.com/api/auth/callback/google, where those cookies don't
// exist (log-confirmed: `callback pkce cookie { present:false }`,
// `hasState:false`). Email magic-link is unaffected (token travels in the
// URL, not a cookie). Fix: pin this page to the app host with a
// server-side redirect BEFORE any auth cookie gets set, preserving the full
// query string (callbackUrl carries the /claim-build token round-trip).
// Local dev and Vercel preview hosts are exempt so those flows are unchanged.
function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

function isExemptHost(host: string) {
  return (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app")
  );
}

async function redirectToAppHostIfNeeded(path: string, search: string) {
  const requestHost = normalizeHost((await headers()).get("host") ?? "");
  if (isExemptHost(requestHost)) return;

  const appOrigin = resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const appHost = normalizeHost(new URL(appOrigin).host);
  if (requestHost === appHost) return;

  redirect(`${appOrigin}${path}${search}`);
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    url?: string;
    biz?: string;
    intent?: string;
    // Marketplace buy intent: the buy box (or the /login → "Start for free"
    // link) forwards the agent listing here as ?callbackUrl=. When it resolves
    // to a safe same-origin path it WINS over the default /clients/new redirect,
    // so a brand-new signup returns to the agent they were buying.
    callbackUrl?: string;
  }>;
}) {
  const params = await searchParams;

  // Rebuild the full query string from the parsed searchParams so every
  // param (token/url/biz/intent/callbackUrl) survives the cross-host bounce.
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
  }
  const search = qs.toString() ? `?${qs.toString()}` : "";
  await redirectToAppHostIfNeeded("/signup", search);

  const token = typeof params.token === "string" ? params.token : "";
  // null when absent/unsafe (never an open redirect).
  const buyIntentRedirect = toInternalRedirectPath(params.callbackUrl);

  // Build the post-magic-link redirectTo. Two cases:
  //   1. Token-claim flow (visitor came via a claim invite) — preserve
  //      the existing /claim?token=... destination unchanged. Claim flows
  //      attach the new user to an existing agency org which inherits the
  //      agency operator's key.
  //   2. Everything else (prompt-driven ?url=/?biz= OR bare /signup) —
  //      route STRAIGHT to /clients/new with the prefill + auto-submit
  //      signal. The Anthropic-key step (/signup/connect-ai) is no longer
  //      a forced stop: a brand-new account builds its first workspace on
  //      the platform key, so we land them directly on the build screen
  //      instead of detouring through the (now optional) key page. Users
  //      who DO want to add their own key first can still reach
  //      /signup/connect-ai via its link; it's just not in the forced path.
  let redirectTo: string;
  if (token) {
    redirectTo = `/claim?token=${encodeURIComponent(token)}`;
  } else if (buyIntentRedirect) {
    // Marketplace buy intent wins over the default build-flow landing: send the
    // new account straight back to the agent listing (with ?install=1) so they
    // can finish checkout. Safe + same-origin (toInternalRedirectPath).
    redirectTo = buyIntentRedirect;
  } else {
    redirectTo = buildSignupNextPath({
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
            Your website, booking, CRM, and AI receptionist — live in minutes.
          </p>
        </div>
        <SignupForm
          redirectTo={redirectTo}
          googleEnabled={
            isGoogleAuthEnabled({
              GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
              GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
            }) && !isDemoReadonly()
          }
          // demo-readonly: hide Google — assertWritable would reject the action with a raw error boundary (review 2026-07-04)
        />
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
