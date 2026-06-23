ALTER TABLE "marketplace_listings" ADD COLUMN "price_model" text DEFAULT 'onetime' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "monthly_price_cents" integer;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "per_call_price_cents" integer;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "per_outcome_price_cents" integer;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "outcome_type" text;