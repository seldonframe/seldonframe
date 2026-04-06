import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    email: text("email").notNull(),
    status: text("status").notNull().default("active"),
    plan: text("plan"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("memberships_org_id_idx").on(table.orgId),
    index("memberships_user_id_idx").on(table.userId),
    index("memberships_org_user_status_idx").on(table.orgId, table.userId, table.status),
  ]
);
