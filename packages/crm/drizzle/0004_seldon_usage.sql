CREATE TABLE IF NOT EXISTS "seldon_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "block_id" text,
  "mode" text NOT NULL DEFAULT 'included',
  "model" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost" numeric(10,4) NOT NULL DEFAULT '0',
  "billed_amount" numeric(10,4) NOT NULL DEFAULT '0',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "seldon_usage_org_created_idx" ON "seldon_usage" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "seldon_usage_org_mode_idx" ON "seldon_usage" ("org_id", "mode");
CREATE INDEX IF NOT EXISTS "seldon_usage_org_user_idx" ON "seldon_usage" ("org_id", "user_id");
