/**
 * Explicit Sec-Fetch-Site assertion for the /oauth/authorize consent POST.
 *
 * 2026-07-03 — security review finding: the consent POST previously relied
 * ONLY on the NextAuth session cookie's SameSite=Lax attribute to block
 * cross-site submission (a SameSite=Lax cookie is still sent on top-level
 * navigations, which covers simple `<form method=post>` cross-site posts in
 * some browser configurations, but the protection is implicit and would
 * silently disappear if the cookie's SameSite policy ever changed). This
 * helper makes that assumption an explicit, independently-checked gate.
 *
 * Fetch Metadata (`Sec-Fetch-Site`) is sent by all modern browsers and
 * cannot be set by the requesting page's JS, so it is a reliable signal of
 * the request's origin relative to the current page. Semantics:
 *   - "same-origin": a same-origin form POST (normal consent-approve flow).
 *   - "none": the browser attached no value — covers direct address-bar
 *     navigations and similar user-initiated top-level requests.
 *   - Header ABSENT entirely: older browsers / non-browser clients / unit
 *     tests that don't set it — allowed, to preserve current behavior for
 *     these legitimate callers.
 *   - Anything else ("cross-site", "same-site") means the POST originated
 *     from a different page than /oauth/authorize itself — reject before
 *     any other processing.
 */
export function isAllowedAuthorizeFetchSite(secFetchSite: string | null): boolean {
  if (secFetchSite === null) return true; // header absent — preserve prior behavior
  return secFetchSite === "same-origin" || secFetchSite === "none";
}
