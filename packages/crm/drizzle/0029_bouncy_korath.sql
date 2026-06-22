ALTER TABLE "marketplace_listings" ADD COLUMN "kind" text DEFAULT 'soul' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "agent_blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "agent_type" text;
