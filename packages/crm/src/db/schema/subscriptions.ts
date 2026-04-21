import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("stripe"),
    // Per Connect Standard: the subscription lives on the SMB's
    // connected account.
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeAccountId: text("stripe_account_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripePriceId: text("stripe_price_id"),
    productName: text("product_name"),
    status: text("status").notNull().default("active"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    interval: text("interval").notNull().default("month"),
    intervalCount: text("interval_count").notNull().default("1"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("subscriptions_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("subscriptions_org_contact_idx").on(table.orgId, table.contactId),
    index("subscriptions_org_status_idx").on(table.orgId, table.status),
    uniqueIndex("subscriptions_stripe_sub_uidx").on(table.stripeSubscriptionId),
  ]
);
