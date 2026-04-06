import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  formName: text("form_name").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  score: integer("score").notNull().default(0),
  scoredFields: jsonb("scored_fields").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
