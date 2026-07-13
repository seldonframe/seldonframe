// Phase 2 — /integrations dashboard server actions (managed-OAuth Connect).
//
// These thin "use server" wrappers org-guard via getOrgId() and call the
// per-workspace Composio adapter (lib/integrations/composio/client.ts). They run
// in the Node runtime (the page declares `export const runtime = "nodejs"`), so
// importing the Composio SDK transitively is safe.
//
// Per check-use-server.sh a "use server" file exports ONLY async functions — so
// there are no shared types or constants here; the catalog + result types come
// from the adapter / catalog modules the client imports directly.
//
// SECURITY: every action resolves orgId server-side (never trusts a client arg
// for identity). The BYO key action stores the key ENCRYPTED via storeSecret,
// keyed to the operator's workspace, with the authenticated actor threaded so the
// session-id cache (which storeSecret-gates on an authorized actor) persists.
// No key value is ever returned to the client or logged.

"use server";

import { cookies } from "next/headers";
import { getOrgId, getCurrentUser } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { storeSecret, rotateSecret } from "@/lib/secrets";
import { getVettedConnector } from "@/lib/agents/mcp/connectors";
import {
  discoverAuthServer,
  registerClient,
  buildAuthorizeUrl,
  generatePkcePair,
  generateStateToken,
} from "@/lib/agents/mcp/oauth";
import {
  MCP_OAUTH_COOKIE,
  signMcpOauthState,
} from "@/lib/agents/mcp/oauth-state-cookie";
import {
  listConnections,
  createConnectLink,
  disconnect,
  createTrigger,
  type ToolkitConnection,
} from "@/lib/integrations/composio/client";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";

/** Where Composio sends the operator back after the hosted consent screen. */
const INTEGRATIONS_BASE_URL = "https://app.seldonframe.com/integrations";

/** Alternate return target for the win-ladder "connect calendar" deep link
 *  (hotfix H4a). Only reachable via the literal opts.returnTo === "dashboard"
 *  allowlist check below — never built from an arbitrary caller-supplied
 *  string. */
const DASHBOARD_BASE_URL = "https://app.seldonframe.com/dashboard";

export type ListComposioConnectionsResult =
  | { ok: true; connections: ToolkitConnection[] }
  | { ok: false; error: string };

/**
 * List the catalog toolkits with their live connection state for this
 * workspace. Returns an empty list (ok:true) when Composio is unconfigured —
 * the page still renders the grid with everything in the "Connect" state.
 */
