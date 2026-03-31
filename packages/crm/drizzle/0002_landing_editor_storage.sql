ALTER TABLE "landing_pages" ADD COLUMN "source" text DEFAULT 'template' NOT NULL;
ALTER TABLE "landing_pages" ADD COLUMN "content_html" text;
ALTER TABLE "landing_pages" ADD COLUMN "content_css" text;
ALTER TABLE "landing_pages" ADD COLUMN "editor_data" jsonb;
