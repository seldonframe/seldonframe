ALTER TABLE "organizations" ADD COLUMN "theme" jsonb DEFAULT '{"primaryColor":"#14b8a6","accentColor":"#0d9488","fontFamily":"Inter","mode":"dark","borderRadius":"rounded","logoUrl":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscription" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "page_type" text DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD COLUMN "puck_data" jsonb DEFAULT 'null'::jsonb;