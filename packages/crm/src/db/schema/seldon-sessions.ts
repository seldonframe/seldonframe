import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type SeldonSessionMessage = {
  role: "user" | "assistant";
  content: string;
  createdEntities?: Array<{
    id: string;
    blockType: "form" | "email" | "booking" | "page" | "automation";
    name: string;
    publicUrl: string | null;
    adminUrl: string;
  }>;
  results?: Array<{
    blockId: string;
    blockName: string;
    blockMd: string;
    summary: string;
    fromInventory: boolean;
    installMode: "instant" | "review";
    openPath: string;
    savePath: string;
  }>;
};

export const seldonSessions = pgTable(
  "seldon_sessions",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    messages: jsonb("messages").$type<SeldonSessionMessage[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("seldon_sessions_org_created_idx").on(table.orgId, table.createdAt)]
);
