// May 2, 2026 — Composable Primitives: dynamic table definitions per
// workspace. Each row defines a "collection" (courses, invoices,
// reviews, etc.) whose row data lives in workspace_records keyed by
// collection_id, shaped per the .schema field array.
//
// Migration: drizzle/0034_workspace_collections.sql

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** Field type union used inside `WorkspaceCollection.schema`. */
export type CollectionFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "url"
  | "select"
  | "multi_select"
  | "reference"
  | "file";

export interface CollectionFieldDefinition {
  key: string;
  label: string;
  type: CollectionFieldType;
  required?: boolean;
  options?: string[];
  /** For type === "reference": collection slug or "contacts". */
  reference?: string;
  default_value?: unknown;
  placeholder?: string;
}

export interface CollectionSettings {
  default_sort?: string;
  default_sort_direction?: "asc" | "desc";
  default_view?: "table" | "kanban" | "grid";
  /** For kanban view: which select field defines the columns. */
  kanban_field?: string;
  /** When true, this collection's records can be surfaced in the
   *  client portal scoped by contact_id = session.contact.id. */
  enable_portal_access?: boolean;
}

export const workspaceCollections = pgTable(
  "workspace_collections",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }).notNull().default("file-text"),
    schema: jsonb("schema")
      .$type<CollectionFieldDefinition[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    settings: jsonb("settings")
      .$type<CollectionSettings>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_collections_org").on(table.organizationId),
    unique("workspace_collections_org_slug_unique").on(
      table.organizationId,
      table.slug
    ),
  ]
);

export type WorkspaceCollection = typeof workspaceCollections.$inferSelect;
export type NewWorkspaceCollection = typeof workspaceCollections.$inferInsert;
