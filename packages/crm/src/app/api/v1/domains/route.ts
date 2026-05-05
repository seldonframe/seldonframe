// v1.8.0 — POST /api/v1/domains
//
// Single REST endpoint for custom-domain CRUD. Dispatches on `op` in
// the body. Workspace bearer-scoped — every operation runs against the
// bearer's workspace. Tier-gated to non-free tiers (Growth $29 + Scale
// $99); free workspaces get a 402 response with upgrade CTA.
//
// Body:
//   { op: "add",    hostname: "joescuts.com" }
//   { op: "verify", hostname: "joescuts.com" }
//   { op: "list" }
//   { op: "remove", hostname: "joescuts.com" }

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import {
  addCustomDomain,
  listCustomDomainsForWorkspace,
  removeCustomDomain,
  verifyCustomDomain,
} from "@/lib/domains/store";
import { logEvent } from "@/lib/observability/log";
import { isVercelConfigured } from "@/lib/integrations/vercel-domains";

type DomainOp = "add" | "verify" | "list" | "remove";

type Body = {
  op?: unknown;
  hostname?: unknown;
};

/**
 * Plan gate. Custom domains are a paying-tier feature. We read the
 * workspace's plan from organizations.plan (the column-level field
 * that's the cheapest to read; subscription state lives in the
 * jsonb `subscription` column). Free tier returns 402 with a clear
 * upgrade pitch the MCP can surface to the operator.
 */
async function isWorkspacePaying(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!row) return false;
  const plan = row.plan?.toLowerCase() ?? "free";
  return plan !== "free";
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  // Wrap everything so unexpected crashes return JSON shape (matches
  // v1.7.2 hardening pattern across /auth + /brain).
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const op = typeof body.op === "string" ? (body.op as DomainOp) : null;
    if (!op) {
      return NextResponse.json(
        { ok: false, error: "missing_op", allowed: ["add", "verify", "list", "remove"] },
        { status: 400 },
      );
    }

    // Tier gate: add/verify/remove require paying tier. Listing is
    // allowed on free tier (no-op on free since there are no domains
    // to list, but the call should succeed cleanly so dashboard UI can
    // render the upgrade CTA without first failing the API call).
    if (op !== "list") {
      const isPaying = await isWorkspacePaying(guard.orgId);
      if (!isPaying) {
        return NextResponse.json(
          {
            ok: false,
            error: "upgrade_required",
            message:
              "Custom domains require a Growth ($29/mo) or Scale ($99/mo) plan. Upgrade at /settings/billing.",
            upgrade_url: "/settings/billing",
          },
          { status: 402 },
        );
      }
    }

    // Hard requirement: Vercel must be configured for any add/verify/
    // remove. The list op works without Vercel since it reads our DB.
    if (op !== "list" && !isVercelConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "vercel_not_configured",
          message:
            "Custom domains require VERCEL_TOKEN + VERCEL_PROJECT_ID env vars on the SeldonFrame backend. Contact support.",
        },
        { status: 503 },
      );
    }

    switch (op) {
      case "add": {
        const hostname = typeof body.hostname === "string" ? body.hostname.trim() : "";
        if (!hostname) {
          return NextResponse.json(
            { ok: false, error: "missing_hostname" },
            { status: 400 },
          );
        }
        const result = await addCustomDomain({
          workspaceId: guard.orgId,
          hostname,
        });
        if (!result.ok) {
          logEvent(
            "domain_add_failed",
            { hostname, error: result.error, detail: result.detail },
            { request, orgId: guard.orgId, status: 422, severity: "warn" },
          );
          return NextResponse.json(result, { status: 422 });
        }
        logEvent(
          "domain_added",
          { hostname, domain_id: result.domain.id },
          { request, orgId: guard.orgId, status: 200 },
        );
        return NextResponse.json(result);
      }

      case "verify": {
        const hostname = typeof body.hostname === "string" ? body.hostname.trim() : "";
        if (!hostname) {
          return NextResponse.json(
            { ok: false, error: "missing_hostname" },
            { status: 400 },
          );
        }
        const result = await verifyCustomDomain({
          workspaceId: guard.orgId,
          hostname,
        });
        if (!result.ok) {
          return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 422 });
        }
        if (result.verified) {
          logEvent(
            "domain_verified",
            { hostname, domain_id: result.domain.id },
            { request, orgId: guard.orgId, status: 200 },
          );
        }
        return NextResponse.json(result);
      }

      case "list": {
        const domains = await listCustomDomainsForWorkspace(guard.orgId);
        return NextResponse.json({ ok: true, domains });
      }

      case "remove": {
        const hostname = typeof body.hostname === "string" ? body.hostname.trim() : "";
        if (!hostname) {
          return NextResponse.json(
            { ok: false, error: "missing_hostname" },
            { status: 400 },
          );
        }
        const result = await removeCustomDomain({
          workspaceId: guard.orgId,
          hostname,
        });
        if (!result.ok) {
          return NextResponse.json(result, {
            status: result.error === "not_found" ? 404 : 422,
          });
        }
        logEvent(
          "domain_removed",
          { hostname },
          { request, orgId: guard.orgId, status: 200 },
        );
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { ok: false, error: "unknown_op", op },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[/api/v1/domains] unexpected error: ${message}`);
    logEvent(
      "domain_op_crashed",
      { error: message },
      { request, orgId: guard.orgId, status: 500, severity: "error" },
    );
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 },
    );
  }
}
