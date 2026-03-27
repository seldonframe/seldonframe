import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import type { SoulLearning } from "@seldonframe/core/soul";

export const organizations = pgTable("organizations", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  soul: jsonb("soul").$type<Record<string, unknown> | null>().default(null),
  soulLearning: jsonb("soul_learning").$type<SoulLearning>().notNull().default(sql`'{}'::jsonb`),
  soulCompletedAt: timestamp("soul_completed_at", { withTimezone: true }),
  plan: text("plan").notNull().default("free"),
  emailSendsThisMonth: integer("email_sends_this_month").notNull().default(0),
  aiCallsToday: integer("ai_calls_today").notNull().default(0),
  usageResetAt: timestamp("usage_reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
