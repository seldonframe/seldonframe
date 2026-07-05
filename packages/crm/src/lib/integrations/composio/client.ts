// Composio per-workspace adapter (SERVER / NODE RUNTIME ONLY).
//
// @composio/core is a Node-runtime SDK — any route/page that (transitively)
// imports this module MUST `export const runtime = "nodejs"`. This file is NOT
// a "use server" module: it exports non-async values (types + the catalog
// re-export) and pure helpers, which Server Actions forbid. Server Actions that
// need these call them from their own "use server" file.
//
// One Composio "session" per workspace, keyed by `user_id = organizations.id`
// (a uuid is a safe user_id; isolation is per user_id under one project key).
// The session id is cached in the encrypted workspaceSecrets store under
// serviceName "composio_session" so we reuse it across requests (composio.use);
// on a 404/expiry we transparently recreate it.
//
// PER-DEPLOYMENT ENTITY: callers that bind a deployment's calendar pass
// `entityUserId` (the deployment id). When set, the session is created under
// THAT user_id rather than the org's, so each client's connected calendar is
// isolated under one agency API key. Entity-scoped calls NEVER touch the
// org-level cached session id (that cache is keyed by org, not entity) — they
// always `composio.create(entityUserId, …)` fresh.
//
// SECURITY: the Composio API key is resolved per-workspace (BYO secret else
// platform env) and is NEVER logged. `session.mcp.headers` (the `x-api-key`
// header the MCP endpoint requires) is handed to the inline MCP client at
// runtime — it is not persisted.

import { Composio } from "@composio/core";

import { storeSecret, getSecretValue } from "@/lib/secrets";
import { resolveComposioKey } from "./keys";
import { COMPOSIO_TOOLKIT_SLUGS, isCatalogToolkit } from "./catalog";

export { COMPOSIO_TOOLKITS, COMPOSIO_TOOLKIT_SLUGS, getComposioToolkit } from "./catalog";
export type { ComposioToolkitInfo } from "./catalog";

/** The encrypted-secret serviceName the cached session id lives under. */
const SESSION_SECRET_SERVICE = "composio_session";

/** The live MCP coordinates for a workspace session (handed to the MCP client). */
export type ComposioSessionInfo = {
  sessionId: string;
  mcpUrl: string;
  /** The headers the MCP endpoint requires — `{ "x-api-key": <key> }`. */
  mcpHeaders: Record<string, string>;
};

/** A toolkit connection as surfaced to the /integrations UI. */
export type ToolkitConnection = {
  slug: string;
  name: string;
  logo: string | null;
  connected: boolean;
  /** The Composio connectedAccount id (for disconnect), if connected. */
  connectedAccountId: string | null;
};

/**
 * Build a Composio client for an org, or null when no key is configured
 * (platform env unset AND no BYO secret) — callers fail closed to native tools.
 */
export async function composioForOrg(orgId: string): Promise<Composio | null> {
  const { apiKey } = await resolveComposioKey(orgId);
  if (!apiKey) return null;
  return new Composio({ apiKey });
}

/**
 * Ensure a live session for (orgId, toolkits). Reuses the cached session id via
 * `composio.use`; on any error (expired/404/changed toolkits) it recreates one
 * with `composio.create` and overwrites the cached id.
 *
 * The cached-id write uses `storeSecret`, which requires an authorized actor.
 * In the agent runtime (voice/SMS/public chat) there is no user session, so the
 * persist is best-effort: a failure to cache does NOT fail session creation —
 * the returned session is fully usable for the current request, it just won't
 * be reused next time. Pass `actorUserId` from interactive contexts (dashboard
 * actions) so the id persists.
 *
 * Returns null when the workspace has no Composio key.
 */
export async function ensureSession(
  orgId: string,
  toolkits: string[],
  opts?: {
    client?: Composio | null;
    actorUserId?: string | null;
    /** The Composio ENTITY (user_id) to scope to — the deployment id. When set,
     *  the session is created under this id, bypassing the org-level cache. */
    entityUserId?: string | null;
  },
): Promise<ComposioSessionInfo | null> {
  const composio =
    opts?.client !== undefined ? opts.client : await composioForOrg(orgId);
  if (!composio) return null;

  const requested = toolkits.length > 0 ? toolkits : [...COMPOSIO_TOOLKIT_SLUGS];

  // Entity-scoped (per-deployment) sessions NEVER use the org-level cache —
  // that cached id belongs to the org's user_id, not this entity. Always create
  // fresh under the entity id (no read, no write of the org session secret).
  if (opts?.entityUserId) {
    const created = await composio.create(opts.entityUserId, { toolkits: requested, mcp: true });
    return toSessionInfo(created);
  }

  // Try to reuse a cached session id.
  const cachedId = await getSecretValue({
    workspaceId: orgId,
    serviceName: SESSION_SECRET_SERVICE,
    skipAccessCheck: true,
  });

  if (cachedId) {
    try {
      const reused = await composio.use(cachedId, { mcp: true });
      return toSessionInfo(reused);
    } catch {
      // expired / 404 / toolkits drift — fall through to (re)create below.
    }
  }

  const created = await composio.create(orgId, { toolkits: requested, mcp: true });
  await persistSessionId(orgId, created.sessionId, opts?.actorUserId);
  return toSessionInfo(created);
}

