import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// ─── agent_reflection_events ────────────────────────────────────────────────
//
// The `/dream` loop's persisted signal (2026-07-06). `vision_check` verdicts
// were previously only `console.log`'d via logEvent — observability only, not
// queryable. This table gives the daily dream routine a clean structured feed
// to collect + cluster from (see docs/superpowers/specs/2026-07-06-dream-loop-design.md).
//
// `instructionSummary` is a REDACTED/TRUNCATED summary of the builder's edit
// request, never a raw end-customer PII body — see persist-reflection.ts's
// truncation. `gaps` is derived text only (short gap phrases from the vision
// grader), never raw transcripts.

export const agentReflectionEvents = pgTable(
  "agent_reflection_events",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 'copilot' today; later 'agent:voice' | 'agent:chat' per the spec's v2 scope. */
    surface: text("surface").notNull(),
    /** Redacted/truncated (<=200 chars) summary of the edit request — never raw PII. */
    instructionSummary: text("instruction_summary"),
    triggerTool: text("trigger_tool"),
    pass: boolean("pass").notNull(),
    /** 'timeout' | 'render_failed' | null — why the grade didn't run for real. */
    skipped: text("skipped"),
    gaps: jsonb("gaps").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_agent_reflection_events_created").on(table.createdAt),
    index("idx_agent_reflection_events_pass_created").on(table.pass, table.createdAt),
  ]
);

export type AgentReflectionEvent = typeof agentReflectionEvents.$inferSelect;
export type NewAgentReflectionEvent = typeof agentReflectionEvents.$inferInsert;
