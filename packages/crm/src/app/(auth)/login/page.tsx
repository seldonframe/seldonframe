import { LoginForm } from "./login-form";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toInternalRedirectPath } from "@/lib/auth/signup-redirect";
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

export default async function LoginPage({
  searchParams,
}: {
  // The public marketplace buy box sends a logged-out buyer here as
  // /login?callbackUrl=<absolute app-origin listing URL> (buildListingSignInUrl).
  // We read it, collapse it to a SAFE same-origin relative path, and thread it
  // into the form's hidden `redirectTo` so the magic-link round trip returns the
  // buyer to the agent listing instead of the default /clients/new. NextAuth
  // also forwards its own ?callbackUrl on the /login verifyRequest page, so this
  // param shape is already part of the auth surface.
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;

  // Rebuild the full query string from the parsed searchParams so callbackUrl
  // (and any other param) survives the cross-host bounce.
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
  }
  const search = qs.toString() ? `?${qs.toString()}` : "";
  await redirectToAppHostIfNeeded("/login", search);

  // null when absent/unsafe → form falls back to its own default redirect.
  const redirectTo = toInternalRedirectPath(params.callbackUrl);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-section-title text-foreground">Welcome to SeldonFrame</h1>
          <p className="mt-1 text-label text-[hsl(var(--color-text-secondary))]">
            The operating system for your business.
          </p>
        </div>
        <LoginForm
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
