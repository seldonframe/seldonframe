import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    status: text("status").notNull().default("lead"),
    source: text("source"),
    score: integer("score").notNull().default(0),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    /** May 1, 2026 — Client Portal V1. When true, this contact can sign
     *  in to the workspace's /portal via magic link (operator-controlled
     *  via the contact detail page). Default false: existing contacts
     *  don't get portal access until the operator opts them in. */
    portalAccessEnabled: boolean("portal_access_enabled").notNull().default(false),
    /** Touched whenever a portal magic link is verified. Surfaces in the
     *  admin contact detail page so operators can see "last seen". */
    portalLastLoginAt: timestamp("portal_last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_org_status_idx").on(table.orgId, table.status),
    index("contacts_org_assigned_to_idx").on(table.orgId, table.assignedTo),
    index("contacts_org_score_idx").on(table.orgId, desc(table.score)),
    // v1.19.0 — partial unique index on (org_id, lower(email)). NULL/empty
    // email rows are exempt (a contact can exist without an email).
    // Drizzle's uniqueIndex doesn't render expressions or partial WHERE
    // here, but we declare it so introspection sees it.
    // The actual DDL lives in drizzle/0042_contacts_lower_email_uniq.sql.
    uniqueIndex("contacts_org_lower_email_uniq")
      .on(table.orgId, sql`lower(${table.email})`)
      .where(sql`${table.email} IS NOT NULL AND ${table.email} <> ''`),
  ]
);
