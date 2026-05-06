// v1.17.0 — POST /api/v1/partner-agencies
//
// Two ops via `op` field:
//   { op: "register",  name, slug?, ... }
//   { op: "attach",    workspace_id, agency_id }
//   { op: "detach",    workspace_id }
//
// Auth: workspace bearer token. The bearer's owning user is treated
// as the agency operator. The agency itself isn't a workspace; we
// resolve owner_user_id from the bearer's session (organizations.
// owner_id of the bearer's workspace).

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  registerPartnerAgency,
  attachWorkspaceToAgency,
  detachWorkspaceFromAgency,
} from "@/lib/partner-agencies/store";

type Body = {
  op?: unknown;
  name?: unknown;
  slug?: unknown;
  logo_url?: unknown;
  primary_color?: unknown;
  accent_color?: unknown;
  support_email?: unknown;
  support_url?: unknown;
  hide_powered_by_badge?: unknown;
  workspace_id?: unknown;
  agency_id?: unknown;
};

const VALID_OPS = ["register", "attach", "detach"] as const;
type Op = (typeof VALID_OPS)[number];

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const op =
    typeof body.op === "string" && (VALID_OPS as readonly string[]).includes(body.op)
      ? (body.op as Op)
      : null;
  if (!op) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_op",
        allowed: VALID_OPS,
      },
      { status: 400 },
    );
  }

  // Resolve owner_user_id from the bearer's workspace. The bearer is
  // workspace-scoped; the workspace owner is the human who controls
  // the agency.
  const [orgRow] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, guard.orgId))
    .limit(1);
  const ownerUserId = orgRow?.ownerId ?? null;
  if (!ownerUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_owner_for_workspace",
        message:
          "The workspace bearer doesn't map to an owning user. Agency operations require an owner_id on the workspace.",
      },
      { status: 403 },
    );
  }

  if (op === "register") {
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["name"] },
        { status: 400 },
      );
    }
    const result = await registerPartnerAgency({
      name: body.name,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      ownerUserId,
      logoUrl: typeof body.logo_url === "string" ? body.logo_url : undefined,
      primaryColor:
        typeof body.primary_color === "string" ? body.primary_color : undefined,
      accentColor:
        typeof body.accent_color === "string" ? body.accent_color : undefined,
      supportEmail:
        typeof body.support_email === "string" ? body.support_email : undefined,
      supportUrl:
        typeof body.support_url === "string" ? body.support_url : undefined,
      hidePoweredByBadge:
        typeof body.hide_powered_by_badge === "boolean"
          ? body.hide_powered_by_badge
          : undefined,
    });
    if (!result.ok) {
      logEvent(
        "v17_register_partner_agency_failed",
        { error: result.error, validation_errors: result.validation_errors },
        { request, orgId: guard.orgId, status: 422, severity: "warn" },
      );
      return NextResponse.json(result, { status: 422 });
    }
    logEvent(
      "v17_register_partner_agency_succeeded",
      {
        agency_id: result.agency.id,
        slug: result.agency.slug,
        gated_pending: result.gated_pending,
      },
      { request, orgId: guard.orgId, status: 200 },
    );
    return NextResponse.json(
      {
        ok: true,
        agency: result.agency,
        gated_pending: result.gated_pending,
        next_steps: result.gated_pending
          ? [
              "Agency created in 'pending' status because no workspace owned by the caller is on Scale tier.",
              "Upgrade a workspace to Scale ($99/mo) at /settings/billing, then call register_partner_agency again or use the v1.19 reactivation tool.",
            ]
          : [
              "Agency is active. Attach workspaces with attach_workspace_to_agency({ workspace_id, agency_id }).",
              "Set up the agency's sender domain in v1.18 (verify_partner_agency_sender_domain) so emails branded as the agency can actually be delivered.",
              "Set up the agency's custom domain in v1.20 (add_partner_agency_domain) so clients log in at crm.<agency>.com instead of app.seldonframe.com.",
            ],
      },
      { status: 200 },
    );
  }

  if (op === "attach") {
    if (typeof body.workspace_id !== "string" || typeof body.agency_id !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["workspace_id", "agency_id"],
        },
        { status: 400 },
      );
    }
    const result = await attachWorkspaceToAgency({
      workspaceId: body.workspace_id,
      agencyId: body.agency_id,
      ownerUserId,
    });
    if (!result.ok) {
      logEvent(
        "v17_attach_workspace_to_agency_failed",
        { error: result.error, validation_errors: result.validation_errors },
        { request, orgId: guard.orgId, status: 422, severity: "warn" },
      );
      return NextResponse.json(result, { status: 422 });
    }
    logEvent(
      "v17_attach_workspace_to_agency_succeeded",
      { workspace_id: result.workspace_id, agency_id: result.agency_id },
      { request, orgId: guard.orgId, status: 200 },
    );
    return NextResponse.json(result, { status: 200 });
  }

  // op === "detach"
  if (typeof body.workspace_id !== "string") {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["workspace_id"],
      },
      { status: 400 },
    );
  }
  const result = await detachWorkspaceFromAgency({
    workspaceId: body.workspace_id,
    ownerUserId,
  });
  if (!result.ok) {
    logEvent(
      "v17_detach_workspace_from_agency_failed",
      { error: result.error, validation_errors: result.validation_errors },
      { request, orgId: guard.orgId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }
  logEvent(
    "v17_detach_workspace_from_agency_succeeded",
    { workspace_id: body.workspace_id },
    { request, orgId: guard.orgId, status: 200 },
  );
  return NextResponse.json(result, { status: 200 });
}
