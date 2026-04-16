import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const brainEvents = pgTable(
  "brain_events",
  {
    eventId: text("event_id").primaryKey().default(sql`gen_random_uuid()::text`),
    workspaceId: text("workspace_id").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    salienceScore: numeric("salience_score", { precision: 4, scale: 3, mode: "number" }).notNull().default(0.5),
    feedbackScore: integer("feedback_score"),
    anonymized: boolean("anonymized").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("brain_events_workspace_timestamp_idx").on(table.workspaceId, table.timestamp),
    index("brain_events_type_idx").on(table.eventType),
  ]
);

export const brainCompilationRuns = pgTable("brain_compilation_runs", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  articlesUpdated: text("articles_updated").array().notNull().default(sql`'{}'::text[]`),
  eventsProcessed: integer("events_processed").notNull().default(0),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
