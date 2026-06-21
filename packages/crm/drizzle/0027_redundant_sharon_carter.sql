ALTER TABLE "deployments" ADD COLUMN "booking_mode" text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "external_booking_url" text;