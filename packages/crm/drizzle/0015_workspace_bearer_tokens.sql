ALTER TABLE "api_keys" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
CREATE INDEX "api_keys_kind_prefix_idx" ON "api_keys" USING btree ("kind", "key_prefix");
