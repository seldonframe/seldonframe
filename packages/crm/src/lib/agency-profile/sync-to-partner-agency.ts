// 2026-05-18 — Agency-wide white-label sync.
//
// When an operator saves their agency profile at /settings/agency-profile,
// we ALSO upsert a partner_agencies row owned by them and attach all
// their unparented workspaces to it. That makes
// getEffectiveBrandingForWorkspace() return the operator's logo /
// color / name for every workspace they own — the agency-wide
// white-label expectation.
//
// Why this exists separate from registerPartnerAgency() in store.ts:
//   - registerPartnerAgency() plan-gates on Scale tier (chrome
//     substitution is paid). For the agency-wide white-label "just
//     replace SF logo with my logo on all my workspaces" use case,
//     the operator's expectation is "it just works." We bypass the
//     plan gate here by writing status='active' directly. Future:
//     gate the verified-sender / agency-domain features behind plan,
//     but free-tier still gets the logo swap.
//   - Idempotency: this is called on every /settings/agency-profile
//     save, so we use an upsert pattern keyed on ownerUserId.
//
// Soft-fail philosophy: every step is wrapped so a partial failure
// (slug collision, race) doesn't block the user-profile write that
// triggered this call. The user sees their profile saved; chrome
// substitution catches up on the next page render once the sync
// succeeds. Worst case the operator re-saves to retry.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import type { AgencyProfile } from "@/db/schema/agency-profile";

/** Convert "Acme & Co." → "acme-co". Same algorithm as
 *  partner-agencies/store.ts::slugify — duplicated here to avoid
 *  exporting an internal helper. */
function slugify(name: string, suffix: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  // Append a short stable suffix derived from the user id so two
  // agencies named "Acme" don't collide. Format: <slug>-<6chars>.
  return base ? `${base}-${suffix}` : `agency-${suffix}`;
}

export type SyncAgencyProfileToPartnerAgencyInput = {
  userId: string;
  profile: AgencyProfile;
};

export type SyncAgencyProfileToPartnerAgencyResult =
  | { ok: true; agencyId: string; attachedWorkspaces: number; created: boolean }
  | { ok: false; error: string };

export async function syncAgencyProfileToPartnerAgency(
  input: SyncAgencyProfileToPartnerAgencyInput,
): Promise<SyncAgencyProfileToPartnerAgencyResult> {
  if (!input.userId) {
    return { ok: false, error: "missing_user_id" };
  }
  const name = (input.profile.name ?? "").trim();
  if (!name) {
    // No agency name means nothing meaningful to chrome with —
    // skip the partner_agencies upsert. The user-profile write
    // still landed, so the operator can fix this and re-save.
    return { ok: false, error: "missing_agency_name" };
  }

  // 1. Look up existing partner_agencies row for this owner. Pick
  //    the active one if present, else any non-archived row.
  const existingRows = await db
    .select()
    .from(partnerAgencies)
    .where(eq(partnerAgencies.ownerUserId, input.userId));
  const existing =
    existingRows.find((r) => r.status === "active") ??
    existingRows.find((r) => r.status !== "archived") ??
    null;

  let agencyId: string;
  let created = false;

  if (existing) {
    // UPDATE existing row in place. Preserve the slug + status (no
    // de-activation here — operators stay active as long as they're
    // editing their profile).
    await db
      .update(partnerAgencies)
      .set({
        name,
        logoUrl: input.profile.logo_url ?? null,
        primaryColor: input.profile.brand_color ?? null,
        supportUrl: input.profile.website_url ?? null,
        status: existing.status === "archived" ? existing.status : "active",
        updatedAt: new Date(),
      })
      .where(eq(partnerAgencies.id, existing.id));
    agencyId = existing.id;
  } else {
    // INSERT new row with status='active'. Free-tier white-label —
    // see module-level rationale for why we bypass the Scale plan
    // gate that registerPartnerAgency() enforces.
    const slugSuffix = input.userId.slice(0, 6).toLowerCase();
    const slug = slugify(name, slugSuffix);
    try {
      const [inserted] = await db
        .insert(partnerAgencies)
        .values({
          name,
          slug,
          logoUrl: input.profile.logo_url ?? null,
          primaryColor: input.profile.brand_color ?? null,
          supportUrl: input.profile.website_url ?? null,
          ownerUserId: input.userId,
          status: "active",
        })
        .returning({ id: partnerAgencies.id });
      if (!inserted) {
        return { ok: false, error: "insert_returned_no_row" };
      }
      agencyId = inserted.id;
      created = true;
    } catch (err) {
      // Slug collision is the most likely failure mode. Surface it
      // so callers can decide whether to retry with a different
      // suffix or just give up. Don't throw — this is a non-fatal
      // background sync.
      return {
        ok: false,
        error: `insert_failed:${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 2. Auto-attach every workspace the user owns that doesn't
  //    already have a parent_agency_id set. We DON'T detach existing
  //    parent_agency_id pointers — operators may have intentionally
  //    attached a workspace to a different agency, and clobbering
  //    that would be surprising.
  const attached = await db
    .update(organizations)
    .set({ parentAgencyId: agencyId, updatedAt: new Date() })
    .where(
      and(
        eq(organizations.ownerId, input.userId),
        isNull(organizations.parentAgencyId),
      ),
    )
    .returning({ id: organizations.id });

  return {
    ok: true,
    agencyId,
    attachedWorkspaces: attached.length,
    created,
  };
}
