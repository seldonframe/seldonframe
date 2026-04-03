-- Migration: Create missing tables (block_purchases, block_ratings, seldon_usage)
-- Generated from Drizzle schema audit

CREATE TABLE IF NOT EXISTS "block_purchases" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "block_id" text NOT NULL REFERENCES "marketplace_blocks"("block_id") ON DELETE CASCADE,
  "stripe_payment_id" text,
  "purchased_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "block_purchases_org_block_payment_uidx"
  ON "block_purchases" ("org_id", "block_id", "stripe_payment_id");

CREATE INDEX IF NOT EXISTS "block_purchases_org_idx"
  ON "block_purchases" ("org_id");

CREATE TABLE IF NOT EXISTS "block_ratings" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "block_id" text NOT NULL REFERENCES "marketplace_blocks"("block_id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "review" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "block_ratings_block_user_uidx"
  ON "block_ratings" ("block_id", "user_id");

CREATE INDEX IF NOT EXISTS "block_ratings_block_idx"
  ON "block_ratings" ("block_id");

CREATE TABLE IF NOT EXISTS "seldon_usage" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "block_id" text,
  "mode" text NOT NULL DEFAULT 'included',
  "model" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost" numeric(10, 4) NOT NULL DEFAULT '0',
  "billed_amount" numeric(10, 4) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "seldon_usage_org_created_idx"
  ON "seldon_usage" ("org_id", "created_at");

CREATE INDEX IF NOT EXISTS "seldon_usage_org_mode_idx"
  ON "seldon_usage" ("org_id", "mode");

CREATE INDEX IF NOT EXISTS "seldon_usage_org_user_idx"
  ON "seldon_usage" ("org_id", "user_id");
