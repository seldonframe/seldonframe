// 2026-07-08 pricing-ladder — REFINED sub-account counting (post-review
// fix wave).
//
// Bug: the original enforceSubAccountLimit wiring counted every org
// with `parentAgencyId IN (agencies I own)` via
// fetchAgencyAttachedWorkspaceIds (orgs.ts). That's correct for
// "which workspaces does this agency brand" (its original purpose —
// org listing + branding rollup, still unchanged) but WRONG for the
// billing cap: two write paths attach `parentAgencyId` WITHOUT ever
// handing the workspace off to anyone:
//   1. syncAgencyProfileToPartnerAgency (agency-profile/sync-to-partner-agency.ts)
//      auto-attaches every workspace the OWNER THEMSELVES owns
//      (organizations.ownerId = the agency owner's userId) so their
//      own branding applies. These are the owner's OWN workspaces, not
//      client sub-accounts.
//   2. (not fixed here, but the same principle) any future
//      self-service branding flow that attaches an owner-owned org.
//
// A "counted sub-account" per spec invariant 5 is a org that has been
// HANDED OFF to a client — by definition, `organizations.ownerId` is
// NOT the agency owner's own userId (an anonymous/client-owned
// workspace, or a workspace owned by a different user entirely).
//
// This module does NOT change fetchAgencyAttachedWorkspaceIds's
// existing semantics (org listing / branding rollup callers are
// unaffected) — it's a SEPARATE counting query used only by the
// billing cap (enforceSubAccountLimitForUser call sites).

import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import { resolveTierForWorkspace } from "./tier-resolver";
import { enforceSubAccountLimit, type SubAccountLimitDecision } from "./limits";

function isUuidShape(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** The minimal org-row shape the counting predicate needs. Mirrors
 *  what the real query selects, so the pure predicate below and the
 *  live SQL WHERE clause stay provably equivalent. */
export type SubAccountCandidateOrg = {
  id: string;
  parentAgencyId: string | null;
  archivedAt: Date | null;
  ownerId: string | null;
};

/**
 * PURE predicate: is `org` a countable CLIENT sub-account of an agency
 * owned by `ownerUserId`? True when `parentAgencyId` is one of the
 * owner's agencies AND `archivedAt IS NULL` AND `ownerId IS DISTINCT
 * FROM ownerUserId` (a client sub-account is handed off by
 * definition — the owner's own branding attachments, e.g.
 * syncAgencyProfileToPartnerAgency's auto-attach of the owner's OWN
 * workspaces, don't count against the cap). Exported + unit-tested
 * without a DB so the live SQL query below can be trusted to encode
 * the same rule.
 */
export function isCountableClientSubAccount(
  org: SubAccountCandidateOrg,
  params: { ownerUserId: string; ownedAgencyIds: string[] },
): boolean {
  if (!org.parentAgencyId) return false;
  if (!params.ownedAgencyIds.includes(org.parentAgencyId)) return false;
  if (org.archivedAt) return false;
  if (org.ownerId === params.ownerUserId) return false;
  return true;
}

/**
 * The countable CLIENT sub-account org ids for `userId` — the ONE live
 * query encoding isCountableClientSubAccount (agencies owned by the
 * user → attached orgs, unarchived, ownerId distinct from the user).
 * The billing cap counts these (countClientSubAccountsForOwner); the
 * usage rollup (lib/billing/usage-rollup.ts) groups by them. Both go
 * through here so the WHERE clause can't drift between them
 * (2026-07-08 opus-review follow-up, item 3).
 *
 * This is a SEPARATE query from
 * lib/billing/orgs.ts::fetchAgencyAttachedWorkspaceIds (org listing /
 * branding rollup — unchanged, other callers keep its original
 * semantics). Real DB implementation; the pure predicate above is
 * what's unit-tested directly (mirrors the enforceWorkspaceLimit /
 * hasFeature DI pattern — this module's DB read has no injectable
 * seam of its own because every current caller already wraps it in
 * its own DI boundary, e.g. provisionClientWorkspaceForDeployment's
 * `enforceSubAccountCap` dep).
 */
export async function listCountableClientSubAccountOrgIds(userId: string): Promise<string[]> {
  if (!isUuidShape(userId)) return [];

  const ownedAgencies = await db
    .select({ id: partnerAgencies.id })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.ownerUserId, userId));

  if (ownedAgencies.length === 0) return [];

  const agencyIds = ownedAgencies.map((a) => a.id);

  const attached = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        inArray(organizations.parentAgencyId, agencyIds),
        isNull(organizations.archivedAt),
        or(isNull(organizations.ownerId), ne(organizations.ownerId, userId)),
      ),
    );

  return attached.map((o) => o.id);
}

/**
 * Count CLIENT sub-accounts attached to agencies owned by `userId` —
 * see isCountableClientSubAccount for the exact predicate.
 */
export async function countClientSubAccountsForOwner(userId: string): Promise<number> {
  return (await listCountableClientSubAccountOrgIds(userId)).length;
}

// ─── 2026-07-08 second post-review fix wave (item #5, non-blocking) ───
//
// The full "resolve tier + refined count + enforce cap" sequence was
// duplicated: once inline in
// deployments/actions.ts::buildProvisionDeps's enforceSubAccountCap
// closure, once in api/v1/partner-agencies/route.ts's
// enforceSubAccountLimitForUser. Extracted here as the single shared
// implementation both now call.

/** Resolve the FULL sub-account cap decision for a builder org: its
 *  effective tier (resolveTierForWorkspace — walks the agency chain,
 *  same read as enforceWorkspaceLimit) and the REFINED sub-account
 *  count for its owner (countClientSubAccountsForOwner — excludes
 *  self-branding attachments). Anonymous-workspace-as-actor orgs (no
 *  ownerId) have no partner_agencies rows to count against yet, so
 *  they read as used:0 (capped only by the tier's limit, never by a
 *  count that can't exist). Never throws — a failed count read
 *  degrades to 0 rather than blocking the caller. */
export async function resolveSubAccountCapForBuilderOrg(
  builderOrgId: string,
): Promise<SubAccountLimitDecision> {
  const [org] = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, builderOrgId))
    .limit(1);
  const ownerId = org?.ownerId ?? null;

  const tier = await resolveTierForWorkspace(builderOrgId);
  const used = ownerId ? await countClientSubAccountsForOwner(ownerId).catch(() => 0) : 0;
  return enforceSubAccountLimit({ tier, currentCount: used });
}
