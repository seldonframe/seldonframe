// May 2, 2026 — Composable Primitives: operator-defined pages.
// page_type drives the dynamic renderer (list / detail / form /
// static / kanban / portal). visibility scopes who can see them:
// public (subdomain catch-all), admin (dashboard catch-all), portal
// (logged-in client portal scoped by contact_id).
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
import { workspaceCollections } from "./workspace-collections";

export type WorkspacePageType =
  | "list"
  | "detail"
  | "form"
  | "static"
  | "kanban"
  | "portal";

export type WorkspacePageVisibility = "public" | "admin" | "portal";

/** content shape varies by page_type — kept as Record<string, unknown>
 *  here so the column accepts any of the discriminated shapes. The
 *  dynamic renderers narrow it at render time. */
export type WorkspacePageContent = Record<string, unknown>;

/** Style overrides shape — shared with the pixel-customization layer.
 *  Defined more strictly in lib/style/types.ts when that module
 *  ships; until then this is a permissive jsonb. */
export type WorkspacePageStyleOverrides = Record<string, unknown>;

export const workspacePages = pgTable(
  "workspace_pages",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    pageType: varchar("page_type", { length: 50 })
      .$type<WorkspacePageType>()
      .notNull(),
    visibility: varchar("visibility", { length: 20 })
      .$type<WorkspacePageVisibility>()
      .notNull()
      .default("admin"),
    collectionId: uuid("collection_id").references(
      () => workspaceCollections.id,
      { onDelete: "set null" }
    ),
    content: jsonb("content")
      .$type<WorkspacePageContent>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    styleOverrides: jsonb("style_overrides")
      .$type<WorkspacePageStyleOverrides>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Cached rendered HTML for public pages. NULL for admin/portal
     *  pages (those render dynamically per-request). */
    renderedHtml: text("rendered_html"),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_workspace_pages_org").on(table.organizationId),
    index("idx_workspace_pages_visibility").on(
      table.organizationId,
      table.visibility
    ),
    unique("workspace_pages_org_slug_unique").on(
      table.organizationId,
      table.slug
    ),
  ]
);

export type WorkspacePage = typeof workspacePages.$inferSelect;
export type NewWorkspacePage = typeof workspacePages.$inferInsert;
