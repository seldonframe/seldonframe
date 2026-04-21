import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { smsMessages } from "./sms-messages";

export const smsEvents = pgTable(
  "sms_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    smsMessageId: uuid("sms_message_id")
      .notNull()
      .references(() => smsMessages.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    provider: text("provider").notNull().default("twilio"),
    providerEventId: text("provider_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_events_org_msg_idx").on(table.orgId, table.smsMessageId, desc(table.createdAt)),
    index("sms_events_org_type_idx").on(table.orgId, table.eventType, desc(table.createdAt)),
    uniqueIndex("sms_events_provider_event_uidx").on(table.provider, table.providerEventId),
  ]
);
