import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agentTemplates } from "./agent-templates";

// ─── share_cards ────────────────────────────────────────────────────────────
//
// Agent setup mode slice (migration 0070) — the celebration screen's
// opt-in, PREVIEW-before-publish share card. A row's existence IS the
// publish state: Publish inserts it, Unpublish deletes it (the public page
// then 404s). `slug` is an unguessable capability token (>=24 chars,
// crypto-random) — the public /a/[slug] route resolves the owning org from
// THIS row, never from session, so the route works for anonymous visitors.
// `sanitizedSteps` are scrubbed (emails/phones/URLs stripped) BEFORE this
// row is ever written — never raw recording data. Org-scoped; additive.

export type ShareCardStep = { label: string };

export const shareCards = pgTable(
  "share_cards",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => agentTemplates.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sanitizedSteps: jsonb("sanitized_steps").$type<ShareCardStep[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("share_cards_slug_idx").on(table.slug)],
);

export type ShareCard = typeof shareCards.$inferSelect;
export type NewShareCard = typeof shareCards.$inferInsert;
