// May 1, 2026 — Measurement Layer 2: product analytics events.
//
// One row per product event. Property bag is jsonb so schema doesn't
// churn every time we want to capture a new dimension. Loggers in
// src/lib/analytics/track.ts write here fire-and-forget — failures
// log and move on, never break the product.
//
// Migration: drizzle/0032_seldonframe_events.sql

import { sql, desc } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const seldonframeEvents = pgTable(
  "seldonframe_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    event: varchar("event", { length: 100 }).notNull(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id"),
    properties: jsonb("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sf_events_event_time").on(table.event, desc(table.createdAt)),
    index("idx_sf_events_org").on(table.orgId, desc(table.createdAt)),
    index("idx_sf_events_created").on(desc(table.createdAt)),
  ]
);

export type SeldonframeEvent = typeof seldonframeEvents.$inferSelect;
export type NewSeldonframeEvent = typeof seldonframeEvents.$inferInsert;
