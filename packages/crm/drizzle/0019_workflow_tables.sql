-- 2c PR 1 M3 — durable workflow runtime state tables.
-- Authored manually against the Drizzle schemas at
--   packages/crm/src/db/schema/workflow-runs.ts
--   packages/crm/src/db/schema/workflow-waits.ts
--   packages/crm/src/db/schema/workflow-event-log.ts
-- (drizzle-kit's meta/_journal.json is out of sync with manually-
-- authored migrations 0008-0018, so `drizzle-kit generate` regenerates
-- the whole schema; we follow the 0016-0018 pattern of hand-authoring
-- incremental migrations until the journal catches up in a separate
-- cleanup slice.)

CREATE TABLE "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "archetype_id" text NOT NULL,
  "spec_snapshot" jsonb NOT NULL,
  "trigger_event_id" uuid,
  "trigger_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "current_step_id" text,
  "capture_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "variable_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_count" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workflow_runs_org_created_idx" ON "workflow_runs" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "workflow_runs_org_status_idx" ON "workflow_runs" USING btree ("org_id", "status");
--> statement-breakpoint
CREATE INDEX "workflow_runs_archetype_idx" ON "workflow_runs" USING btree ("org_id", "archetype_id");
--> statement-breakpoint

CREATE TABLE "workflow_waits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "step_id" text NOT NULL,
  "event_type" text NOT NULL,
  "match_predicate" jsonb,
  "timeout_at" timestamp with time zone NOT NULL,
  "resumed_at" timestamp with time zone,
  "resumed_by" uuid,
  "resumed_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_waits" ADD CONSTRAINT "workflow_waits_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Partial indexes on unresolved waits — keeps the index tight so the
-- event-arrival and timeout scans don't walk resolved rows.
CREATE INDEX "workflow_waits_event_unresolved_idx" ON "workflow_waits" USING btree ("event_type") WHERE resumed_at IS NULL;
--> statement-breakpoint
CREATE INDEX "workflow_waits_timeout_unresolved_idx" ON "workflow_waits" USING btree ("timeout_at") WHERE resumed_at IS NULL;
--> statement-breakpoint
CREATE INDEX "workflow_waits_run_idx" ON "workflow_waits" USING btree ("run_id");
--> statement-breakpoint

CREATE TABLE "workflow_event_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "emitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_by_waits" uuid[]
);
--> statement-breakpoint
ALTER TABLE "workflow_event_log" ADD CONSTRAINT "workflow_event_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workflow_event_log_org_type_idx" ON "workflow_event_log" USING btree ("org_id", "event_type", "emitted_at" DESC);
--> statement-breakpoint
CREATE INDEX "workflow_event_log_emitted_idx" ON "workflow_event_log" USING btree ("emitted_at" DESC);
