// packages/crm/src/lib/auth/app-host-redirect.ts
//
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
//
// 2026-07-15 — extracted from (auth)/signup/page.tsx so /record can pin to the
// app host with the SAME policy (claim-flow origin fix — a www-recorded session
// could never see the app-host login, and the compile POST 401'd; see
// docs/superpowers/specs/2026-07-15-claim-flow-origin-fix-design.md).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAppOrigin } from "@/lib/marketplace/buy-box-auth";

export function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isExemptHost(host: string) {
  return (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app")
  );
}

/** Pure core — null means "already in the right place / exempt, don't redirect". */
export function resolveAppHostRedirectTarget(input: {
  requestHost: string;
  appOrigin: string;
  path: string;
  search: string;
}): string | null {
  const requestHost = normalizeHost(input.requestHost);
  if (isExemptHost(requestHost)) return null;
  const appHost = normalizeHost(new URL(input.appOrigin).host);
  if (requestHost === appHost) return null;
  return `${input.appOrigin}${input.path}${input.search}`;
}

export async function redirectToAppHostIfNeeded(path: string, search: string) {
  const requestHost = (await headers()).get("host") ?? "";
  const target = resolveAppHostRedirectTarget({
    requestHost,
    appOrigin: resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL),
    path,
    search,
  });
  if (target) redirect(target);
}
