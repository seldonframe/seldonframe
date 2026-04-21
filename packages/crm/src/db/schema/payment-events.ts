import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Unified audit table for Stripe webhook events. `targetType` distinguishes
// whether the event pertains to a payment_record, invoice, or subscription;
// `targetId` is the corresponding row id in this workspace. Providers that
// don't fit cleanly use `targetType: 'other'`.
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("stripe"),
    // Stripe webhooks carry an `account` field when delivered under Connect.
    // Store it so we can correlate later even if the workspace later
    // disconnects + reconnects.
    providerAccountId: text("provider_account_id"),
    providerEventId: text("provider_event_id"),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull().default("payment"),
    targetId: uuid("target_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_events_org_target_idx").on(table.orgId, table.targetType, table.targetId, desc(table.createdAt)),
    index("payment_events_org_type_idx").on(table.orgId, table.eventType, desc(table.createdAt)),
    uniqueIndex("payment_events_provider_event_uidx").on(table.provider, table.providerEventId),
  ]
);
