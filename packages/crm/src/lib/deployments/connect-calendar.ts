// ICP-3 "pluggable booking backend" Task 9 — the calendar CONNECT action (the
// agency side of binding a deployment's calendarRef).
//
// AGENCY-KEY + PER-DEPLOYMENT-ENTITY model: Studio deployments never provision a
// client workspace (deployment.clientOrgId is null in prod), so the connect is
// scoped to the AGENCY (deployment.builderOrgId — which holds the Composio API
// KEY) while the Composio ENTITY (user_id) is the DEPLOYMENT id. That isolates
// each client's Google/Outlook under one agency key with no provisioning and no
// multi-account ambiguity. The connect link carries the deployment id + toolkit
// in its callback; the OAuth return lands on
// app/api/deployments/[id]/calendar/callback, which verifies the connection
// against the deployment-entity's LIVE connections before persisting calendarRef.
//
// SECURITY: the connected account lives under the DEPLOYMENT entity's user_id
// (not the agency's own org user_id), so the unauthenticated callback re-derives
// ownership by listing that entity's connections (see the listConnections check).
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
    opts?: { entityUserId?: string | null },
  ) => Promise<{ redirectUrl: string | null }>;
};

/** Catalog slugs this action accepts (kept narrow — only the two calendars). */
const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

/**
 * Start a calendar Connect flow for a deployment (agency-key + per-deployment
 * entity).
 *
 *   getOrgId → toolkit allow-list → getDeployment (+ builder org guard) →
 *   createConnectLink(builderOrgId, toolkit, callbackUrl, { entityUserId: id }).
 *
 * The Composio API KEY is the AGENCY's (deployment.builderOrgId); the Composio
 * ENTITY (user_id) is the DEPLOYMENT id, so each client's calendar is isolated
 * under one key with no client-workspace provisioning. The callback URL carries
 * the deployment id + toolkit so the (unauthenticated) callback route re-scopes
 * to the same entity + verifies the resulting connection before persisting
 * calendarRef.
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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const callbackUrl = `${appUrl}/api/deployments/${input.deploymentId}/calendar/callback?toolkit=${input.toolkit}`;

  // Key = the agency org; entity (Composio user_id) = the deployment id.
  const { redirectUrl } = await connect(
    deployment.builderOrgId,
    input.toolkit,
    callbackUrl,
    { entityUserId: input.deploymentId },
  );
  if (!redirectUrl) return { ok: false, error: "connect_failed" };
  return { ok: true, redirectUrl };
}
