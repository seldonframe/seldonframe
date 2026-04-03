CREATE TABLE IF NOT EXISTS "marketplace_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "block_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "long_description" text,
  "icon" text NOT NULL,
  "category" text NOT NULL,
  "preview_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "seller_id" uuid,
  "seller_name" text NOT NULL,
  "seller_stripe_account_id" text,
  "price" numeric(10, 2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'usd' NOT NULL,
  "block_md" text NOT NULL,
  "generation_status" text DEFAULT 'pending' NOT NULL,
  "install_count" integer DEFAULT 0 NOT NULL,
  "rating_average" numeric(2, 1),
  "rating_count" integer DEFAULT 0 NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_blocks_block_id_unique" UNIQUE("block_id"),
  CONSTRAINT "marketplace_blocks_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "marketplace_blocks_status_idx" ON "marketplace_blocks" USING btree ("generation_status");
CREATE INDEX IF NOT EXISTS "marketplace_blocks_category_idx" ON "marketplace_blocks" USING btree ("category");
CREATE INDEX IF NOT EXISTS "marketplace_blocks_seller_idx" ON "marketplace_blocks" USING btree ("seller_id");
