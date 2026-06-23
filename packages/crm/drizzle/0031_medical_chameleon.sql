CREATE TABLE "acp_checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"items" jsonb NOT NULL,
	"buyer" jsonb,
	"totals" jsonb NOT NULL,
	"order" jsonb,
	"seller_org_id" text,
	"listing_slug" text,
	"fee_cents" integer DEFAULT 0,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "acp_sessions_idempotency_idx" ON "acp_checkout_sessions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "acp_sessions_seller_idx" ON "acp_checkout_sessions" USING btree ("seller_org_id");