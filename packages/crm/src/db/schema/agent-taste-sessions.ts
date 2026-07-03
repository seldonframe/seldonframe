// packages/crm/src/db/schema/agent-taste-sessions.ts
//
// Taste mode (anonymous MCP rental free lane) — short-TTL grounding sessions.
// One row per successful ground_on_my_business call. Anonymous-write safety:
// rows are created ONLY behind per-IP creation caps, TTL <= 1h, grounding blob
// size-capped at 8KB serialized (enforced in taste-session-store.ts), and
// expired rows are swept by the orphan-workspace-ttl cron. No org-owned data
// lives here; ip_hash is sha256(ip|secret) — raw IPs are never stored.

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { marketplaceListings } from "./marketplace";

export type TasteGrounding = {
  businessName: string;
  industry?: string;
  tagline?: string;
  description?: string;
  services?: string[];
  voiceTone?: string;
  idealClient?: string;
  sourceDomain: string;
};

export const agentTasteSessions = pgTable(
  "agent_taste_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`).notNull(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    grounding: jsonb("grounding").$type<TasteGrounding>().notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_agent_taste_sessions_expires_at").on(t.expiresAt)],
);
