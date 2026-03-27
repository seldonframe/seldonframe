import { desc, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { users } from "./users";

export const activities = pgTable(
  "activities",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    subject: text("subject"),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activities_org_contact_created_idx").on(table.orgId, table.contactId, desc(table.createdAt)),
    index("activities_org_type_idx").on(table.orgId, table.type),
  ]
);
