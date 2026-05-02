// May 2, 2026 — Composable Primitives: rows in a dynamic collection.
// data is jsonb shaped per the parent collection's schema. contact_id
// is set for collections like enrollments / invoices that anchor to a
// CRM contact (and gates portal access by contact_id =
// session.contact.id when the collection has enable_portal_access).
//
// Migration: drizzle/0034_workspace_collections.sql

import { sql, desc } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { workspaceCollections } from "./workspace-collections";
import { contacts } from "./contacts";

export const workspaceRecords = pgTable(
  "workspace_records",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => workspaceCollections.id, { onDelete: "cascade" }),
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Free-form string used by kanban views to bucket records into
     *  columns. Mirror the value of whatever field
     *  `collection.settings.kanban_field` points at. */
    status: varchar("status", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_records_collection_created").on(
      table.collectionId,
      desc(table.createdAt)
    ),
    index("idx_workspace_records_org_collection").on(
      table.organizationId,
      table.collectionId
    ),
    index("idx_workspace_records_contact").on(table.contactId),
    index("idx_workspace_records_status").on(table.collectionId, table.status),
    // gin index on data is created in the SQL migration; Drizzle's
    // pg-core helpers don't expose `using gin (...)` directly. The
    // index is honored by the planner regardless of whether Drizzle
    // knows about it at the type layer.
  ]
);

export type WorkspaceRecord = typeof workspaceRecords.$inferSelect;
export type NewWorkspaceRecord = typeof workspaceRecords.$inferInsert;
