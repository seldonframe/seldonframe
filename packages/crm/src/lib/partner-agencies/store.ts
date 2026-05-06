// ============================================================================
// v1.17.0 — partner-agency state management
// ============================================================================
//
// Three operations:
//
//   - registerPartnerAgency({ name, slug?, ownerUserId, ... })
//     Plan-gates on the owner's tier (Scale only). Creates the agency
//     in 'pending' status; flips to 'active' immediately when the
//     plan check passes (current owner is on Scale). Returns the
//     created row + the DNS records the agency needs to set up
//     for v1.18 (sender email) + v1.20 (custom domain) — but neither
//     is required at registration; both default to NULL until the
//     agency configures them later.
//
//   - attachWorkspaceToAgency({ workspaceId, agencyId, ownerUserId })
//     Sets organizations.parent_agency_id. Verifies the caller owns
//     the agency (otherwise anyone with a workspace_id could attach
//     someone else's workspace to their agency). Verifies the
//     workspace is owned by the caller (same reason).
//
//   - detachWorkspaceFromAgency({ workspaceId, ownerUserId })
//     Reverses the above. Sets parent_agency_id = null; chrome falls
//     back to SF defaults on next render.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import type { PartnerAgency } from "@/db/schema";

// ─── plan gate ─────────────────────────────────────────────────────────────

const SCALE_TIER_PLANS = new Set(["scale", "Scale", "SCALE"]);

/** Check whether the user OWNING this workspace is on Scale tier.
 *  We check the workspace's plan column rather than per-user state
 *  because a user can own multiple workspaces and the plan is per-
 *  workspace (each workspace pays its own subscription). */
async function isOwnerOnScaleTier(ownerUserId: string): Promise<boolean> {
  if (!ownerUserId) return false;
  const rows = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.ownerId, ownerUserId));
  return rows.some((r) => SCALE_TIER_PLANS.has(r.plan ?? ""));
}

/** v1.19 — polymorphic-ownership scale check. When the agency is
 *  anchored to a workspace (anonymous-workspace ownership), we
 *  check THAT workspace's plan directly. Simpler than the user
 *  case (no need to scan multiple workspaces). */
async function isWorkspaceOnScaleTier(workspaceId: string): Promise<boolean> {
  if (!workspaceId) return false;
  const [row] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  return SCALE_TIER_PLANS.has(row?.plan ?? "");
}

// ─── registerPartnerAgency ─────────────────────────────────────────────────

export interface RegisterAgencyInput {
  name: string;
  slug?: string;
  /** v1.19 — polymorphic ownership. At least one of ownerUserId or
   *  ownerWorkspaceId must be set. ownerUserId is preferred when
   *  available (real human identity); ownerWorkspaceId is the
   *  fallback for anonymous workspaces (create_workspace_v2 path)
   *  that haven't been claimed by a user yet. */
  ownerUserId?: string;
  ownerWorkspaceId?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string;
  supportUrl?: string;
  hidePoweredByBadge?: boolean;
}

export type RegisterAgencyResult =
  | {
      ok: true;
      agency: PartnerAgency;
      // Surfaced when the agency was created in 'pending' status
      // because the owner's plan isn't yet on Scale. Operator can
      // upgrade and re-register or wait for the plan-gate to flip.
      gated_pending: boolean;
    }
  | { ok: false; error: string; validation_errors: string[] };

