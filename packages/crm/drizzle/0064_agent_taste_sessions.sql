-- packages/crm/drizzle/0064_agent_taste_sessions.sql
-- Taste mode: anonymous grounding sessions + per-listing seller taste budget.
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo). Design:
-- docs/superpowers/specs/2026-07-03-agent-taste-mode-design.md.
--
-- agent_taste_sessions holds no org-owned data — only anonymous, TTL'd (<=1h)
-- grounding blobs from visitors tasting a listed agent. No RLS (same scope
-- boundary as 0063_oauth_clients: only the taste route handlers ever query
-- this table, and it carries no org_id to scope by).
--
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "agent_taste_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "source_url" text NOT NULL,
  "grounding" jsonb NOT NULL,
  "ip_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "agent_taste_sessions_listing_id_fk"
    FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_taste_sessions_expires_at" ON "agent_taste_sessions" ("expires_at");
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "seller_preferences" jsonb;
