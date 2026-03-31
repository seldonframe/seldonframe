CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"user_id" uuid,
	"title" text NOT NULL,
	"booking_slug" text DEFAULT 'default' NOT NULL,
	"full_name" text,
	"email" text,
	"notes" text,
	"provider" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"meeting_url" text,
	"external_event_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"user_id" uuid,
	"provider" text DEFAULT 'resend' NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text,
	"body_html" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"external_message_id" text,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"last_clicked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'template' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_html" text,
	"content_css" text,
	"editor_data" jsonb DEFAULT 'null'::jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_access_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sender_type" text DEFAULT 'client' NOT NULL,
	"sender_name" text,
	"subject" text,
	"body" text NOT NULL,
	"attachment_url" text,
	"attachment_name" text,
	"is_pinned" text DEFAULT 'false' NOT NULL,
	"pinned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portal_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"resource_type" text DEFAULT 'link' NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"date" date NOT NULL,
	"contacts_total" integer DEFAULT 0 NOT NULL,
	"contacts_new" integer DEFAULT 0 NOT NULL,
	"pipeline_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deals_won" integer DEFAULT 0 NOT NULL,
	"deals_lost" integer DEFAULT 0 NOT NULL,
	"win_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"avg_deal_cycle_days" numeric(10, 2) DEFAULT '0' NOT NULL,
	"bookings_total" integer DEFAULT 0 NOT NULL,
	"booking_no_show_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"email_open_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"email_click_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"portal_active_clients" integer DEFAULT 0 NOT NULL,
	"revenue_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"revenue_new" numeric(14, 2) DEFAULT '0' NOT NULL,
	"custom_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_snapshots_org_date_unique" UNIQUE("org_id","date")
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid,
	"booking_id" uuid,
	"stripe_payment_intent_id" text,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_block" text NOT NULL,
	"source_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"access_token" text,
	"stripe_publishable_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"block_id" text NOT NULL,
	"stripe_payment_id" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" text NOT NULL,
	"user_id" uuid,
	"org_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"review" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" text NOT NULL,
	"seller_org_id" uuid,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"review_notes" text,
	"approved_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"long_description" text,
	"icon" text NOT NULL,
	"category" text NOT NULL,
	"preview_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seller_id" uuid,
	"seller_name" text NOT NULL,
	"seller_stripe_account_id" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"block_md" text NOT NULL,
	"generation_status" text DEFAULT 'pending' NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"rating_average" numeric(2, 1),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_blocks_block_id_unique" UNIQUE("block_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "expires_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "owner_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "parent_user_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "soul_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "soul_content_generated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "soul_learning" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "enabled_blocks" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "integrations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email_sends_this_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ai_calls_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "usage_reset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_period" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" text DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_codes" ADD CONSTRAINT "portal_access_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_access_codes" ADD CONSTRAINT "portal_access_codes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_resources" ADD CONSTRAINT "portal_resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_resources" ADD CONSTRAINT "portal_resources_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_snapshots" ADD CONSTRAINT "metrics_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_purchases" ADD CONSTRAINT "block_purchases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_purchases" ADD CONSTRAINT "block_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_purchases" ADD CONSTRAINT "block_purchases_block_id_marketplace_blocks_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."marketplace_blocks"("block_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_ratings" ADD CONSTRAINT "block_ratings_block_id_marketplace_blocks_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."marketplace_blocks"("block_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_ratings" ADD CONSTRAINT "block_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_ratings" ADD CONSTRAINT "block_ratings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_blocks" ADD CONSTRAINT "generated_blocks_block_id_marketplace_blocks_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."marketplace_blocks"("block_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_blocks" ADD CONSTRAINT "generated_blocks_seller_org_id_organizations_id_fk" FOREIGN KEY ("seller_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_blocks" ADD CONSTRAINT "marketplace_blocks_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_org_created_idx" ON "bookings" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "bookings_org_starts_idx" ON "bookings" USING btree ("org_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_org_contact_idx" ON "bookings" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "bookings_org_slug_idx" ON "bookings" USING btree ("org_id","booking_slug");--> statement-breakpoint
CREATE INDEX "emails_org_created_idx" ON "emails" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "emails_org_contact_idx" ON "emails" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "emails_org_status_idx" ON "emails" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "landing_pages_org_created_idx" ON "landing_pages" USING btree ("org_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "landing_pages_org_slug_idx" ON "landing_pages" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "portal_access_codes_org_contact_idx" ON "portal_access_codes" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "portal_messages_org_contact_created_idx" ON "portal_messages" USING btree ("org_id","contact_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "portal_messages_org_contact_read_idx" ON "portal_messages" USING btree ("org_id","contact_id","read_at");--> statement-breakpoint
CREATE INDEX "portal_resources_org_contact_idx" ON "portal_resources" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "metrics_snapshots_org_date_idx" ON "metrics_snapshots" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "metrics_snapshots_org_created_idx" ON "metrics_snapshots" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_records_org_contact_idx" ON "payment_records" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "payment_records_org_status_idx" ON "payment_records" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "stripe_connections_org_active_idx" ON "stripe_connections" USING btree ("org_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "block_purchases_org_block_payment_uidx" ON "block_purchases" USING btree ("org_id","block_id","stripe_payment_id");--> statement-breakpoint
CREATE INDEX "block_purchases_org_idx" ON "block_purchases" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "block_ratings_block_user_uidx" ON "block_ratings" USING btree ("block_id","user_id");--> statement-breakpoint
CREATE INDEX "block_ratings_block_idx" ON "block_ratings" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_blocks_block_uidx" ON "generated_blocks" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "generated_blocks_status_idx" ON "generated_blocks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_blocks_status_idx" ON "marketplace_blocks" USING btree ("generation_status");--> statement-breakpoint
CREATE INDEX "marketplace_blocks_category_idx" ON "marketplace_blocks" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_blocks_seller_idx" ON "marketplace_blocks" USING btree ("seller_id");