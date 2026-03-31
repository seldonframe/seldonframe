import { sql } from "drizzle-orm";
import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const seldonUsage = pgTable(
  "seldon_usage",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockId: text("block_id"),
    mode: text("mode").notNull().default("included"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }).notNull().default("0"),
    billedAmount: numeric("billed_amount", { precision: 10, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("seldon_usage_org_created_idx").on(table.orgId, table.createdAt),
    index("seldon_usage_org_mode_idx").on(table.orgId, table.mode),
    index("seldon_usage_org_user_idx").on(table.orgId, table.userId),
  ]
);
