import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const seldonPatterns = pgTable(
  "seldon_patterns",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    frameworkType: text("framework_type").notNull(),
    blockType: text("block_type").notNull(),
    blockSubtype: text("block_subtype"),
    structure: jsonb("structure").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    outcome: jsonb("outcome").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    sampleSize: integer("sample_size").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_seldon_patterns_framework_block").on(table.frameworkType, table.blockType),
    index("idx_seldon_patterns_confidence").on(table.confidence),
  ]
);
