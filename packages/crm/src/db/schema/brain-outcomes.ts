// May 1, 2026 — Measurement Layer 3: Brain learning OUTCOMES.
//
// Distinct from the existing `brainEvents` Drizzle table in ./brain.ts
// (Brain v2 — salience-scored event log keyed by workspace_id). This
// new table captures OUTCOME data per vertical: which configurations
// drove which results, partitioned by industry. The cross-workspace
// recommender reads here.
//
// Loggers in src/lib/analytics/brain.ts write here fire-and-forget.
//
// Migration: drizzle/0033_brain_outcomes.sql

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

export const brainOutcomes = pgTable(
  "brain_outcomes",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vertical: varchar("vertical", { length: 50 }),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    context: jsonb("context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outcome: varchar("outcome", { length: 50 }),
    outcomeValueCents: integer("outcome_value_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_brain_outcomes_vertical").on(
      table.vertical,
      table.eventType,
      desc(table.createdAt)
    ),
    index("idx_brain_outcomes_outcome").on(table.outcome, desc(table.createdAt)),
    index("idx_brain_outcomes_org").on(table.orgId, desc(table.createdAt)),
  ]
);

export type BrainOutcome = typeof brainOutcomes.$inferSelect;
export type NewBrainOutcome = typeof brainOutcomes.$inferInsert;
