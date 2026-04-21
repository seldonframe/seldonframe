import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// Multi-channel opt-out list. Unified across email + SMS so
// "has this contact opted out of outreach?" is one query, not two.
// `email` is nullable now (was notNull in 0016). A CHECK constraint at
// the DB level ensures exactly one of `email` / `phone` is set per row.
// Kept as a single table rather than splitting into email/sms tables so
// agent reasoning about suppression state stays simple.
export const suppressionList = pgTable(
  "suppression_list",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    email: text("email"),
    phone: text("phone"),
    reason: text("reason").notNull().default("manual"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppression_list_org_email_uidx").on(table.orgId, table.email),
    uniqueIndex("suppression_list_org_phone_uidx").on(table.orgId, table.phone),
    index("suppression_list_org_channel_idx").on(table.orgId, table.channel),
    index("suppression_list_org_created_idx").on(table.orgId, desc(table.createdAt)),
  ]
);
