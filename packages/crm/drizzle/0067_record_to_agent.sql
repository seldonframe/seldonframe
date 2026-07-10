-- packages/crm/drizzle/0067_record_to_agent.sql
-- Record-to-agent: anonymous screen-recording sessions that compile into a
-- WorkflowTrace/FlowModel and, after claim, an agent_templates draft.
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo). Design:
-- docs/superpowers/specs/2026-07-10-record-to-agent-design.md.
--
-- recording_sessions holds anonymous rows until claim sets org_id. No RLS
-- (same scope boundary as 0064_agent_taste_sessions: only the recording route
-- handlers ever query these tables, gated by bearer token, not org).
--
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "recording_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid,
  "status" text DEFAULT 'recording' NOT NULL,
  "token_hash" text NOT NULL,
  "ip_hash" text NOT NULL,
  "flow_model" jsonb,
  "open_questions" jsonb,
  "interview_log" jsonb,
  "derived_scenarios" jsonb,
  "agent_template_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recording_sessions_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recording_sessions_token_hash_uniq" ON "recording_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_sessions_ip_created_idx" ON "recording_sessions" ("ip_hash", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_recordings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "slot_index" integer NOT NULL,
  "label" text,
  "transcript" jsonb,
  "frame_blob_urls" jsonb,
  "video_blob_url" text,
  "trace" jsonb,
  "status" text DEFAULT 'uploaded' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_recordings_session_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "recording_sessions"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_recordings_session_slot_uniq" ON "workflow_recordings" ("session_id", "slot_index");
