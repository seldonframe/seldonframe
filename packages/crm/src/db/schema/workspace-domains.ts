// ============================================================================
// v1.8.0 — workspace_domains: custom hostnames for paying tiers
// ============================================================================
//
// One row per custom hostname registered against a workspace. Status
// walks pending → verified (DNS + SSL ok) | failed | removed. Vercel
// Domains API is the actual authority on verification + SSL; we mirror
// state here for the MCP tools + dashboard + proxy.ts hot-path lookup.

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type WorkspaceDomainStatus = "pending" | "verified" | "failed" | "removed";

/** Vercel's verification record shape we surface to operators. The
 *  exact fields depend on Vercel's API response — most commonly:
 *    { type: "CNAME", value: "cname.vercel-dns.com" }
 *  For apex domains Vercel may return A records instead. We store
 *  the raw shape so the dashboard's "DNS instructions" panel can
 *  render whatever Vercel told us. */
export interface DomainVerificationRecord {
  type?: string;
  name?: string;
  value?: string;
  reason?: string;
}

export const workspaceDomains = pgTable(
  "workspace_domains",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    status: text("status")
      .notNull()
      .$type<WorkspaceDomainStatus>()
      .default("pending"),
    verificationRecord: jsonb("verification_record")
      .$type<DomainVerificationRecord>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Vercel-side domain id (from POST /v9/projects/<projectId>/domains). */
    vercelDomainId: text("vercel_domain_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Globally unique among non-removed rows. We re-allow a hostname
    // after the operator removes it (status='removed'), which lets
    // workspaces switch ownership of a domain without breaking the
    // unique constraint.
    uniqueIndex("workspace_domains_hostname_uniq")
      .on(table.hostname)
      .where(sql`${table.status} != 'removed'`),
    index("workspace_domains_workspace_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    // proxy.ts hot path — only verified domains route traffic.
    index("workspace_domains_active_lookup_idx")
      .on(table.hostname)
      .where(sql`${table.status} = 'verified'`),
  ],
);
