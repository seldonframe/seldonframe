// v1.22.0 — agency_support_sessions audit table.
// See drizzle/0043_agency_support_sessions.sql for table-level docs.

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { partnerAgencies } from "./partner-agencies";
import { users } from "./users";

export const agencySupportSessions = pgTable(
  "agency_support_sessions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => partnerAgencies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    originUserId: uuid("origin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    notes: text("notes"),
  },
  (table) => [
    index("agency_support_sessions_agency_started_idx").on(
      table.agencyId,
      table.startedAt,
    ),
    index("agency_support_sessions_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt,
    ),
    index("agency_support_sessions_origin_user_idx").on(
      table.originUserId,
      table.startedAt,
    ),
  ],
);

export type AgencySupportSession = typeof agencySupportSessions.$inferSelect;
export type NewAgencySupportSession =
  typeof agencySupportSessions.$inferInsert;
