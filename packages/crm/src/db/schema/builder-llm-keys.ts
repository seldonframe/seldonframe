import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// ─── builder_llm_keys ─────────────────────────────────────────────────────

export type BuilderLlmKeyProvider = "anthropic" | "openai";

export const builderLlmKeys = pgTable(
  "builder_llm_keys",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    builderOrgId: uuid("builder_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 'anthropic' | 'openai' */
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    /** Last 4 chars of the key — shown in UI for identification. */
    hint: text("hint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("builder_llm_keys_org_provider_uniq").on(
      table.builderOrgId,
      table.provider,
    ),
  ],
);

export type BuilderLlmKey = typeof builderLlmKeys.$inferSelect;
export type NewBuilderLlmKey = typeof builderLlmKeys.$inferInsert;
