// OAuth callback decision ladder (DI'd, pure over injected deps) — the logic
// behind the thin `app/api/integrations/mcp/callback/route.ts` GET handler
// (L-31: route files export HTTP verbs/config only).
//
// Every failure step maps to a FIXED same-origin redirect with an enum
// reason (never raw provider text) — there is no user-supplied redirect
// target anywhere in this flow, so there's no open-redirect surface:
//   missing_params | bad_state | expired | org_mismatch | exchange_failed
//
// SECURITY: the cookie's `state` MUST equal the callback's `state` query
// param (defense in depth beyond the HMAC signature — the signature already
// proves the cookie is unmodified, but comparing state too guards against a
// stale/replayed cookie being paired with a DIFFERENT authorize response);
// the authed session's org MUST equal the cookie's orgId (an attacker who
// steals another org's callback URL can't bind Circle into their own org);
// the connector id MUST resolve in the vetted registry.

import { MCP_OAUTH_COOKIE, verifyMcpOauthState } from "./oauth-state-cookie";
import { exchangeCode, type TokenEnvelope } from "./oauth";
import { getVettedConnector } from "./connectors";

export type McpCallbackDeps = {
  /** Read a cookie by name from the incoming request. */
  getCookie: (name: string) => string | undefined;
  /** Resolve the authed session's org id, or null if unauthenticated. */
  resolveSessionOrgId: () => Promise<string | null>;
  /** Persist the token envelope JSON under (workspaceId, serviceName). */
  storeSecret: (input: { workspaceId: string; serviceName: string; value: string }) => Promise<unknown>;
  /** Exchange the authorization code for a token envelope. */
  exchange: typeof exchangeCode;
  /** Fail-soft tools probe (default wiring: discoverVettedToolsLive(...).length,
   *  catch → null) — display-only stamp on the stored envelope. */
  probeTools: (orgId: string, connectorId: string) => Promise<number | null>;
  /** The SAME redirect_uri used to mint the authorize URL — the token
   *  endpoint requires an exact match. A fixed same-origin value (computed
   *  from server config, not user input), so it's safe to inject rather than
   *  round-trip through the cookie. */
  redirectUri: string;
  now?: () => number;
  /** HMAC signing secret for the state cookie (AUTH_SECRET/NEXTAUTH_SECRET). */
  authSecret?: string;
};

export type McpOauthCallbackResult = { redirect: string; clearCookie: boolean };

function failureRedirect(reason: string): McpOauthCallbackResult {
  return { redirect: `/integrations?error=mcp_oauth_${reason}`, clearCookie: true };
}

export async function handleMcpOauthCallback(
  params: { code: string | null; state: string | null },
  deps: McpCallbackDeps,
): Promise<McpOauthCallbackResult> {
  const now = deps.now ?? Date.now;
  const secret = deps.authSecret ?? "";

  if (!params.code || !params.state) {
    return failureRedirect("missing_params");
  }

  const cookieValue = deps.getCookie(MCP_OAUTH_COOKIE);
  if (!cookieValue) {
    return failureRedirect("bad_state");
  }

  // verifyMcpOauthState already rejects an expired `exp` (collapsing into
  // null just like a bad signature would). To give "expired" its own
  // distinct reason from a tampered/garbage cookie, re-verify signature-only
  // first (ignoring expiry) via a non-expiring check, then explicitly test
  // exp — see the two-step verify below.
  const payload = verifyMcpOauthState(cookieValue, secret, () => -Infinity);
  if (!payload) {
    return failureRedirect("bad_state");
  }
  if (now() > payload.exp) {
    return failureRedirect("expired");
  }

  if (payload.state !== params.state) {
    return failureRedirect("bad_state");
  }

  const connector = getVettedConnector(payload.connectorId);
  if (!connector) {
    return failureRedirect("bad_state");
  }

  const sessionOrgId = await deps.resolveSessionOrgId();
  if (!sessionOrgId || sessionOrgId !== payload.orgId) {
    return failureRedirect("org_mismatch");
  }

  try {
    const envelope = await deps.exchange({
      tokenEndpoint: payload.tokenEndpoint,
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      code: params.code,
      codeVerifier: payload.verifier,
      redirectUri: deps.redirectUri,
    });

    // Store the envelope FIRST — the default probe (discoverVettedToolsLive →
    // resolveConnectorBearer) reads the STORED secret, so probing before this
    // write would always see nothing and stamp a false discovered_tools_count
    // of 0 for a working connection.
    await deps.storeSecret({
      workspaceId: payload.orgId,
      serviceName: connector.secretService,
      value: JSON.stringify(envelope),
    });

    const toolCount = await deps.probeTools(payload.orgId, payload.connectorId).catch(() => null);
    if (toolCount !== null && toolCount !== undefined) {
      // Fail-soft re-store with the count-stamped envelope — the connection
      // already succeeded above, so a throw here must not fail the connect.
      try {
        await deps.storeSecret({
          workspaceId: payload.orgId,
          serviceName: connector.secretService,
          value: JSON.stringify({ ...envelope, discovered_tools_count: toolCount }),
        });
      } catch {
        // The unstamped envelope from the first store is still valid.
      }
    }
  } catch {
    return failureRedirect("exchange_failed");
  }

  return { redirect: `/integrations?connected=${encodeURIComponent(payload.connectorId)}`, clearCookie: true };
}
