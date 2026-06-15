ALTER TABLE "sms_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sms_messages_org_contact_read_idx" ON "sms_messages" USING btree ("org_id","contact_id","read_at");
-- Backfill: mark all pre-existing inbound rows as read to prevent
-- a huge initial unread badge on first deploy. Only inbound rows
-- matter for the unread definition; outbound rows are never checked.
UPDATE "sms_messages"
SET "read_at" = "created_at"
WHERE "direction" = 'inbound' AND "read_at" IS NULL;