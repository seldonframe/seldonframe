import { sql } from "drizzle-orm";
import { boolean, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export type PaymentsSchemaRefs = {
  orgId: () => AnyPgColumn;
  contactId: () => AnyPgColumn;
};

export function createPaymentsSchema(refs: PaymentsSchemaRefs) {
  const stripeConnections = pgTable(
    "stripe_connections",
    {
      id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
      orgId: uuid("org_id").notNull().references(refs.orgId, { onDelete: "cascade" }),
      stripeAccountId: text("stripe_account_id").notNull(),
      accessToken: text("access_token"),
      stripePublishableKey: text("stripe_publishable_key"),
      isActive: boolean("is_active").notNull().default(true),
      connectedAt: timestamp("connected_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex("stripe_connections_org_account_uidx").on(table.orgId, table.stripeAccountId),
      index("stripe_connections_org_active_idx").on(table.orgId, table.isActive),
    ]
  );

  const paymentRecords = pgTable(
    "payment_records",
    {
      id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
      orgId: uuid("org_id").notNull().references(refs.orgId, { onDelete: "cascade" }),
      contactId: uuid("contact_id").references(refs.contactId, { onDelete: "set null" }),
      stripePaymentIntentId: text("stripe_payment_intent_id"),
      amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
      currency: text("currency").notNull().default("USD"),
      status: text("status").notNull().default("pending"),
      sourceBlock: text("source_block").notNull(),
      sourceId: text("source_id"),
      metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex("payment_records_intent_uidx").on(table.stripePaymentIntentId),
      index("payment_records_org_contact_idx").on(table.orgId, table.contactId),
      index("payment_records_org_status_idx").on(table.orgId, table.status),
      index("payment_records_org_source_idx").on(table.orgId, table.sourceBlock),
    ]
  );

  const subscriptions = pgTable(
    "subscriptions",
    {
      id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
      orgId: uuid("org_id").notNull().references(refs.orgId, { onDelete: "cascade" }),
      contactId: uuid("contact_id").references(refs.contactId, { onDelete: "set null" }),
      stripeSubscriptionId: text("stripe_subscription_id").notNull(),
      planName: text("plan_name").notNull(),
      amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
      currency: text("currency").notNull().default("USD"),
      interval: text("interval").notNull(),
      status: text("status").notNull().default("active"),
      currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      uniqueIndex("subscriptions_org_stripe_uidx").on(table.orgId, table.stripeSubscriptionId),
      index("subscriptions_org_contact_idx").on(table.orgId, table.contactId),
      index("subscriptions_org_status_idx").on(table.orgId, table.status),
    ]
  );

  return {
    stripeConnections,
    paymentRecords,
    subscriptions,
  };
}
