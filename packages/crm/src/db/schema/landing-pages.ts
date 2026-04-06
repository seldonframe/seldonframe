import { desc, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const landingPages = pgTable(
  "landing_pages",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    pageType: text("page_type").notNull().default("page"),
    source: text("source").notNull().default("template"),
    puckData: jsonb("puck_data").$type<Record<string, unknown> | null>().default(null),
    sections: jsonb("sections").$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
    contentHtml: text("content_html"),
    contentCss: text("content_css"),
    editorData: jsonb("editor_data").$type<Record<string, unknown> | null>().default(null),
    seo: jsonb("seo").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("landing_pages_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("landing_pages_org_slug_idx").on(table.orgId, table.slug),
  ]
);
