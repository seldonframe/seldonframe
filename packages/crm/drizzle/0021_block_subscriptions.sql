-- SLICE 1 PR 2 Commit 1 — block-level reactive subscription tables.
-- Authored manually (drizzle-kit journal out of sync; same pattern as
-- 0019_workflow_tables.sql + 0020_workflow_step_results.sql). Additive
-- to the prior state; no backfill required.
--
-- Tables:
--   block_subscription_registry   — one row per installed subscription
--     per workspace. Materialized from BLOCK.md parse at install time.
--   block_subscription_deliveries — one row per (subscription, event)
--     attempt. Bus enqueues pending rows; cron dispatcher sweeps and
--     claims via CAS.
--
-- Naming prefix `block_` disambiguates from the Stripe billing
-- `subscriptions` table that already exists in this schema.

CREATE TABLE "block_subscription_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "block_slug" text NOT NULL,
  "event_type" text NOT NULL,
  "handler_name" text NOT NULL,
  "idempotency_key_template" text DEFAULT '{{id}}' NOT NULL,
  "filter_predicate" jsonb,
  "retry_policy" jsonb DEFAULT '{"max":3,"backoff":"exponential","initial_delay_ms":1000}'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_subscription_registry" ADD CONSTRAINT "block_subscription_registry_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "block_subscription_registry_org_event_active_idx" ON "block_subscription_registry" USING btree ("org_id", "event_type") WHERE active = true;
--> statement-breakpoint
CREATE INDEX "block_subscription_registry_org_block_idx" ON "block_subscription_registry" USING btree ("org_id", "block_slug");
--> statement-breakpoint

CREATE TABLE "block_subscription_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL,
  "event_log_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_subscription_deliveries" ADD CONSTRAINT "block_subscription_deliveries_subscription_id_block_subscription_registry_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."block_subscription_registry"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "block_subscription_deliveries" ADD CONSTRAINT "block_subscription_deliveries_event_log_id_workflow_event_log_id_fk" FOREIGN KEY ("event_log_id") REFERENCES "public"."workflow_event_log"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "block_subscription_deliveries_sub_idem_uidx" ON "block_subscription_deliveries" USING btree ("subscription_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_status_next_idx" ON "block_subscription_deliveries" USING btree ("status", "next_attempt_at") WHERE status IN ('pending', 'failed');
--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_sub_idx" ON "block_subscription_deliveries" USING btree ("subscription_id");
--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_event_idx" ON "block_subscription_deliveries" USING btree ("event_log_id");
