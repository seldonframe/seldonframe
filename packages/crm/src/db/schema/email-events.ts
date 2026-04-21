import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { emails } from "./emails";
import { organizations } from "./organizations";

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailId: uuid("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    provider: text("provider").notNull().default("resend"),
    providerEventId: text("provider_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_events_org_email_idx").on(table.orgId, table.emailId, desc(table.createdAt)),
    index("email_events_org_type_idx").on(table.orgId, table.eventType, desc(table.createdAt)),
    uniqueIndex("email_events_provider_event_uidx").on(table.provider, table.providerEventId),
  ]
);
