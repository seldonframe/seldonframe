import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const conversations = pgTable(
  "conversations",
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
    channel: text("channel").notNull(),
    status: text("status").notNull().default("active"),
    subject: text("subject"),
    assistantState: jsonb("assistant_state").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversations_org_contact_idx").on(table.orgId, table.contactId),
    index("conversations_org_status_last_turn_idx").on(table.orgId, table.status, desc(table.lastTurnAt)),
  ]
);
