import { cookies } from "next/headers";
import { validateRawWorkspaceToken } from "./workspace-token";

/**
 * C6 — bearer-token admin access for guest workspaces.
 *
 * Operators creating workspaces via MCP receive a `wst_…` bearer token
 * but currently have no way to *click* into the admin dashboard — the
 * dashboard layout requires a full NextAuth session, and signing up
 * binds the workspace to a personal account (heavyweight + slow).
 *
 * C6 introduces a parallel, narrower auth path:
 *   - `/admin/[workspaceId]?token=wst_…` validates the token, sets two
 *     cookies (sf_admin_token + sf_active_org_id), and redirects to
 *     /dashboard.
 *   - Dashboard layout / `requireAuth` recognizes the admin-token
 *     cookie via `resolveAdminTokenContext` and synthesizes a session
 *     scoped to the workspace.
 *
 * The admin token expires on the api_keys row (default 7 days for tokens
 * minted by `create_workspace`). The cookie expires at the same time so
 * the browser stops sending it once the server would have rejected it.
 */

export const ADMIN_TOKEN_COOKIE = "sf_admin_token";
export const ACTIVE_ORG_COOKIE = "sf_active_org_id";

/** Cookie max-age in seconds; matches the 7-day default expiry on tokens. */
export const ADMIN_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * Sentinel user.id for admin-token sessions.
 *
 * The dashboard does `WHERE organizations.ownerId = user.id` (and other
 * uuid comparisons) directly against the session user.id. We need a
 * VALID-shaped uuid here or Postgres throws "invalid input syntax for
 * type uuid" and the dashboard 500s.
 *
 * The nil UUID (`00000000-…`) per RFC 4122 § 4.1.7 is reserved and will
 * never collide with a real users.id. Queries return empty rows — exactly
 * what we want for "no real user backing this session".
 *
 * Detection of admin-token sessions happens via `isAdminTokenUserId()`
 * which compares against this sentinel.
 */
export const ADMIN_TOKEN_SENTINEL_USER_ID =
  "00000000-0000-0000-0000-000000000000";

/**
 * Returns the sentinel user id used by admin-token sessions. The orgId
 * argument is kept in the signature so the call-site reads "admin token
 * for this org" — but the return value is the nil UUID regardless,
 * because the orgId travels separately via `session.user.orgId`.
 */
export function adminTokenUserId(_orgId: string): string {
  return ADMIN_TOKEN_SENTINEL_USER_ID;
}

export interface AdminTokenContext {
  orgId: string;
  tokenId: string;
  /**
   * Synthetic user matching the NextAuth Session["user"] shape declared
   * in src/types/next-auth.d.ts. All optional fields are explicitly set
   * to undefined so dashboard code that reads e.g. `user.trialEndsAt`
   * gets `undefined` (the same outcome as for a brand-new real user)
   * rather than a TypeScript narrowing error.
   */
  user: {
    id: string;
    name: string;
    email: null;
    role: "admin";
    orgId: string;
    image: null;
    soulCompleted: undefined;
    welcomeShown: undefined;
    planId: null;
    subscriptionStatus: undefined;
    billingPeriod: undefined;
    trialEndsAt: null;
  };
}

/**
 * Read + validate the admin-token cookie. Returns null when:
 *   - no cookie set
 *   - token doesn't match any api_keys row
 *   - token is expired
 *
 * This is the read-side counterpart to `setAdminTokenCookies`. Server
 * components (dashboard layout, page handlers) call this to discover
 * "is the current request authenticated by an admin token?" before
 * falling through to the standard NextAuth session check.
 */
export async function resolveAdminTokenContext(): Promise<AdminTokenContext | null> {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(ADMIN_TOKEN_COOKIE);
  if (!tokenCookie?.value) return null;

  const validated = await validateRawWorkspaceToken(tokenCookie.value);
  if (!validated) return null;

  return {
    orgId: validated.orgId,
    tokenId: validated.tokenId,
    user: {
      id: adminTokenUserId(validated.orgId),
      name: "Workspace Admin",
      email: null,
      role: "admin",
      orgId: validated.orgId,
      image: null,
      soulCompleted: undefined,
      welcomeShown: undefined,
      planId: null,
      subscriptionStatus: undefined,
      billingPeriod: undefined,
      trialEndsAt: null,
    },
  };
}

/**
 * Detect a synthetic admin-token user.id without doing the cookie /
 * DB round-trip. Useful for guards inside helpers that already hold
 * a session and want to skip user-table lookups for admin-token sessions.
 */
export function isAdminTokenUserId(userId: string | null | undefined): boolean {
  return userId === ADMIN_TOKEN_SENTINEL_USER_ID;
}