export async function registerPartnerAgency(
  input: RegisterAgencyInput,
): Promise<RegisterAgencyResult> {
  const errors: string[] = [];
  if (!input.name || typeof input.name !== "string" || input.name.trim().length < 2) {
    errors.push("name is required and must be 2+ chars");
  }
  // v1.19 — polymorphic ownership. Need at least one identity.
  if (!input.ownerUserId && !input.ownerWorkspaceId) {
    errors.push(
      "at least one of ownerUserId or ownerWorkspaceId must be provided",
    );
  }
  if (errors.length > 0) {
    return { ok: false, error: "validation_failed", validation_errors: errors };
  }

  const slug = (input.slug ?? slugify(input.name)).toLowerCase();
  if (!slug || slug.length < 2) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["slug derived from name is too short; pass an explicit slug"],
    };
  }

  // Check slug uniqueness against non-archived rows.
  const existing = await db
    .select({ id: partnerAgencies.id })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.slug, slug))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: "slug_already_taken",
      validation_errors: [`slug "${slug}" already used by another agency`],
    };
  }

  // v1.19 — polymorphic plan gate. User identity is preferred when
  // present (real human, owns multiple workspaces possibly); workspace
  // identity is the fallback (anonymous-workspace-as-actor).
  const onScale = input.ownerUserId
    ? await isOwnerOnScaleTier(input.ownerUserId)
    : input.ownerWorkspaceId
      ? await isWorkspaceOnScaleTier(input.ownerWorkspaceId)
      : false;

  const [created] = await db
    .insert(partnerAgencies)
    .values({
      name: input.name.trim(),
      slug,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      accentColor: input.accentColor ?? null,
      supportEmail: input.supportEmail ?? null,
      supportUrl: input.supportUrl ?? null,
      ownerUserId: input.ownerUserId ?? null,
      ownerWorkspaceId: input.ownerWorkspaceId ?? null,
      status: onScale ? "active" : "pending",
      hidePoweredByBadge: input.hidePoweredByBadge ?? false,
    })
    .returning();

  if (!created) {
    return {
      ok: false,
      error: "insert_failed",
      validation_errors: ["agency row insert returned no row"],
    };
  }

  return { ok: true, agency: created, gated_pending: !onScale };
}

// ─── attachWorkspaceToAgency ───────────────────────────────────────────────

export interface AttachWorkspaceInput {
  workspaceId: string;
  agencyId: string;
  /** v1.19 — polymorphic ownership. At least one identity must be set. */
  ownerUserId?: string;
  ownerWorkspaceId?: string;
}

export type AttachWorkspaceResult =
  | { ok: true; workspace_id: string; agency_id: string }
  | { ok: false; error: string; validation_errors: string[] };

export async function attachWorkspaceToAgency(
  input: AttachWorkspaceInput,
): Promise<AttachWorkspaceResult> {
  if (!input.workspaceId || !input.agencyId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["workspaceId, agencyId are required"],
    };
  }
  if (!input.ownerUserId && !input.ownerWorkspaceId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: [
        "at least one of ownerUserId or ownerWorkspaceId must be provided",
      ],
    };
  }

  // Verify the agency exists + the caller owns it. Without this
  // check, anyone with a workspace_id could attach someone else's
  // workspace to their own agency.
  const [agency] = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.id, input.agencyId))
    .limit(1);
  if (!agency) {
    return {
      ok: false,
      error: "agency_not_found",
      validation_errors: [`agency ${input.agencyId} does not exist`],
    };
  }
  // v1.19 polymorphic-ownership match: caller is the agency owner if
  // either their userId matches agency.ownerUserId OR their
  // workspaceId matches agency.ownerWorkspaceId.
  const matchesUser =
    input.ownerUserId != null && agency.ownerUserId === input.ownerUserId;
  const matchesWorkspace =
    input.ownerWorkspaceId != null &&
    agency.ownerWorkspaceId === input.ownerWorkspaceId;
  if (!matchesUser && !matchesWorkspace) {
    return {
      ok: false,
      error: "not_agency_owner",
      validation_errors: ["caller does not own the agency"],
    };
  }
  if (agency.status !== "active") {
    return {
      ok: false,
      error: "agency_not_active",
      validation_errors: [
        `agency status is "${agency.status}" — can only attach workspaces when status is "active". Upgrade the owning workspace to Scale tier and re-register.`,
      ],
    };
  }

  // Verify the workspace exists + the caller owns it.
  const [workspace] = await db
    .select({ id: organizations.id, ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, input.workspaceId))
    .limit(1);
  if (!workspace) {
    return {
      ok: false,
      error: "workspace_not_found",
      validation_errors: [`workspace ${input.workspaceId} does not exist`],
    };
  }
  // v1.19 — for anonymous workspaces (workspace.ownerId === null), we
  // accept the bearer-workspace identity match: the caller's
  // workspaceId equals the target workspace.id (you own a workspace
  // by holding its bearer key). For claimed workspaces, the human
  // owner must match.
  const ownsByUserId =
    workspace.ownerId != null &&
    input.ownerUserId != null &&
    workspace.ownerId === input.ownerUserId;
  const ownsBySelfWorkspace =
    workspace.ownerId == null &&
    input.ownerWorkspaceId != null &&
    input.ownerWorkspaceId === input.workspaceId;
  if (!ownsByUserId && !ownsBySelfWorkspace) {
    return {
      ok: false,
      error: "not_workspace_owner",
      validation_errors: ["caller does not own the workspace"],
    };
  }

  await db
    .update(organizations)
    .set({ parentAgencyId: input.agencyId, updatedAt: new Date() })
    .where(eq(organizations.id, input.workspaceId));

  return {
    ok: true,
    workspace_id: input.workspaceId,
    agency_id: input.agencyId,
  };
}

