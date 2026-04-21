import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("stripe"),
    // For Stripe Connect Standard: the invoice is created on the SMB's
    // connected account. stripeInvoiceId is scoped to that account; we
    // also persist stripeAccountId so we can look up the account when
    // handling webhooks.
    stripeInvoiceId: text("stripe_invoice_id"),
    stripeAccountId: text("stripe_account_id"),
    stripeCustomerId: text("stripe_customer_id"),
    number: text("number"),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("USD"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull().default("0"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoices_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("invoices_org_contact_idx").on(table.orgId, table.contactId),
    index("invoices_org_status_idx").on(table.orgId, table.status),
    uniqueIndex("invoices_stripe_invoice_uidx").on(table.stripeInvoiceId),
  ]
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmount: numeric("unit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invoice_items_invoice_idx").on(table.invoiceId)]
);
