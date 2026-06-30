// Marketplace buyer onboarding — the buyer-surface GUARD predicate (pure).
//
// A marketplace BUYER bought ONE agent and should live on their focused "My
// Agent" surface — NOT the agency app. So a buyer-only org landing on an agency
// surface (/clients/new, the agency dashboard) is redirected to their agent.
//
// The risk is regressing AGENCY OPERATORS (who legitimately use those surfaces),
// so the predicate is deliberately CONSERVATIVE — it fires ONLY for an org that:
//   1. owns at least one BUYER deployment (a deployment whose template was cloned
//      from a marketplace listing — stamped `sourceListingId`), AND
//   2. is NOT an agency operator (owns no partner_agencies row).
// An agency that ALSO bought an agent has `isAgencyOperator: true`, so it is
// never treated as buyer-only. A brand-new user who hasn't bought anything has no
// buyer deployment, so they pass through untouched.
//
// Pure: no DB, no request object — the caller resolves the two booleans (+ the
// target deployment id) and the path. Nothing throws.

/** The agency surfaces a buyer-only org is redirected AWAY from — every root in
 *  the agency left-nav (see components/layout/nav-config.ts) plus the agency-only
 *  command-palette destinations. A marketplace buyer should NEVER land on any of
 *  these; they belong on their focused "My Agent" home.
 *
 *  Matched as exact paths OR `${prefix}/…` sub-paths (so `/studio`, `/studio/agents`,
 *  and `/contacts/c-1?x=y` all match) — a bare substring like `/studious` or
 *  `/clientside` does NOT match (segment-boundary check in `isAgencySurfacePath`).
 *
 *  Bug 2: previously only `/clients/new`, `/clients`, `/orgs` were covered, so a
 *  buyer-only org could still reach `/studio/*`, `/dashboard`, `/contacts`, etc.
 *  and render the full agency shell. This set now mirrors the whole agency nav. */
const AGENCY_SURFACE_PREFIXES = [
  // Overview / builder
  "/dashboard",
  "/studio",
  "/automations",
  // Customers
  "/contacts",
  "/bookings",
  "/forms",
  // Inbox
  "/conversations",
  "/emails",
  // Money
  "/deals",
  "/proposals",
  // Portfolio / multi-org
  "/clients",
  "/orgs",
  // System
  "/integrations",
  "/settings",
  // Agency-only command-palette destinations
  "/soul-marketplace",
  "/seldon",
] as const;

/** Is this org a marketplace BUYER and NOT an agency operator? Pure. */
export function isBuyerOnlyOrg(input: {
  /** Owns a partner_agencies row (an agency operator). */
  isAgencyOperator: boolean;
  /** Owns at least one BUYER deployment (template stamped `sourceListingId`). */
  hasBuyerDeployment: boolean;
}): boolean {
  return input.hasBuyerDeployment && !input.isAgencyOperator;
}

/** Is `pathname` one of the agency surfaces a buyer should be redirected off? */
export function isAgencySurfacePath(pathname: string): boolean {
  const p = (pathname || "").split("?")[0];
  return AGENCY_SURFACE_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

export type ShouldRedirectInput = {
  pathname: string;
  isAgencyOperator: boolean;
  hasBuyerDeployment: boolean;
  /** The buyer's deployment id to send them to, if known. */
  buyerDeploymentId: string | null;
};

export type ShouldRedirectResult =
  | { redirect: true; to: string }
  | { redirect: false };

/**
 * Decide whether a buyer-only org on an agency surface should be redirected to
 * their "My Agent" home, and to where. Pure. Returns `{ redirect: false }` for
 * agency operators, for non-buyer users, for non-agency paths, or when no target
 * deployment id is known (never redirect to a broken `/agent/` URL).
 */
export function shouldRedirectToBuyerAgent(
  input: ShouldRedirectInput,
): ShouldRedirectResult {
  if (!isBuyerOnlyOrg(input)) return { redirect: false };
  if (!isAgencySurfacePath(input.pathname)) return { redirect: false };
  const id = (input.buyerDeploymentId ?? "").trim();
  if (!id) return { redirect: false };
  return { redirect: true, to: `/agent/${id}` };
}
