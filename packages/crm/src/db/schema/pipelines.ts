import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid, jsonb, boolean } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type PipelineStage = {
  name: string;
  color: string;
  probability: number;
};

export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stages: jsonb("stages").$type<PipelineStage[]>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pipelines_org_idx").on(table.orgId)]
);
