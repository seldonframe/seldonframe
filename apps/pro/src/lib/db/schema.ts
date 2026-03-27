import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proTemplates = pgTable("pro_templates", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proWhiteLabels = pgTable("pro_white_labels", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  orgId: uuid("org_id").notNull(),
  brandName: text("brand_name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  accentColor: text("accent_color"),
  customDomain: text("custom_domain"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proBillingAccounts = pgTable("pro_billing_accounts", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  orgId: uuid("org_id").notNull(),
  provider: text("provider").notNull().default("stripe"),
  status: text("status").notNull().default("inactive"),
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  plan: text("plan").notNull().default("free"),
  renewsAt: timestamp("renews_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proProvisioningJobs = pgTable("pro_provisioning_jobs", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  orgId: uuid("org_id"),
  templateKey: text("template_key"),
  status: text("status").notNull().default("queued"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
