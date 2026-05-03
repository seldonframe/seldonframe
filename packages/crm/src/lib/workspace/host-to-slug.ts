// ============================================================================
// v1.3.5 — host → workspace-slug derivation (shared helper)
// ============================================================================
//
// May 3, 2026. The Iron & Oak Barbershop test surfaced a 400 on
// /api/v1/public/bookings: visitor on iron-oak-barbershop.app.seldonframe.com
// hits POST /api/v1/public/bookings, body has orgSlug="" because the C4
// client extracts the slug from window.location.pathname (which is "/book"
// — the slug lives in the SUBDOMAIN, not the path). Server returns 400
// "missing_required_field". Every visitor on every workspace had the same
// problem.
//
// Root cause: the routing pipeline has the slug in the Host header (proxy.ts
// rewrites the request to /book/<slug>/<bookingSlug> server-side, but the
// API route never sees the rewritten path — it just sees /api/v1/public/...
// with the original Host). The public POST handlers were reading orgSlug
// from the body only, so any client that didn't send it failed.
//
// Fix: server-side defense in depth. When the body's orgSlug is missing,
// fall back to deriving it from the Host header using the same logic
// proxy.ts uses (resolveWorkspaceSlugFromHost). Now the route works:
//   - body has orgSlug → use it (existing behavior)
//   - body missing orgSlug + Host="<slug>.app.seldonframe.com" → derive
//   - both missing → return 400 (real misconfiguration)
//
// Mirrors proxy.ts's resolveWorkspaceSlugFromHost. Kept in its own module
// so both proxy.ts (edge runtime) and route handlers (node runtime) can
// share — and so the logic has ONE source of truth.

/**
 * Derive a workspace slug from a request `Host` header value.
 *
 * Returns the subdomain when the host is a workspace subdomain
 * (`<slug>.app.seldonframe.com` or whatever WORKSPACE_BASE_DOMAIN is set
 * to). Returns null when:
 *   - host is empty / null
 *   - host equals the bare workspace base domain (e.g. "app.seldonframe.com")
 *   - host doesn't end with the base domain (custom domain, marketing site)
 *   - subdomain contains additional dots (e.g. "foo.bar.app.seldonframe.com")
 *   - subdomain is "app" or "www" (reserved for the main app + marketing)
 *
 * @param host - raw Host header value (may include port; we strip it)
 * @returns the slug (e.g. "iron-oak-barbershop") or null
 */
export function resolveWorkspaceSlugFromHostHeader(
  host: string | null | undefined,
): string | null {
  if (!host) return null;
  const normalized = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!normalized) return null;

  const workspaceBaseDomain = (
    process.env.WORKSPACE_BASE_DOMAIN?.trim().toLowerCase() ||
    "app.seldonframe.com"
  )
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");

  if (!workspaceBaseDomain || normalized === workspaceBaseDomain) {
    return null;
  }

  const suffix = `.${workspaceBaseDomain}`;
  if (!normalized.endsWith(suffix)) {
    return null;
  }

  const subdomain = normalized.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) {
    return null;
  }

  if (subdomain === "app" || subdomain === "www") {
    return null;
  }

  return subdomain;
}

/**
 * Convenience: pull the Host header from a Fetch API Request and run it
 * through resolveWorkspaceSlugFromHostHeader. Prefers x-forwarded-host
 * (Vercel sets this with the public-facing host) and falls back to host.
 */
export function resolveWorkspaceSlugFromRequest(
  request: Request,
): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  const candidate = forwarded?.split(",")[0]?.trim() || request.headers.get("host");
  return resolveWorkspaceSlugFromHostHeader(candidate);
}
