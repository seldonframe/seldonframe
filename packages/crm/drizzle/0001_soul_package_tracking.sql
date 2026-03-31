ALTER TABLE "organizations" ADD COLUMN "soul_id" text;
ALTER TABLE "organizations" ADD COLUMN "soul_content_generated" integer DEFAULT 0 NOT NULL;
