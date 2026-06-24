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

import { getOrgId, getCurrentUser } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { storeSecret } from "@/lib/secrets";
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
 * refetch.
 */
export async function connectComposioToolkitAction(
  toolkit: string,
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
  const callbackUrl = `${INTEGRATIONS_BASE_URL}?connected=${encodeURIComponent(toolkit)}`;
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
