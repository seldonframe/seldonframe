import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, numeric, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const metricsSnapshots = pgTable(
  "metrics_snapshots",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    contactsTotal: integer("contacts_total").notNull().default(0),
    contactsNew: integer("contacts_new").notNull().default(0),
    pipelineValue: numeric("pipeline_value", { precision: 14, scale: 2 }).notNull().default("0"),
    dealsWon: integer("deals_won").notNull().default(0),
    dealsLost: integer("deals_lost").notNull().default(0),
    winRate: numeric("win_rate", { precision: 7, scale: 4 }).notNull().default("0"),
    avgDealCycleDays: numeric("avg_deal_cycle_days", { precision: 10, scale: 2 }).notNull().default("0"),
    bookingsTotal: integer("bookings_total").notNull().default(0),
    bookingNoShowRate: numeric("booking_no_show_rate", { precision: 7, scale: 4 }).notNull().default("0"),
    emailsSent: integer("emails_sent").notNull().default(0),
    emailOpenRate: numeric("email_open_rate", { precision: 7, scale: 4 }).notNull().default("0"),
    emailClickRate: numeric("email_click_rate", { precision: 7, scale: 4 }).notNull().default("0"),
    portalActiveClients: integer("portal_active_clients").notNull().default(0),
    revenueTotal: numeric("revenue_total", { precision: 14, scale: 2 }).notNull().default("0"),
    revenueNew: numeric("revenue_new", { precision: 14, scale: 2 }).notNull().default("0"),
    customMetrics: jsonb("custom_metrics").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("metrics_snapshots_org_date_unique").on(table.orgId, table.date),
    index("metrics_snapshots_org_date_idx").on(table.orgId, table.date),
    index("metrics_snapshots_org_created_idx").on(table.orgId, table.createdAt),
  ]
);