// ─── detachWorkspaceFromAgency ─────────────────────────────────────────────

export async function detachWorkspaceFromAgency(input: {
  workspaceId: string;
  /** v1.19 — polymorphic ownership. At least one identity must be set. */
  ownerUserId?: string;
  ownerWorkspaceId?: string;
}): Promise<{ ok: true } | { ok: false; error: string; validation_errors: string[] }> {
  if (!input.workspaceId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["workspaceId is required"],
    };
  }
  if (!input.ownerUserId && !input.ownerWorkspaceId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: [
        "at least one of ownerUserId or ownerWorkspaceId must be provided",
      ],
    };
  }

  const [workspace] = await db
    .select({
      id: organizations.id,
      ownerId: organizations.ownerId,
      parentAgencyId: organizations.parentAgencyId,
    })
    .from(organizations)
    .where(eq(organizations.id, input.workspaceId))
    .limit(1);
  if (!workspace) {
    return {
      ok: false,
      error: "workspace_not_found",
      validation_errors: [],
    };
  }

  // v1.19 polymorphic ownership: allow detach when ANY of these match:
  //   - caller's userId matches workspace.ownerId (claimed workspace, human owner)
  //   - caller's workspaceId equals workspace.id and workspace.ownerId is null
  //     (anonymous-workspace-as-actor owning itself)
  //   - caller's userId matches the agency owner's userId
  //   - caller's workspaceId matches the agency owner's workspaceId
  const ownsWorkspaceByUserId =
    workspace.ownerId != null &&
    input.ownerUserId != null &&
    workspace.ownerId === input.ownerUserId;
  const ownsWorkspaceBySelf =
    workspace.ownerId == null &&
    input.ownerWorkspaceId != null &&
    input.ownerWorkspaceId === input.workspaceId;

  let isAuthorized = ownsWorkspaceByUserId || ownsWorkspaceBySelf;

  if (!isAuthorized && workspace.parentAgencyId) {
    const [agency] = await db
      .select({
        ownerUserId: partnerAgencies.ownerUserId,
        ownerWorkspaceId: partnerAgencies.ownerWorkspaceId,
      })
      .from(partnerAgencies)
      .where(eq(partnerAgencies.id, workspace.parentAgencyId))
      .limit(1);
    if (agency) {
      const matchesAgencyByUser =
        input.ownerUserId != null &&
        agency.ownerUserId === input.ownerUserId;
      const matchesAgencyByWorkspace =
        input.ownerWorkspaceId != null &&
        agency.ownerWorkspaceId === input.ownerWorkspaceId;
      isAuthorized = matchesAgencyByUser || matchesAgencyByWorkspace;
    }
  }

  if (!isAuthorized) {
    return {
      ok: false,
      error: "not_authorized",
      validation_errors: [
        "caller is neither the workspace owner nor the agency owner",
      ],
    };
  }

  await db
    .update(organizations)
    .set({ parentAgencyId: null, updatedAt: new Date() })
    .where(eq(organizations.id, input.workspaceId));

  return { ok: true };
}

// ─── small util: slugify ───────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