/** Best-effort cache of the session id; swallows the "no actor" Unauthorized. */
async function persistSessionId(
  orgId: string,
  sessionId: string,
  actorUserId?: string | null,
): Promise<void> {
  try {
    await storeSecret({
      workspaceId: orgId,
      serviceName: SESSION_SECRET_SERVICE,
      value: sessionId,
      actorUserId: actorUserId ?? undefined,
    });
  } catch {
    // No interactive actor (runtime path) → can't persist. The session still
    // works for this request; we just recreate it next time. Never throw.
  }
}

/** Map a live Session to the MCP coordinates the inline client needs. */
function toSessionInfo(session: {
  sessionId: string;
  mcp: { url: string; headers?: Record<string, string> };
}): ComposioSessionInfo {
  return {
    sessionId: session.sessionId,
    mcpUrl: session.mcp.url,
    mcpHeaders: session.mcp.headers ?? {},
  };
}

/**
 * List the catalog toolkits with their connection state for this workspace.
 * Filters Composio's full toolkit list down to the curated catalog. Returns []
 * when the workspace has no key.
 */
export async function listConnections(
  orgId: string,
  opts?: {
    client?: Composio | null;
    actorUserId?: string | null;
    /** The Composio ENTITY (user_id) to scope to — the deployment id. When set,
     *  connections are listed under this id, bypassing the org-level cache. */
    entityUserId?: string | null;
  },
): Promise<ToolkitConnection[]> {
  const composio =
    opts?.client !== undefined ? opts.client : await composioForOrg(orgId);
  if (!composio) return [];

  let session: Awaited<ReturnType<Composio["create"]>>;
  if (opts?.entityUserId) {
    // Entity-scoped: always create fresh under the entity id, never the org
    // cache (the callback verifies against THIS deployment entity's accounts).
    session = await composio.create(opts.entityUserId, { toolkits: [...COMPOSIO_TOOLKIT_SLUGS] });
  } else {
    const cachedId = await getSecretValue({
      workspaceId: orgId,
      serviceName: SESSION_SECRET_SERVICE,
      skipAccessCheck: true,
    });

    if (cachedId) {
      try {
        session = await composio.use(cachedId);
      } catch {
        session = await composio.create(orgId, { toolkits: [...COMPOSIO_TOOLKIT_SLUGS] });
        await persistSessionId(orgId, session.sessionId, opts?.actorUserId);
      }
    } else {
      session = await composio.create(orgId, { toolkits: [...COMPOSIO_TOOLKIT_SLUGS] });
      await persistSessionId(orgId, session.sessionId, opts?.actorUserId);
    }
  }

  const details = await session.toolkits();
  return mapToolkitConnections(details.items ?? []);
}

/** Pure mapping: Composio toolkit items → catalog-filtered ToolkitConnection[]. */
export function mapToolkitConnections(
  items: Array<{
    slug: string;
    name: string;
    logo?: string;
    connection?: {
      isActive: boolean;
      connectedAccount?: { id: string } | null;
    } | null;
  }>,
): ToolkitConnection[] {
  return items
    .filter((it) => isCatalogToolkit(it.slug))
    .map((it) => ({
      slug: it.slug,
      name: it.name,
      logo: it.logo ?? null,
      connected: it.connection?.isActive ?? false,
      connectedAccountId: it.connection?.connectedAccount?.id ?? null,
    }));
}

/**
 * Start a managed-OAuth Connect flow for a toolkit. Returns the hosted consent
 * URL the operator is redirected to. `callbackUrl` is where Composio sends them
 * back (with `status` + `connected_account_id` appended).
 */
export async function createConnectLink(
  orgId: string,
  toolkit: string,
  callbackUrl: string,
  opts?: {
    client?: Composio | null;
    actorUserId?: string | null;
    /** The Composio ENTITY (user_id) to scope the connect to — the deployment
     *  id. Threaded into ensureSession so the consent lands under this entity. */
    entityUserId?: string | null;
  },
): Promise<{ redirectUrl: string | null }> {
  const session = await ensureSession(orgId, [...COMPOSIO_TOOLKIT_SLUGS], opts);
  if (!session) return { redirectUrl: null };

  const composio =
    opts?.client !== undefined ? opts.client : await composioForOrg(orgId);
  if (!composio) return { redirectUrl: null };

  // Reuse the just-ensured session to authorize the toolkit.
  const live = await composio.use(session.sessionId);
  const connectionRequest = await live.authorize(toolkit, { callbackUrl });
  return { redirectUrl: connectionRequest.redirectUrl ?? null };
}

/** Disconnect (delete) a connected account by its Composio id. */
export async function disconnect(
  orgId: string,
  connectedAccountId: string,
  opts?: { client?: Composio | null },
): Promise<void> {
  const composio =
    opts?.client !== undefined ? opts.client : await composioForOrg(orgId);
  if (!composio) return;
  await composio.connectedAccounts.delete(connectedAccountId);
}

/**
 * Register an inbound-event trigger for this workspace's user_id. The webhook
 * (Phase 4) routes the resulting events back into the archetype dispatcher.
 */
export async function createTrigger(
  orgId: string,
  triggerSlug: string,
  triggerConfig?: Record<string, unknown>,
  opts?: { client?: Composio | null },
): Promise<{ triggerId: string | null }> {
  const composio =
    opts?.client !== undefined ? opts.client : await composioForOrg(orgId);
  if (!composio) return { triggerId: null };
  const res = await composio.triggers.create(orgId, triggerSlug, {
    triggerConfig: triggerConfig ?? {},
  });
  // The upsert response carries the trigger instance id under `triggerId`.
  const triggerId =
    (res as { triggerId?: string } | null | undefined)?.triggerId ?? null;
  return { triggerId };
}
