import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    status: text("status").notNull().default("lead"),
    source: text("source"),
    score: integer("score").notNull().default(0),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_org_status_idx").on(table.orgId, table.status),
    index("contacts_org_assigned_to_idx").on(table.orgId, table.assignedTo),
    index("contacts_org_score_idx").on(table.orgId, desc(table.score)),
  ]
);
