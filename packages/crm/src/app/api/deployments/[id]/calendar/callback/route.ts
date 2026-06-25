// ICP-3 "pluggable booking backend" Task 9 — the calendar Connect OAUTH RETURN.
//
//   GET /api/deployments/[id]/calendar/callback?toolkit=…&status=…&connected_account_id=…
//
// Composio redirects the operator here after the hosted consent screen
// (startCalendarConnect built this URL: agency KEY, deployment-id ENTITY).
// On a VERIFIED connection we persist the deployment's calendarRef so the agent
// books into the client's Google/Outlook; otherwise we bounce back to the
// Clients screen with ?calendar=error.
//
// SECURITY — this endpoint is UNAUTHENTICATED (it's an OAuth redirect target, no
// session). We therefore NEVER trust the query params for the binding. We load
// the deployment, then call listConnections(deployment.builderOrgId, {
// entityUserId: deploymentId }) and require a LIVE connection under THAT
// deployment entity whose connectedAccountId === the param AND whose slug ===
// the toolkit param. A forged callback with a random account id fails this check
// (it isn't in the deployment entity's connections) → no persist. This binds the
// deployment only to a genuine connection under its own per-deployment Composio
// user_id. The whole handler is wrapped in try/catch so the OAuth return is
// never answered with a 500 — any throw redirects to ?calendar=error.
//
// Runtime: listConnections transitively imports the Composio Node SDK, so this
// route MUST run on the Node runtime.

import { NextRequest, NextResponse } from "next/server";
import { getDeployment, updateDeployment } from "@/lib/deployments/store";
import { listConnections } from "@/lib/integrations/composio/client";
import type { ToolkitConnection } from "@/lib/integrations/composio/client";
import type {
  Deployment,
  DeploymentCalendarRef,
} from "@/db/schema/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The calendar toolkits a deployment may bind. Mirrors connect-calendar.ts. */
const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

/** A Composio status counts as a live connection only when it's active. The
 *  authoritative signal is the listConnections check below; status is a cheap
 *  pre-filter that also tolerates Composio's casing variants. */
function isActiveStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === "active" || s === "connected" || s === "success";
}

/**
 * PURE security core (unit-tested): decide whether a callback should persist a
 * calendarRef. Returns `{ calendarRef }` ONLY when:
 *   - the toolkit param is a known calendar toolkit, AND
 *   - the status param is active/connected, AND
 *   - an accountId is present, AND
 *   - that accountId is found among the deployment ENTITY's live connections
 *     with `connected === true` and a matching toolkit slug.
 * Otherwise `{ error: "not_verified" }` — the route then redirects to
 * ?calendar=error and persists nothing.
 *
 * `connections` MUST be the result of
 * listConnections(deployment.builderOrgId, { entityUserId }) so membership
 * proves the account lives under this deployment's own per-deployment Composio
 * user_id (the anti-forgery property). The persisted ref carries `ownerOrgId`
 * (the agency key org) + `entityUserId` (the deployment id) so the runtime can
 * reconnect under the same key/entity.
 */
export function resolveCalendarRefFromCallback(args: {
  deployment: Pick<Deployment, "builderOrgId">;
  entityUserId: string;
  toolkit: string | null;
  status: string | null;
  accountId: string | null;
  connections: ToolkitConnection[];
}): { calendarRef: DeploymentCalendarRef } | { error: "not_verified" } {
  const { deployment, entityUserId, toolkit, status, accountId, connections } = args;

  if (!toolkit || !CALENDAR_TOOLKITS.has(toolkit)) return { error: "not_verified" };
  if (!accountId) return { error: "not_verified" };
  if (!isActiveStatus(status)) return { error: "not_verified" };

  const match = connections.find(
    (c) =>
      c.connected === true &&
      c.connectedAccountId === accountId &&
      c.slug === toolkit,
  );
  if (!match) return { error: "not_verified" };

  return {
    calendarRef: {
      provider: toolkit,
      accountId,
      calendarId: "primary",
      ownerOrgId: deployment.builderOrgId,
      entityUserId,
    },
  };
}

/** Where we send the operator back (success or failure) — the Clients screen. */
function clientsUrl(appUrl: string, outcome: "connected" | "error"): string {
  return `${appUrl}/studio/clients?calendar=${outcome}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const toolkit = url.searchParams.get("toolkit");
    const status = url.searchParams.get("status");
    const accountId =
      url.searchParams.get("connected_account_id") ??
      url.searchParams.get("connectedAccountId");

    const deployment = await getDeployment(id);
    if (!deployment) {
      return NextResponse.redirect(clientsUrl(appUrl, "error"));
    }

    // SECURITY: verify against the deployment ENTITY's live connections (agency
    // KEY = builderOrgId, ENTITY = deployment id) before persisting.
    const connections = await listConnections(deployment.builderOrgId, {
      entityUserId: id,
    });
    const resolved = resolveCalendarRefFromCallback({
      deployment,
      entityUserId: id,
      toolkit,
      status,
      accountId,
      connections,
    });

    if ("error" in resolved) {
      return NextResponse.redirect(clientsUrl(appUrl, "error"));
    }

    await updateDeployment({ id, patch: { calendarRef: resolved.calendarRef } });
    return NextResponse.redirect(clientsUrl(appUrl, "connected"));
  } catch {
    // Never 500 the OAuth return — bounce back with an error flag.
    return NextResponse.redirect(clientsUrl(appUrl, "error"));
  }
}
