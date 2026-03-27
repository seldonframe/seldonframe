import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp, uuid, jsonb, date, integer } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { pipelines } from "./pipelines";
import { users } from "./users";

export const deals = pgTable(
  "deals",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    stage: text("stage").notNull(),
    probability: integer("probability").notNull().default(0),
    expectedCloseDate: date("expected_close_date"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("deals_org_pipeline_stage_idx").on(table.orgId, table.pipelineId, table.stage),
    index("deals_org_assigned_to_idx").on(table.orgId, table.assignedTo),
  ]
);
