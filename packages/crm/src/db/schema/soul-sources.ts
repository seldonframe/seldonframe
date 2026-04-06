import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const soulSources = pgTable(
  "soul_sources",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title"),
    sourceUrl: text("source_url"),
    rawContent: text("raw_content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_soul_sources_org").on(table.orgId)]
);

export const soulWiki = pgTable(
  "soul_wiki",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    lastCompiledAt: timestamp("last_compiled_at", { withTimezone: true }),
    compilationVersion: text("compilation_version").notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_soul_wiki_org_slug_unique").on(table.orgId, table.slug),
    index("idx_soul_wiki_org").on(table.orgId),
    index("idx_soul_wiki_org_slug").on(table.orgId, table.slug),
    index("idx_soul_wiki_org_category").on(table.orgId, table.category),
  ]
);
