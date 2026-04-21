import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const suppressionList = pgTable(
  "suppression_list",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason").notNull().default("manual"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suppression_list_org_email_uidx").on(table.orgId, table.email),
    index("suppression_list_org_created_idx").on(table.orgId, desc(table.createdAt)),
  ]
);
