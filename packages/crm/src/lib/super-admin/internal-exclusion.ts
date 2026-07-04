// Task 10 — internal-account exclusion for the super-admin activation
// funnel. SeldonFrame's own team + agency workspaces (used for demos,
// QA, preview pitches) show up in raw counts and quietly inflate every
// stage. This module is the single, pure source of truth for "is this
// row internal" so activation.ts (and any future funnel) can exclude
// them without re-deriving the predicate.
//
// Pure — no DB access, no env reads beyond the object passed in. Callers
// read `process.env` and pass it in explicitly, which keeps this file
// trivially testable and keeps secrets out of it entirely (it only ever
// sees user/org UUIDs, never API keys or credentials).

import { sql, type SQL } from "drizzle-orm";
import { organizations } from "@/db/schema";

export type InternalIds = {
  /** SeldonFrame team-member user ids (owner_id / parent_user_id matches). */
  userIds: string[];
  /** SeldonFrame's own agency id (parent_agency_id match), if configured. */
  agencyId: string | null;
};

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Parses the two env vars that identify SeldonFrame's internal accounts:
 *   - SF_INTERNAL_USER_IDS: comma-separated user UUIDs (team members).
 *   - SF_INTERNAL_AGENCY_ID: a single agency UUID (SeldonFrame's own
 *     partner-agency row, if team workspaces hang off one).
 *
 * Absent/empty env → { userIds: [], agencyId: null }, which combined
 * with `internalOrgPredicateSql` degrades to "only preview-mode orgs
 * are internal" (still a meaningful exclusion — preview/pitch
 * workspaces are never real activation).
 */
export function parseInternalIds(env: {
  SF_INTERNAL_USER_IDS?: string;
  SF_INTERNAL_AGENCY_ID?: string;
}): InternalIds {
  const userIds = splitCsv(env.SF_INTERNAL_USER_IDS);
  const agencyIdRaw = env.SF_INTERNAL_AGENCY_ID?.trim();
  const agencyId = agencyIdRaw && agencyIdRaw.length > 0 ? agencyIdRaw : null;
  return { userIds, agencyId };
}

/**
 * Builds the drizzle `sql` fragment (usable inside a WHERE clause) that
 * is true when an `organizations` row is internal:
 *
 *   owner_id = ANY(userIds) OR parent_user_id = ANY(userIds)
 *     OR parent_agency_id = agencyId OR preview_mode = true
 *
 * Every id is bound as a parameter (via drizzle's `sql` template /
 * `sql.join`) — never string-concatenated — so this is not injectable.
 * With empty userIds and a null agencyId, only `preview_mode = true`
 * applies (the ANY/equality clauses are omitted, not passed empty,
 * since `= ANY('{}')` is valid but equality against NULL would silently
 * never match — omitting is clearer than relying on that).
 */
export function internalOrgPredicateSql(ids: InternalIds): SQL {
  const clauses: SQL[] = [sql`${organizations.previewMode} = true`];

  if (ids.userIds.length > 0) {
    const idList = sql.join(
      ids.userIds.map((id) => sql`${id}`),
      sql`, `,
    );
    clauses.push(sql`${organizations.ownerId} = ANY(ARRAY[${idList}]::uuid[])`);
    clauses.push(sql`${organizations.parentUserId} = ANY(ARRAY[${idList}]::uuid[])`);
  }

  if (ids.agencyId) {
    clauses.push(sql`${organizations.parentAgencyId} = ${ids.agencyId}`);
  }

  return sql.join(
    clauses.map((clause) => sql`(${clause})`),
    sql` OR `,
  );
}
