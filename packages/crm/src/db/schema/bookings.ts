import { desc, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    bookingSlug: text("booking_slug").notNull().default("default"),
    fullName: text("full_name"),
    email: text("email"),
    notes: text("notes"),
    provider: text("provider").notNull().default("manual"),
    status: text("status").notNull().default("scheduled"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    meetingUrl: text("meeting_url"),
    externalEventId: text("external_event_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_org_created_idx").on(table.orgId, desc(table.createdAt)),
    index("bookings_org_starts_idx").on(table.orgId, table.startsAt),
    index("bookings_org_contact_idx").on(table.orgId, table.contactId),
    index("bookings_org_slug_idx").on(table.orgId, table.bookingSlug),
  ]
);
