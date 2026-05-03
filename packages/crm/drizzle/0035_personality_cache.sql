-- v1.3.0 — LLM-generated CRMPersonality cache.
--
-- Stores PersonalitySchemas keyed by `business_type_key` (e.g.
-- "roofing", "pet-grooming", "wedding-photography"). Created by the
-- generator at lib/crm/personality-generator.ts on first encounter
-- of each niche; subsequent workspaces of the same niche hit the
-- cache (zero LLM cost).
--
-- The hardcoded personalities (general, hvac, dental, legal, agency,
-- coaching, medspa) are inserted as `source='seed'` rows so they
-- behave like "warm cache" entries from day one. Source distinction
-- enables selective regeneration when models improve.

CREATE TABLE IF NOT EXISTS "personality_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_type_key" text NOT NULL,
  "schema" jsonb NOT NULL,
  "source" text NOT NULL DEFAULT 'llm',
  "validated" boolean NOT NULL DEFAULT true,
  "usage_count" integer NOT NULL DEFAULT 0,
  "generated_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "personality_cache_business_type_key_uidx"
  ON "personality_cache" ("business_type_key");
