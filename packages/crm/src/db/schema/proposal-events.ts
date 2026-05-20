// packages/crm/src/db/schema/proposal-events.ts
// 2026-05-19 — Proposal Builder audit log. Append-only timeline of every
// state transition + view + checkout interaction. Spec: 2026-05-19-proposal-builder-design.md.

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { proposals } from "./proposals";

export type ProposalEventType =
  | "created"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "checkout_started"
  | "checkout_success"
  | "checkout_canceled"
  | "workspace_activated"
  | "expired";

export const proposalEvents = pgTable(
  "proposal_events",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<ProposalEventType>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("proposal_events_proposal_idx").on(table.proposalId, table.createdAt)],
);

export type ProposalEvent = typeof proposalEvents.$inferSelect;
export type ProposalEventInsert = typeof proposalEvents.$inferInsert;
