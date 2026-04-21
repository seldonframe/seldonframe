import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp, uuid, boolean, jsonb } from "drizzle-orm/pg-core";
import { bookings } from "./bookings";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const stripeConnections = pgTable(
  "stripe_connections",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    accessToken: text("access_token"),
    stripePublishableKey: text("stripe_publishable_key"),
    isActive: boolean("is_active").notNull().default(true),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("stripe_connections_org_active_idx").on(table.orgId, table.isActive)]
);

export const paymentRecords = pgTable(
  "payment_records",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // Connect Standard: payment is on the SMB's connected account.
    // Persist account id so webhook handlers can look up the connection
    // even after a workspace has disconnected + reconnected.
    stripeAccountId: text("stripe_account_id"),
    stripeChargeId: text("stripe_charge_id"),
    refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    disputedAt: timestamp("disputed_at", { withTimezone: true }),
    stripeDisputeId: text("stripe_dispute_id"),
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
    index("payment_records_org_contact_idx").on(table.orgId, table.contactId),
    index("payment_records_org_status_idx").on(table.orgId, table.status),
  ]
);
