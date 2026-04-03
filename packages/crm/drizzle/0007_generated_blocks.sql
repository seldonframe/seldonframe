CREATE TABLE IF NOT EXISTS "generated_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "block_id" text NOT NULL,
  "seller_org_id" uuid,
  "files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'generated' NOT NULL,
  "review_notes" text,
  "approved_at" timestamp with time zone,
  "merged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "generated_blocks_block_uidx" UNIQUE("block_id"),
  CONSTRAINT "generated_blocks_block_id_marketplace_blocks_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."marketplace_blocks"("block_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "generated_blocks_seller_org_id_organizations_id_fk" FOREIGN KEY ("seller_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "generated_blocks_status_idx" ON "generated_blocks" USING btree ("status");
