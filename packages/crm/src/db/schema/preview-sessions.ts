import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

type PreviewBusinessData = Record<string, unknown>;
type PreviewDetectedTool = {
  name: string;
  slug: string;
  icon: string;
  autoConnect: boolean;
};

export const previewSessions = pgTable(
  "preview_sessions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    token: text("token").notNull(),
    url: text("url").notNull(),
    businessData: jsonb("business_data").$type<PreviewBusinessData>().notNull().default(sql`'{}'::jsonb`),
    detectedTools: jsonb("detected_tools").$type<PreviewDetectedTool[]>().notNull().default(sql`'[]'::jsonb`),
    themeColor: text("theme_color"),
    rawMarkdown: text("raw_markdown"),
    claimedByOrgId: uuid("claimed_by_org_id").references(() => organizations.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_preview_sessions_token_unique").on(table.token),
    index("idx_preview_sessions_expires_at").on(table.expiresAt),
    index("idx_preview_sessions_claimed_by_org").on(table.claimedByOrgId),
  ]
);
