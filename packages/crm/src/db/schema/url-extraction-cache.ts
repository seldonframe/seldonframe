import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const urlExtractionCache = pgTable(
  "url_extraction_cache",
  {
    urlHash: text("url_hash").notNull(),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "url_extraction_cache_pk", columns: [t.urlHash, t.kind] })]
);
