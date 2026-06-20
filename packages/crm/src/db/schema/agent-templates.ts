import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import type { AgentBlueprint } from "./agents";

// ─── agent_templates ──────────────────────────────────────────────────────

export type AgentTemplateStatus = "draft" | "tested" | "published";

export const agentTemplates = pgTable(
  "agent_templates",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    builderOrgId: uuid("builder_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** e.g. 'voice_receptionist' */
    type: text("type").notNull(),
    blueprint: jsonb("blueprint").$type<AgentBlueprint>().notNull(),
    /** 'draft' | 'tested' | 'published' */
    status: text("status").notNull().default("draft"),
    evalScore: integer("eval_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_templates_builder_org_idx").on(table.builderOrgId),
    uniqueIndex("agent_templates_builder_slug_uniq").on(
      table.builderOrgId,
      sql`lower(${table.slug})`,
    ),
  ],
);

export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;
