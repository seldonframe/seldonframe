// v1.17.0 — partner agencies (white-label CRM resellers).
// See drizzle/0040_partner_agencies.sql for table-level documentation.

import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const partnerAgencies = pgTable(
  "partner_agencies",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color"),
    accentColor: text("accent_color"),
    supportEmail: text("support_email"),
    supportUrl: text("support_url"),
    // v1.18+ verified sender — populated when Resend confirms DNS.
    senderEmailAddress: text("sender_email_address"),
    resendDomainId: text("resend_domain_id"),
    verifiedSenderAt: timestamp("verified_sender_at", { withTimezone: true }),
    // v1.20+ agency-level custom domain (e.g. crm.acmeai.com).
    agencyDomain: text("agency_domain"),
    agencyDomainVerifiedAt: timestamp("agency_domain_verified_at", { withTimezone: true }),
    // Plan gate + lifecycle.
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** 'pending' | 'active' | 'suspended' | 'archived'.
     *  - pending:   newly registered, not yet activated by plan check
     *  - active:    Scale-tier confirmed; chrome substitution live
     *  - suspended: plan dropped below Scale; chrome falls back to SF
     *  - archived:  agency removed; data retained for audit */
    status: text("status").notNull().default("pending"),
    hidePoweredByBadge: boolean("hide_powered_by_badge").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("partner_agencies_slug_uniq").on(table.slug),
    index("partner_agencies_owner_idx").on(table.ownerUserId, table.status),
  ],
);

export type PartnerAgency = typeof partnerAgencies.$inferSelect;
export type NewPartnerAgency = typeof partnerAgencies.$inferInsert;
