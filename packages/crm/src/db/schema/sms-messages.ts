import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

export const smsMessages = pgTable(
  "sms_messages",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("twilio"),
    direction: text("direction").notNull().default("outbound"),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("queued"),
    externalMessageId: text("external_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    segments: integer("segments").notNull().default(1),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sms_messages_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("sms_messages_org_contact_idx").on(table.orgId, table.contactId),
    index("sms_messages_org_status_idx").on(table.orgId, table.status),
    index("sms_messages_org_direction_idx").on(table.orgId, table.direction),
  ]
);
