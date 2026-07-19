-- packages/crm/drizzle/0070_share_cards.sql
-- Agent setup mode slice — the celebration screen's opt-in, PREVIEW-before-
-- publish share card. Design:
-- docs/superpowers/specs/2026-07-11-agent-setup-mode-design.md.
--
-- share_cards: a row's existence IS the publish state (Publish inserts,
-- Unpublish deletes; the public /a/[slug] route 404s once the row is gone).
-- slug is an unguessable capability token (>=24 chars, minted server-side).
-- sanitized_steps holds ONLY scrubbed (emails/phones/URLs stripped) labels.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "share_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "sanitized_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "share_cards_org_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE cascade,
  CONSTRAINT "share_cards_template_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "agent_templates"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "share_cards_slug_idx" ON "share_cards" ("slug");
