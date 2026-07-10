import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// ─── recording_sessions ────────────────────────────────────────────────────
// Record-to-agent (migration 0067): an anonymous, token-authed session that
// collects one or more workflow recordings, builds a FlowModel via LLM
// compilation, and — after claim — compiles into an agent_templates row.
// Additive only. Inert behind SF_RECORD_TO_AGENT (see lib/recordings/policy.ts).

export type RecordingSessionStatus =
  | "recording"
  | "recapped"
  | "approved"
  | "compiled"
  | "abandoned";

export const recordingSessions = pgTable(
  "recording_sessions",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    /** Set only on claim (operator signs up / links an existing org). */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    /** 'recording' | 'recapped' | 'approved' | 'compiled' | 'abandoned' */
    status: text("status").notNull().default("recording"),
    tokenHash: text("token_hash").notNull().unique(),
    ipHash: text("ip_hash").notNull(),
    flowModel: jsonb("flow_model"),
    openQuestions: jsonb("open_questions"),
    interviewLog: jsonb("interview_log"),
    derivedScenarios: jsonb("derived_scenarios"),
    agentTemplateId: uuid("agent_template_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("recording_sessions_ip_created_idx").on(table.ipHash, table.createdAt),
  ],
);

export type RecordingSession = typeof recordingSessions.$inferSelect;
export type NewRecordingSession = typeof recordingSessions.$inferInsert;

// ─── workflow_recordings ───────────────────────────────────────────────────
// One captured recording (a single "slot") within a recording_sessions row.

export type WorkflowRecordingStatus = "uploaded" | "traced" | "failed";

export const workflowRecordings = pgTable(
  "workflow_recordings",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => recordingSessions.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    label: text("label"),
    transcript: jsonb("transcript"),
    frameBlobUrls: jsonb("frame_blob_urls"),
    videoBlobUrl: text("video_blob_url"),
    trace: jsonb("trace"),
    /** 'uploaded' | 'traced' | 'failed' */
    status: text("status").notNull().default("uploaded"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_recordings_session_slot_uniq").on(
      table.sessionId,
      table.slotIndex,
    ),
  ],
);

export type WorkflowRecording = typeof workflowRecordings.$inferSelect;
export type NewWorkflowRecording = typeof workflowRecordings.$inferInsert;
