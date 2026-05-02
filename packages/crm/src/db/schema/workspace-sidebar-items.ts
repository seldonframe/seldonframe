// May 2, 2026 — Composable Primitives: operator-defined sidebar nav
// items. Rendered alongside built-in items in
// components/layout/sidebar.tsx, bucketed by group_name (default
// "YOUR BLOCKS"). sort_order orders within group; lower comes first.
//
// Migration: drizzle/0034_workspace_collections.sql

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const workspaceSidebarItems = pgTable(
  "workspace_sidebar_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    icon: varchar("icon", { length: 50 }).notNull().default("file-text"),
    href: varchar("href", { length: 255 }).notNull(),
    groupName: varchar("group_name", { length: 50 })
      .notNull()
      .default("YOUR BLOCKS"),
    sortOrder: integer("sort_order").notNull().default(100),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_sidebar_items_org_order").on(
      table.organizationId,
      table.sortOrder
    ),
    unique("workspace_sidebar_items_org_href_unique").on(
      table.organizationId,
      table.href
    ),
  ]
);

export type WorkspaceSidebarItem = typeof workspaceSidebarItems.$inferSelect;
export type NewWorkspaceSidebarItem = typeof workspaceSidebarItems.$inferInsert;