export async function listComposioConnectionsAction(): Promise<ListComposioConnectionsResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const user = await getCurrentUser();
  try {
    const connections = await listConnections(orgId, {
      actorUserId: user?.id ?? null,
    });
    return { ok: true, connections };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ConnectComposioToolkitResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Begin a managed-OAuth Connect flow for a catalog toolkit. Returns the hosted
 * consent URL the client redirects to. The callback returns the operator to
 * /integrations?connected=<toolkit> so the page can show a success toast +
 * refetch — unless `opts.returnTo` is the literal "dashboard", in which case
 * the callback instead lands on /dashboard?connected=<toolkit> (the
 * win-ladder "connect calendar" flow, hotfix H4a).
 */
export async function connectComposioToolkitAction(
  toolkit: string,
  opts?: { returnTo?: "dashboard" },
): Promise<ConnectComposioToolkitResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Guard the toolkit against the curated catalog so an arbitrary slug can't be
  // forced through the authorize call.
  if (!getComposioToolkit(toolkit)) {
    return { ok: false, error: "unknown_toolkit" };
  }

  const user = await getCurrentUser();
  // STRICT allowlist: only the literal "dashboard" maps to a fixed base URL.
  // Never interpolate an arbitrary caller-supplied string into callbackUrl.
  const base = opts?.returnTo === "dashboard" ? DASHBOARD_BASE_URL : INTEGRATIONS_BASE_URL;
  const callbackUrl = `${base}?connected=${encodeURIComponent(toolkit)}`;
  try {
    const { redirectUrl } = await createConnectLink(orgId, toolkit, callbackUrl, {
      actorUserId: user?.id ?? null,
    });
    if (!redirectUrl) {
      return { ok: false, error: "composio_not_configured" };
    }
    return { ok: true, redirectUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type DisconnectComposioToolkitResult =
  | { ok: true }
  | { ok: false; error: string };

/** Disconnect (delete) a connected account by its Composio id. Org-guarded. */
export async function disconnectComposioToolkitAction(
  connectedAccountId: string,
): Promise<DisconnectComposioToolkitResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };
  if (!connectedAccountId || connectedAccountId.trim().length === 0) {
    return { ok: false, error: "missing_account_id" };
  }

  try {
    await disconnect(orgId, connectedAccountId.trim());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type SetComposioKeyResult = { ok: true } | { ok: false; error: string };

/**
 * Store a BYO Composio API key for this workspace (the BYO override of the
 * platform key). Stored encrypted under serviceName "composio"; the resolver
 * (resolveComposioKey) reads it ahead of the platform env key.
 */
export async function setComposioKeyAction(
  key: string,
): Promise<SetComposioKeyResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };
  const trimmed = (key ?? "").trim();
  if (trimmed.length === 0) return { ok: false, error: "missing_key" };

  const user = await getCurrentUser();
  try {
    await storeSecret({
      workspaceId: orgId,
      serviceName: "composio",
      value: trimmed,
      actorUserId: user?.id ?? null,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── MCP OAuth connectors (Circle et al.) ────────────────────────────────────
//
// Mirrors connectComposioToolkitAction's shape: resolve the authed org
// server-side, look up the connector in the vetted registry (never trust a
// client-supplied endpoint), then run discovery → DCR → mint a signed,
// httpOnly, 10-minute state cookie and return the authorize URL for the
// client to redirect to. The callback (app/api/integrations/mcp/callback)
// completes the exchange.

const MCP_OAUTH_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes

function resolveAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
  if (!secret) {
    // contract:throw-ok: deployment-config error (env var missing) — never
    // mint an unverifiable state cookie.
    throw new Error("Cannot start MCP OAuth connect: AUTH_SECRET (or NEXTAUTH_SECRET) is not set.");
  }
  return secret;
}

function resolveAppOrigin(): string {
  return (process.env.NEXTAUTH_URL?.trim() || "https://app.seldonframe.com").replace(/\/+$/, "");
}

export type ConnectMcpConnectorResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Begin the OAuth connect flow for a vetted `authType:"oauth"` connector
 * (Circle). Discovers the auth server, registers a per-workspace DCR client,
 * mints PKCE + state, sets the signed state cookie, and returns the
 * authorize URL — the client does `window.location.assign(url)`.
 */
export async function connectMcpConnectorAction(input: {
  connectorId: string;
  accessLevelIndex?: number;
}): Promise<ConnectMcpConnectorResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const connector = getVettedConnector(input.connectorId);
  if (!connector || connector.authType !== "oauth") {
    return { ok: false, error: "unknown_oauth_connector" };
  }

  const accessLevels = connector.accessLevels ?? [];
  const level =
    accessLevels[input.accessLevelIndex ?? 0] ?? accessLevels[0];
  if (!level) return { ok: false, error: "no_access_levels_configured" };

  const redirectUri = `${resolveAppOrigin()}/api/integrations/mcp/callback`;

  let secret: string;
  try {
    secret = resolveAuthSecret();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const metadata = await discoverAuthServer(connector.endpoint);
    const client = await registerClient({
      metadata,
      redirectUri,
      clientName: "SeldonFrame",
    });

    const { verifier, challenge } = generatePkcePair();
    const state = generateStateToken();

    const cookieValue = signMcpOauthState(
      {
        v: 1,
        state,
        verifier,
        connectorId: connector.id,
        orgId,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        tokenEndpoint: metadata.token_endpoint,
        scopes: level.scopes,
        exp: Date.now() + MCP_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000,
      },
      secret,
    );

    const cookieStore = await cookies();
    cookieStore.set(MCP_OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: MCP_OAUTH_COOKIE_MAX_AGE_SECONDS,
    });

    const url = buildAuthorizeUrl({
      metadata,
      clientId: client.client_id,
      redirectUri,
      scopes: level.scopes,
      state,
      codeChallenge: challenge,
    });

    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type DisconnectMcpConnectorResult = { ok: true } | { ok: false; error: string };

/**
 * Disconnect a vetted OAuth connector: delete its stored secret (the token
 * envelope). Circle doesn't advertise a revocation endpoint — the operator
 * can also revoke access from within Circle itself; documented in the
 * /integrations card copy, not enforced here.
 */
export async function disconnectMcpConnectorAction(
  connectorId: string,
): Promise<DisconnectMcpConnectorResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const connector = getVettedConnector(connectorId);
  if (!connector || connector.authType !== "oauth") {
    return { ok: false, error: "unknown_oauth_connector" };
  }

  try {
    await rotateSecret({ workspaceId: orgId, serviceName: connector.secretService });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type EnableComposioTriggerResult =
  | { ok: true; triggerId: string | null }
  | { ok: false; error: string };

/**
 * Enable the catalog's primary inbound-event trigger for a connected toolkit
 * (Phase 4). The webhook routes the resulting events into the archetype
 * dispatcher. Org-guarded; the toolkit must be in the catalog AND declare a
 * pinned primaryTrigger.
 */
export async function enableComposioTriggerAction(
  toolkit: string,
): Promise<EnableComposioTriggerResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const entry = getComposioToolkit(toolkit);
  if (!entry) return { ok: false, error: "unknown_toolkit" };
  if (!entry.primaryTrigger) return { ok: false, error: "no_primary_trigger" };

  try {
    const { triggerId } = await createTrigger(orgId, entry.primaryTrigger);
    return { ok: true, triggerId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
