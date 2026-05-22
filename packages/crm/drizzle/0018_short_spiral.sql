CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"provider_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"subject" text,
	"assistant_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_turn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"content" text NOT NULL,
	"email_id" uuid,
	"sms_message_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"email" text,
	"phone" text,
	"reason" text DEFAULT 'manual' NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"user_id" uuid,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"external_message_id" text,
	"error_code" text,
	"error_message" text,
	"segments" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sms_message_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"provider_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_path" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"viewed_at" timestamp with time zone,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"stripe_invoice_id" text,
	"stripe_account_id" text,
	"stripe_customer_id" text,
	"number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"hosted_invoice_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_account_id" text,
	"stripe_customer_id" text,
	"stripe_price_id" text,
	"product_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" text DEFAULT '1' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_account_id" text,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"target_type" text DEFAULT 'payment' NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"long_description" text,
	"niche" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"soul_package" jsonb NOT NULL,
	"preview_image_url" text,
	"preview_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"rating" real DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"stripe_connect_account_id" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketplace_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_org_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"url" text NOT NULL,
	"business_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme_color" text,
	"raw_markdown" text,
	"claimed_by_org_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_compilation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"articles_updated" text[] DEFAULT '{}'::text[] NOT NULL,
	"events_processed" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_events" (
	"event_id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workspace_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"salience_score" numeric(4, 3) DEFAULT 0.5 NOT NULL,
	"feedback_score" integer,
	"anonymized" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" text DEFAULT 'workspace' NOT NULL,
	"service_name" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"fingerprint" text NOT NULL
);
--> statement-breakpoint
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
	"context" jsonb,
	"failure_count" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_tokens_input" integer DEFAULT 0 NOT NULL,
	"total_tokens_output" integer DEFAULT 0 NOT NULL,
	"total_cost_usd_estimate" numeric(10, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE "workflow_event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_by_waits" uuid[]
);
--> statement-breakpoint
CREATE TABLE "workflow_step_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"step_type" text NOT NULL,
	"outcome" text NOT NULL,
	"capture_value" jsonb,
	"error_message" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "message_trigger_fires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"run_id" uuid,
	"skipped_reason" text,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"archetype_id" text NOT NULL,
	"channel" text NOT NULL,
	"channel_binding" jsonb NOT NULL,
	"pattern" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	"approver_type" text NOT NULL,
	"approver_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"context_title" text NOT NULL,
	"context_summary" text NOT NULL,
	"context_preview" text,
	"context_metadata" jsonb,
	"timeout_action" text NOT NULL,
	"timeout_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution_comment" text,
	"resolution_reason" text,
	"override_flag" boolean DEFAULT false NOT NULL,
	"magic_link_token_hash" text,
	"magic_link_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seldonframe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" varchar(100) NOT NULL,
	"org_id" uuid,
	"contact_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vertical" varchar(50),
	"event_type" varchar(50) NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" varchar(50),
	"outcome_value_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'file-text' NOT NULL,
	"schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_collections_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "workspace_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contact_id" uuid,
	"status" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"page_type" varchar(50) NOT NULL,
	"visibility" varchar(20) DEFAULT 'admin' NOT NULL,
	"collection_id" uuid,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_html" text,
	"rendered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_pages_org_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "workspace_sidebar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"icon" varchar(50) DEFAULT 'file-text' NOT NULL,
	"href" varchar(255) NOT NULL,
	"group_name" varchar(50) DEFAULT 'YOUR BLOCKS' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_sidebar_items_org_href_unique" UNIQUE("organization_id","href")
);
--> statement-breakpoint
CREATE TABLE "workspace_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50) DEFAULT 'bot' NOT NULL,
	"trigger" jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_type_key" text NOT NULL,
	"schema" jsonb NOT NULL,
	"source" text DEFAULT 'llm' NOT NULL,
	"validated" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"generated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_name" text NOT NULL,
	"template_version" text NOT NULL,
	"generation_prompt" text NOT NULL,
	"customizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"props" jsonb NOT NULL,
	"rendered_html" text NOT NULL,
	"rendered_html_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"scope" text NOT NULL,
	"path" text NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_auth_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atok" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"device_label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"issued_token_id" uuid,
	"issued_token_raw" text DEFAULT '' NOT NULL,
	"claimed_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_record" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"failed_reason" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"vercel_domain_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"primary_color" text,
	"accent_color" text,
	"support_email" text,
	"support_url" text,
	"sender_email_address" text,
	"resend_domain_id" text,
	"verified_sender_at" timestamp with time zone,
	"agency_domain" text,
	"agency_domain_verified_at" timestamp with time zone,
	"owner_user_id" uuid,
	"owner_workspace_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"hide_powered_by_badge" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_support_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"origin_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"anonymous_session_id" text,
	"channel_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"operator_quality" text,
	"operator_notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_turn_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"llm_cost_cents" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario" jsonb NOT NULL,
	"expected" jsonb NOT NULL,
	"actual" jsonb,
	"passed" boolean,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"role" text NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"validators_passed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"blueprint" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by_user_id" uuid,
	"publish_notes" text
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"channel" text NOT NULL,
	"archetype" text NOT NULL,
	"blueprint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"daily_token_budget" integer DEFAULT 50000 NOT NULL,
	"tokens_used_today" integer DEFAULT 0 NOT NULL,
	"tokens_used_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_message_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trigger_id" uuid,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"contact_id" uuid,
	"to_address" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"external_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_message_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"skill_id" text NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"custom_skill_md" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_scheduled_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"trigger_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"contact_id" uuid,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"send_id" uuid,
	"note" text,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_org_id" uuid NOT NULL,
	"prospect_url" text NOT NULL,
	"prospect_name" text NOT NULL,
	"prospect_email" text NOT NULL,
	"prospect_first_name" text,
	"prospect_phone" text,
	"preview_workspace_id" uuid,
	"pricing_tier" text NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"setup_fee_cents" integer DEFAULT 0 NOT NULL,
	"generated_html" text NOT NULL,
	"scope_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"email_subject" text,
	"email_body" text,
	"intro_text" text,
	"timeline_text" text,
	"terms_text" text,
	"signed_token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"declined_reason" text,
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '30 days' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "proposals_signed_token_unique" UNIQUE("signed_token")
);
--> statement-breakpoint
CREATE TABLE "proposal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_payload_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"instruction" text,
	"summary" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "landing_pages_org_slug_idx";--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "theme" SET DEFAULT '{"primaryColor":"#1f2421","accentColor":"#3d6e4f","fontFamily":"Geist","mode":"light","borderRadius":"rounded","logoUrl":null,"motionPreset":"balanced"}'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "test_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "preview_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "parent_agency_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agency_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "portal_access_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "portal_last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "content_html" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "content_css" text;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "blueprint_json" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN "content_html" text;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD COLUMN "content_css" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "stripe_charge_id" text;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "refunded_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "disputed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "stripe_dispute_id" text;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_documents" ADD CONSTRAINT "portal_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_documents" ADD CONSTRAINT "portal_documents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_documents" ADD CONSTRAINT "portal_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_creator_org_id_organizations_id_fk" FOREIGN KEY ("creator_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_buyer_org_id_organizations_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_claimed_by_org_id_organizations_id_fk" FOREIGN KEY ("claimed_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_waits" ADD CONSTRAINT "workflow_waits_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_event_log" ADD CONSTRAINT "workflow_event_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_results" ADD CONSTRAINT "workflow_step_results_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_subscription_registry" ADD CONSTRAINT "block_subscription_registry_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_subscription_deliveries" ADD CONSTRAINT "block_subscription_deliveries_subscription_id_block_subscription_registry_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."block_subscription_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_subscription_deliveries" ADD CONSTRAINT "block_subscription_deliveries_event_log_id_workflow_event_log_id_fk" FOREIGN KEY ("event_log_id") REFERENCES "public"."workflow_event_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_trigger_fires" ADD CONSTRAINT "message_trigger_fires_trigger_id_message_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."message_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_triggers" ADD CONSTRAINT "message_triggers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seldonframe_events" ADD CONSTRAINT "seldonframe_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_outcomes" ADD CONSTRAINT "brain_outcomes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_collections" ADD CONSTRAINT "workspace_collections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_records" ADD CONSTRAINT "workspace_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_records" ADD CONSTRAINT "workspace_records_collection_id_workspace_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."workspace_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_records" ADD CONSTRAINT "workspace_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_pages" ADD CONSTRAINT "workspace_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_pages" ADD CONSTRAINT "workspace_pages_collection_id_workspace_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."workspace_collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sidebar_items" ADD CONSTRAINT "workspace_sidebar_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_agents" ADD CONSTRAINT "workspace_agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_instances" ADD CONSTRAINT "block_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_notes" ADD CONSTRAINT "brain_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_requests" ADD CONSTRAINT "device_auth_requests_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_agencies" ADD CONSTRAINT "partner_agencies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_support_sessions" ADD CONSTRAINT "agency_support_sessions_agency_id_partner_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."partner_agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_support_sessions" ADD CONSTRAINT "agency_support_sessions_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_support_sessions" ADD CONSTRAINT "agency_support_sessions_origin_user_id_users_id_fk" FOREIGN KEY ("origin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_evals" ADD CONSTRAINT "agent_evals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message_sends" ADD CONSTRAINT "outbound_message_sends_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message_sends" ADD CONSTRAINT "outbound_message_sends_trigger_id_outbound_message_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."outbound_message_triggers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message_sends" ADD CONSTRAINT "outbound_message_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message_triggers" ADD CONSTRAINT "outbound_message_triggers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_scheduled_sends" ADD CONSTRAINT "outbound_scheduled_sends_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_scheduled_sends" ADD CONSTRAINT "outbound_scheduled_sends_trigger_id_outbound_message_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."outbound_message_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_scheduled_sends" ADD CONSTRAINT "outbound_scheduled_sends_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_agency_org_id_organizations_id_fk" FOREIGN KEY ("agency_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_preview_workspace_id_organizations_id_fk" FOREIGN KEY ("preview_workspace_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_events" ADD CONSTRAINT "proposal_events_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_payload_versions" ADD CONSTRAINT "landing_payload_versions_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_payload_versions" ADD CONSTRAINT "landing_payload_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_events_org_email_idx" ON "email_events" USING btree ("org_id","email_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "email_events_org_type_idx" ON "email_events" USING btree ("org_id","event_type","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_provider_event_uidx" ON "email_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "conversations_org_contact_idx" ON "conversations" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "conversations_org_status_last_turn_idx" ON "conversations" USING btree ("org_id","status","last_turn_at" desc);--> statement-breakpoint
CREATE INDEX "conversation_turns_org_conv_created_idx" ON "conversation_turns" USING btree ("org_id","conversation_id","created_at" asc);--> statement-breakpoint
CREATE INDEX "conversation_turns_org_created_idx" ON "conversation_turns" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_list_org_email_uidx" ON "suppression_list" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_list_org_phone_uidx" ON "suppression_list" USING btree ("org_id","phone");--> statement-breakpoint
CREATE INDEX "suppression_list_org_channel_idx" ON "suppression_list" USING btree ("org_id","channel");--> statement-breakpoint
CREATE INDEX "suppression_list_org_created_idx" ON "suppression_list" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "sms_messages_org_created_idx" ON "sms_messages" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "sms_messages_org_contact_idx" ON "sms_messages" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "sms_messages_org_status_idx" ON "sms_messages" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "sms_messages_org_direction_idx" ON "sms_messages" USING btree ("org_id","direction");--> statement-breakpoint
CREATE INDEX "sms_events_org_msg_idx" ON "sms_events" USING btree ("org_id","sms_message_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "sms_events_org_type_idx" ON "sms_events" USING btree ("org_id","event_type","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "sms_events_provider_event_uidx" ON "sms_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "portal_documents_org_contact_idx" ON "portal_documents" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "portal_documents_uploader_idx" ON "portal_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_org_created_idx" ON "invoices" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "invoices_org_contact_idx" ON "invoices" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_stripe_invoice_uidx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_created_idx" ON "subscriptions" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "subscriptions_org_contact_idx" ON "subscriptions" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_uidx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "payment_events_org_target_idx" ON "payment_events" USING btree ("org_id","target_type","target_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "payment_events_org_type_idx" ON "payment_events" USING btree ("org_id","event_type","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uidx" ON "payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "idx_marketplace_slug" ON "marketplace_listings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_marketplace_niche" ON "marketplace_listings" USING btree ("niche") WHERE "marketplace_listings"."is_published" = true;--> statement-breakpoint
CREATE INDEX "idx_marketplace_featured" ON "marketplace_listings" USING btree ("is_featured","install_count") WHERE "marketplace_listings"."is_published" = true;--> statement-breakpoint
CREATE INDEX "idx_reviews_listing" ON "marketplace_reviews" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_preview_sessions_token_unique" ON "preview_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_preview_sessions_expires_at" ON "preview_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_preview_sessions_claimed_by_org" ON "preview_sessions" USING btree ("claimed_by_org_id");--> statement-breakpoint
CREATE INDEX "brain_events_workspace_timestamp_idx" ON "brain_events" USING btree ("workspace_id","timestamp");--> statement-breakpoint
CREATE INDEX "brain_events_type_idx" ON "brain_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "workspace_secrets_workspace_idx" ON "workspace_secrets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_secrets_service_idx" ON "workspace_secrets" USING btree ("service_name");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_secrets_workspace_scope_service_uidx" ON "workspace_secrets" USING btree ("workspace_id","scope","service_name");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_created_idx" ON "workflow_runs" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "workflow_runs_org_status_idx" ON "workflow_runs" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "workflow_runs_archetype_idx" ON "workflow_runs" USING btree ("org_id","archetype_id");--> statement-breakpoint
CREATE INDEX "workflow_waits_event_unresolved_idx" ON "workflow_waits" USING btree ("event_type") WHERE resumed_at IS NULL;--> statement-breakpoint
CREATE INDEX "workflow_waits_timeout_unresolved_idx" ON "workflow_waits" USING btree ("timeout_at") WHERE resumed_at IS NULL;--> statement-breakpoint
CREATE INDEX "workflow_waits_run_idx" ON "workflow_waits" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_event_log_org_type_idx" ON "workflow_event_log" USING btree ("org_id","event_type","emitted_at" desc);--> statement-breakpoint
CREATE INDEX "workflow_event_log_emitted_idx" ON "workflow_event_log" USING btree ("emitted_at" desc);--> statement-breakpoint
CREATE INDEX "workflow_step_results_run_idx" ON "workflow_step_results" USING btree ("run_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "block_subscription_registry_org_event_active_idx" ON "block_subscription_registry" USING btree ("org_id","event_type") WHERE active = true;--> statement-breakpoint
CREATE INDEX "block_subscription_registry_org_block_idx" ON "block_subscription_registry" USING btree ("org_id","block_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "block_subscription_deliveries_sub_idem_uidx" ON "block_subscription_deliveries" USING btree ("subscription_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_status_next_idx" ON "block_subscription_deliveries" USING btree ("status","next_attempt_at") WHERE status IN ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_sub_idx" ON "block_subscription_deliveries" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "block_subscription_deliveries_event_idx" ON "block_subscription_deliveries" USING btree ("event_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_trigger_fires_unique_idx" ON "message_trigger_fires" USING btree ("trigger_id","message_id");--> statement-breakpoint
CREATE INDEX "message_trigger_fires_trigger_idx" ON "message_trigger_fires" USING btree ("trigger_id","fired_at");--> statement-breakpoint
CREATE INDEX "message_triggers_lookup_idx" ON "message_triggers" USING btree ("org_id","channel","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "message_triggers_org_archetype_idx" ON "message_triggers" USING btree ("org_id","archetype_id");--> statement-breakpoint
CREATE INDEX "workflow_approvals_org_pending_idx" ON "workflow_approvals" USING btree ("org_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "workflow_approvals_user_pending_idx" ON "workflow_approvals" USING btree ("approver_user_id") WHERE status = 'pending' AND approver_user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_approvals_timeout_pending_idx" ON "workflow_approvals" USING btree ("timeout_at") WHERE status = 'pending' AND timeout_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_approvals_run_idx" ON "workflow_approvals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_approvals_magic_link_idx" ON "workflow_approvals" USING btree ("magic_link_token_hash") WHERE magic_link_token_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_sf_events_event_time" ON "seldonframe_events" USING btree ("event","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_sf_events_org" ON "seldonframe_events" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_sf_events_created" ON "seldonframe_events" USING btree ("created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_brain_outcomes_vertical" ON "brain_outcomes" USING btree ("vertical","event_type","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_brain_outcomes_outcome" ON "brain_outcomes" USING btree ("outcome","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_brain_outcomes_org" ON "brain_outcomes" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_workspace_collections_org" ON "workspace_collections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_records_collection_created" ON "workspace_records" USING btree ("collection_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "idx_workspace_records_org_collection" ON "workspace_records" USING btree ("organization_id","collection_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_records_contact" ON "workspace_records" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_records_status" ON "workspace_records" USING btree ("collection_id","status");--> statement-breakpoint
CREATE INDEX "idx_workspace_pages_org" ON "workspace_pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_pages_visibility" ON "workspace_pages" USING btree ("organization_id","visibility");--> statement-breakpoint
CREATE INDEX "idx_workspace_sidebar_items_org_order" ON "workspace_sidebar_items" USING btree ("organization_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_workspace_agents_org_status" ON "workspace_agents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "personality_cache_business_type_key_uidx" ON "personality_cache" USING btree ("business_type_key");--> statement-breakpoint
CREATE INDEX "block_instances_org_idx" ON "block_instances" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "block_instances_org_block_uniq" ON "block_instances" USING btree ("org_id","block_name");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_notes_org_path_uniq" ON "brain_notes" USING btree ("org_id","path") WHERE "brain_notes"."org_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "brain_notes_global_path_uniq" ON "brain_notes" USING btree ("path") WHERE "brain_notes"."org_id" IS NULL;--> statement-breakpoint
CREATE INDEX "brain_notes_org_scope_path_idx" ON "brain_notes" USING btree ("org_id","scope","path");--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_requests_atok_uniq" ON "device_auth_requests" USING btree ("atok");--> statement-breakpoint
CREATE INDEX "device_auth_requests_status_expires_idx" ON "device_auth_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "device_auth_requests_workspace_idx" ON "device_auth_requests" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_domains_hostname_uniq" ON "workspace_domains" USING btree ("hostname") WHERE "workspace_domains"."status" != 'removed';--> statement-breakpoint
CREATE INDEX "workspace_domains_workspace_idx" ON "workspace_domains" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_domains_active_lookup_idx" ON "workspace_domains" USING btree ("hostname") WHERE "workspace_domains"."status" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX "partner_agencies_slug_uniq" ON "partner_agencies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "partner_agencies_owner_idx" ON "partner_agencies" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agency_support_sessions_agency_started_idx" ON "agency_support_sessions" USING btree ("agency_id","started_at");--> statement-breakpoint
CREATE INDEX "agency_support_sessions_workspace_started_idx" ON "agency_support_sessions" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "agency_support_sessions_origin_user_idx" ON "agency_support_sessions" USING btree ("origin_user_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_agent_started_idx" ON "agent_conversations" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_org_started_idx" ON "agent_conversations" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_anon_session_idx" ON "agent_conversations" USING btree ("anonymous_session_id") WHERE "agent_conversations"."anonymous_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_evals_agent_version_idx" ON "agent_evals" USING btree ("agent_id","agent_version","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turns_conv_index_uniq" ON "agent_turns" USING btree ("conversation_id","turn_index");--> statement-breakpoint
CREATE INDEX "agent_turns_conv_created_idx" ON "agent_turns" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_uniq" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agents_org_status_idx" ON "agents" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_slug_uniq" ON "agents" USING btree ("org_id",lower("slug"));--> statement-breakpoint
CREATE INDEX "outbound_msg_sends_org_created_idx" ON "outbound_message_sends" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_msg_sends_trigger_idx" ON "outbound_message_sends" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "outbound_msg_sends_contact_idx" ON "outbound_message_sends" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "outbound_msg_sends_status_idx" ON "outbound_message_sends" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "outbound_msg_triggers_org_event_idx" ON "outbound_message_triggers" USING btree ("org_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_msg_triggers_org_event_channel_skill_uniq" ON "outbound_message_triggers" USING btree ("org_id","event_type","channel","skill_id");--> statement-breakpoint
CREATE INDEX "outbound_scheduled_sends_due_idx" ON "outbound_scheduled_sends" USING btree ("fire_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "outbound_scheduled_sends_cancel_idx" ON "outbound_scheduled_sends" USING btree ("org_id","event_type","status");--> statement-breakpoint
CREATE INDEX "outbound_scheduled_sends_trigger_idx" ON "outbound_scheduled_sends" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "proposals_agency_status_idx" ON "proposals" USING btree ("agency_org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "proposals_signed_token_idx" ON "proposals" USING btree ("signed_token");--> statement-breakpoint
CREATE INDEX "proposals_checkout_session_idx" ON "proposals" USING btree ("stripe_checkout_session_id") WHERE "proposals"."stripe_checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "proposal_events_proposal_idx" ON "proposal_events" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "landing_payload_versions_workspace_idx" ON "landing_payload_versions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_org_lower_email_uniq" ON "contacts" USING btree ("org_id",lower("email")) WHERE "contacts"."email" IS NOT NULL AND "contacts"."email" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_org_slug_uniq" ON "landing_pages" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "api_keys_kind_prefix_idx" ON "api_keys" USING btree ("kind","key_prefix");