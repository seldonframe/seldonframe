import { asc, desc, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { emails } from "./emails";
import { organizations } from "./organizations";

export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    channel: text("channel").notNull(),
    content: text("content").notNull(),
    emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
    smsMessageId: uuid("sms_message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_turns_org_conv_created_idx").on(table.orgId, table.conversationId, asc(table.createdAt)),
    index("conversation_turns_org_created_idx").on(table.orgId, desc(table.createdAt)),
  ]
);
