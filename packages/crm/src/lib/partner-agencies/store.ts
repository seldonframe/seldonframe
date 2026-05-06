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
 *  workspace (each workspace pays its own subscription).
 *
 *  For agency operations, we use the AGENCY-OWNING workspace's plan
 *  — which is whichever workspace the owner_user_id signed up with.
 *  For v1.17 we look up ANY workspace owned by ownerUserId on Scale;
 *  if none, the agency stays in 'pending' status. */
async function isOwnerOnScaleTier(ownerUserId: string): Promise<boolean> {
  if (!ownerUserId) return false;
  // Look for any organization where this user is the owner AND the
  // plan is scale-or-higher. organizations.ownerId is the original
  // creator; future: extend to check membership table for non-owners.
  const rows = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.ownerId, ownerUserId));
  return rows.some((r) => SCALE_TIER_PLANS.has(r.plan ?? ""));
}

// ─── registerPartnerAgency ─────────────────────────────────────────────────

export interface RegisterAgencyInput {
  name: string;
  slug?: string;
  ownerUserId: string;
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
  if (!input.ownerUserId || typeof input.ownerUserId !== "string") {
    errors.push("ownerUserId is required");
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

  const onScale = await isOwnerOnScaleTier(input.ownerUserId);

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
      ownerUserId: input.ownerUserId,
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
  ownerUserId: string;
}

export type AttachWorkspaceResult =
  | { ok: true; workspace_id: string; agency_id: string }
  | { ok: false; error: string; validation_errors: string[] };

export async function attachWorkspaceToAgency(
  input: AttachWorkspaceInput,
): Promise<AttachWorkspaceResult> {
  if (!input.workspaceId || !input.agencyId || !input.ownerUserId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["workspaceId, agencyId, ownerUserId are all required"],
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
  if (agency.ownerUserId !== input.ownerUserId) {
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
  if (workspace.ownerId && workspace.ownerId !== input.ownerUserId) {
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
  ownerUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string; validation_errors: string[] }> {
  if (!input.workspaceId || !input.ownerUserId) {
    return {
      ok: false,
      error: "validation_failed",
      validation_errors: ["workspaceId, ownerUserId are required"],
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

  // Allow the workspace owner OR the agency owner to detach. Anyone
  // else: rejected.
  if (workspace.ownerId && workspace.ownerId !== input.ownerUserId) {
    if (workspace.parentAgencyId) {
      const [agency] = await db
        .select({ ownerUserId: partnerAgencies.ownerUserId })
        .from(partnerAgencies)
        .where(eq(partnerAgencies.id, workspace.parentAgencyId))
        .limit(1);
      if (!agency || agency.ownerUserId !== input.ownerUserId) {
        return {
          ok: false,
          error: "not_authorized",
          validation_errors: [
            "caller is neither the workspace owner nor the agency owner",
          ],
        };
      }
    } else {
      return {
        ok: false,
        error: "not_workspace_owner",
        validation_errors: ["caller does not own the workspace"],
      };
    }
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
