CREATE TABLE IF NOT EXISTS "preview_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL,
  "url" text NOT NULL,
  "business_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "detected_tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "theme_color" text,
  "raw_markdown" text,
  "claimed_by_org_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE "preview_sessions"
  ADD CONSTRAINT "preview_sessions_claimed_by_org_id_organizations_id_fk"
  FOREIGN KEY ("claimed_by_org_id") REFERENCES "public"."organizations"("id")
  ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_preview_sessions_token_unique" ON "preview_sessions" ("token");
CREATE INDEX IF NOT EXISTS "idx_preview_sessions_expires_at" ON "preview_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_preview_sessions_claimed_by_org" ON "preview_sessions" ("claimed_by_org_id");
