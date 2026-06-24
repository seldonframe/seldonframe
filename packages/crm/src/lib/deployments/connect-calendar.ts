// ICP-3 "pluggable booking backend" Task 9 — the client-scoped calendar CONNECT
// action (the agency side of binding a deployment's calendarRef).
//
// Tasks 1-8 made the runtime book into deployment.calendarRef
// ({provider, accountId, calendarId}) once it's set. This action lets the AGENCY
// connect that calendar: it generates a Composio managed-OAuth connect link
// scoped to the CLIENT org (the Composio user_id IS the org uuid), with a
// callback URL that carries the deployment id + toolkit. The OAuth return lands
// on app/api/deployments/[id]/calendar/callback, which verifies the connection
// against the client org's LIVE connections before persisting calendarRef.
//
// SECURITY: the connect link is scoped to deployment.clientOrgId, never the
// builder's org — so the resulting connected account lives under the CLIENT's
// Composio user_id and the unauthenticated callback can re-derive ownership from
// it (see the callback's listConnections check).
//
// "use server" — this file exports ONLY async functions (+ an `export type`),
// per scripts/check-use-server.sh. The DI default-deps builder is a NON-exported
// local const, so it never trips the guard. Importing the Composio adapter
// transitively pulls the Node SDK; the only entrypoints are this server action
// (Node by default) and the callback route (which declares runtime = "nodejs").

"use server";

import { getOrgId } from "@/lib/auth/helpers";
import { getDeployment } from "./store";
import { createConnectLink } from "@/lib/integrations/composio/client";
import type { Deployment } from "@/db/schema/deployments";

/** The two calendar toolkits a deployment may bind (catalog slugs). */
export type CalendarToolkit = "googlecalendar" | "outlook";

export type StartCalendarConnectResult =
  | { ok: true; redirectUrl: string }
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_found"
        | "no_client_org"
        | "invalid_toolkit"
        | "connect_failed";
    };

/** Injectable seams so the action runs with no session / DB / network in tests.
 *  Defaults resolve the real getOrgId / getDeployment / createConnectLink. */
export type StartCalendarConnectDeps = {
  getOrgId: () => Promise<string | null>;
  getDeployment: (id: string) => Promise<Deployment | null>;
  createConnectLink: (
    orgId: string,
    toolkit: string,
    callbackUrl: string,
  ) => Promise<{ redirectUrl: string | null }>;
};

/** Catalog slugs this action accepts (kept narrow — only the two calendars). */
const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

/**
 * Start a client-scoped calendar Connect flow for a deployment.
 *
 *   getOrgId → toolkit allow-list → getDeployment (+ builder org guard) →
 *   require clientOrgId → createConnectLink(clientOrgId, toolkit, callbackUrl).
 *
 * The connect link is scoped to the CLIENT org (the Composio user_id), and the
 * callback URL carries the deployment id + toolkit so the (unauthenticated)
 * callback route can re-scope + verify the resulting connection before it
 * persists calendarRef.
 *
 * @param deps - optional DI (tests inject fakes; defaults are the real impls).
 */
export async function startCalendarConnect(
  input: { deploymentId: string; toolkit: CalendarToolkit },
  deps?: Partial<StartCalendarConnectDeps>,
): Promise<StartCalendarConnectResult> {
  const resolveOrgId = deps?.getOrgId ?? getOrgId;
  const loadDeployment = deps?.getDeployment ?? getDeployment;
  const connect = deps?.createConnectLink ?? createConnectLink;

  const orgId = await resolveOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // Validate the toolkit against the narrow calendar allow-list before any
  // lookup — an arbitrary slug must never reach the authorize call.
  if (!CALENDAR_TOOLKITS.has(input.toolkit)) {
    return { ok: false, error: "invalid_toolkit" };
  }

  // Org guard: the deployment must exist AND belong to this operator's org.
  const deployment = await loadDeployment(input.deploymentId);
  if (!deployment || deployment.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }

  // The client workspace must be provisioned first — the calendar belongs to the
  // client org's Composio user_id, so without it there is nothing to scope to.
  if (!deployment.clientOrgId) {
    return { ok: false, error: "no_client_org" };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const callbackUrl = `${appUrl}/api/deployments/${input.deploymentId}/calendar/callback?toolkit=${input.toolkit}`;

  const { redirectUrl } = await connect(
    deployment.clientOrgId,
    input.toolkit,
    callbackUrl,
  );
  if (!redirectUrl) return { ok: false, error: "connect_failed" };
  return { ok: true, redirectUrl };
}
