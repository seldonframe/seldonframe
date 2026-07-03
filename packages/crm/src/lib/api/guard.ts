import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/utils/api-auth";
import { resolveWorkspaceBearer } from "@/lib/auth/workspace-token";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { demoApiBlockedResponse, isDemoReadonly, isWriteMethod } from "@/lib/demo/server";

/**
 * May 1, 2026 — guardApiRequest now supports THREE auth modes:
 *
 *   1. Workspace bearer (Authorization: Bearer wst_…) — minted by
 *      create_workspace, used by the MCP for every CRM-data call.
 *      The bearer encodes the orgId, so x-org-id is optional but
 *      enforced when present (must match the bearer's org).
 *   2. x-api-key (legacy SELDONFRAME_API_KEY external integrations)
 *      — requires both x-org-id AND x-api-key, matched against
 *      apiKeys row with kind="user".
 *
 * Mode 1 was the missing path that produced "Missing x-org-id" /
 * "Unauthorized" 400/401s for list_contacts / list_deals /
 * list_bookings via MCP — those routes still require this guard
 * but the MCP authenticates via bearer, not x-api-key.
 *
 * Demo mode is checked first regardless so writes are blocked even
 * with a valid bearer (read-only deploy hygiene).
 */
export async function guardApiRequest(request: Request) {
  if (isDemoReadonly() && isWriteMethod(request.method)) {
    return { error: demoApiBlockedResponse() };
  }

  const headerOrgId = request.headers.get("x-org-id");

  // Mode 1: workspace bearer. Resolve the bearer first; if it's
  // valid, the bearer's orgId IS the request's org (and the optional
  // x-org-id header must match if provided). This is the path the
  // MCP uses for every tool call after create_workspace.
  const bearer = await resolveWorkspaceBearer(request.headers);
  if (bearer) {
    if (headerOrgId && headerOrgId !== bearer.orgId) {
      return {
        error: NextResponse.json(
          {
            error:
              "x-org-id header does not match the workspace bearer token's org.",
          },
          { status: 403 }
        ),
      };
    }
    if (
      !(await checkRateLimit(
        `${bearer.orgId}:${request.headers.get("x-forwarded-for") ?? "local"}`
      ))
    ) {
      return {
        error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
      };
    }
    return { orgId: bearer.orgId };
  }

  // A caller that PRESENTED a workspace bearer (Authorization: Bearer wst_…) that
  // did NOT resolve must get a clear 401 — never fall through to the legacy
  // x-org-id path and emit a baffling "Missing x-org-id". This bit the CLI/MCP
  // when a placeholder or expired wst_ key was used: the token looked fine but
  // resolveWorkspaceBearer returned null, so the request landed in Mode 2 and the
  // error blamed a header the bearer caller never needed to send.
  const authorization = request.headers.get("authorization") ?? "";
  if (/^(bearer\s+)?wst_/i.test(authorization.trim())) {
    return {
      error: NextResponse.json(
        {
          error:
            "Invalid or expired workspace key. Mint a fresh one at https://seldonframe.com/build/keys.",
        },
        { status: 401 },
      ),
    };
  }

  // Mode 2: legacy x-org-id + x-api-key. Unchanged behavior so
  // existing external integrations keep working.
  if (!headerOrgId) {
    return { error: NextResponse.json({ error: "Missing x-org-id" }, { status: 400 }) };
  }

  if (
    !(await checkRateLimit(
      `${headerOrgId}:${request.headers.get("x-forwarded-for") ?? "local"}`
    ))
  ) {
    return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) };
  }

  const apiKey = request.headers.get("x-api-key");
  const validKey = await verifyApiKey(headerOrgId, apiKey);

  if (!validKey) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { orgId: headerOrgId };
}
