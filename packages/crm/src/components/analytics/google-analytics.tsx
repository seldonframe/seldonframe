// v1.40.14 — Google Analytics integration (gtag.js).
//
// Renders the gtag script + init code, but ONLY on allowed hosts.
// This single Next.js app serves three surfaces:
//   1. seldonframe.com (marketing site) → track ✅
//   2. app.seldonframe.com (operator dashboard) → track ✅
//   3. <operator-slug>.app.seldonframe.com (workspace subdomains) → NEVER track ❌
//
// Why workspaces are off-limits: those subdomains serve THE OPERATOR'S
// customers, not ours. Collecting their browsing data under SeldonFrame's
// measurement ID would (a) violate Google's TOS, (b) be ethically wrong
// (we'd be aggregating data across thousands of unrelated businesses'
// customers without their consent), and (c) confuse operator GA setups
// (some operators will paste their own GA tag — we don't want a double
// hit). Per-workspace operator-owned GA is a separate product feature
// (operator pastes their own measurement ID in workspace settings; we
// inject their tag, not ours).
//
// The host allowlist is the safety mechanism. Anything not in the list
// (preview deploys, workspace subdomains, dev environments) gets no
// GA injection.

import Script from "next/script";

interface GoogleAnalyticsProps {
  measurementId: string;
}

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}');
        `}
      </Script>
    </>
  );
}

/**
 * Allowed hosts for GA injection. Add new SeldonFrame-owned hostnames
 * here. DO NOT add operator workspace subdomain patterns
 * (`*.app.seldonframe.com` with a wildcard) — that defeats the
 * privacy boundary.
 */
const GA_ALLOWED_HOSTS = new Set<string>([
  "seldonframe.com",
  "www.seldonframe.com",
  "app.seldonframe.com",
  // Add staging hosts here if/when we have them, e.g.:
  // "staging.seldonframe.com",
  // "preview.seldonframe.com",
]);

/**
 * Decide whether to inject GA based on the request host. Called from
 * the root layout server-side (via next/headers).
 *
 * Returns false (no GA) for:
 *  - Workspace subdomains (e.g. phoenix-ac-...app.seldonframe.com)
 *  - Vercel preview deploys (*.vercel.app)
 *  - localhost / dev
 *  - Any host not explicitly in the allowlist
 */
export function shouldRenderGoogleAnalytics(host: string): boolean {
  // Strip port (host can be "seldonframe.com:443" or similar).
  const cleanHost = host.split(":")[0].toLowerCase();
  return GA_ALLOWED_HOSTS.has(cleanHost);
}
