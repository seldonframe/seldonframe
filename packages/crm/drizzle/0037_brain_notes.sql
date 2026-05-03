-- v1.6.0 — brain layer (Karpathy LLM-Wiki pattern adapted for SF).
--
-- Two-layer brain stored as a file-tree of markdown notes:
--
--   Layer 1 — workspace-scoped (org_id IS NOT NULL, scope='workspace'):
--     /customers/recurring.md, /intake/last-30-leads.md,
--     /pipeline/closed-won-patterns.md, /voice/copy-that-works.md,
--     /learnings.md
--
--   Layer 2 — cross-workspace patterns, anonymized
--   (org_id IS NULL, scope='global'):
--     /patterns/by-vertical/barbershop.md,
--     /patterns/by-block-type/hero.md,
--     /patterns/by-archetype/solo-operator.md
--
-- Each note carries confidence + uses + wins so the system self-prunes
-- bad entries (confidence drops, weekly cron archives) and self-promotes
-- good ones (workspace pattern hits threshold, cron creates global note).
--
-- Why a dedicated table (vs. landing_pages.settings.brain jsonb): the
-- brain compounds toward hundreds of notes per workspace + thousands of
-- cross-workspace patterns. jsonb-in-settings hits row-size limits and
-- breaks indexable lookups by path. Dedicated table = first-class
-- queries by org+path, scope+path, confidence-range, etc.

CREATE TABLE IF NOT EXISTS "brain_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- 'workspace' (org_id required) | 'global' (org_id NULL)
  "scope" text NOT NULL,
  -- file-tree path, e.g. "voice/copy-that-works.md", "patterns/by-vertical/hvac.md"
  "path" text NOT NULL,
  -- the markdown body (the actual insight content the LLM reads)
  "body" text NOT NULL,
  -- frontmatter-ish metadata: { type, tags, source, related_block_types, ... }
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Bayesian-smoothed confidence: (wins + 1) / (uses + 2). Computed
  -- on read; persisted here for cheap range queries.
  "confidence" numeric(4,3) NOT NULL DEFAULT 0.500,
  -- times an LLM consumed this entry as context.
  "uses" integer NOT NULL DEFAULT 0,
  -- times the downstream block / outcome that consumed this entry was
  -- judged successful (no operator override within 7 days, booking
  -- confirmed, deal moved forward).
  "wins" integer NOT NULL DEFAULT 0,
  -- last time the note was read; used by cron to archive stale entries.
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Lookup by (org, path) — workspace-scoped reads.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_notes_org_path_uniq"
  ON "brain_notes" ("org_id", "path")
  WHERE "org_id" IS NOT NULL;

-- Lookup by (scope, path) — global-scoped reads.
CREATE UNIQUE INDEX IF NOT EXISTS "brain_notes_global_path_uniq"
  ON "brain_notes" ("path")
  WHERE "org_id" IS NULL;

-- List by directory prefix (path LIKE 'customers/%').
CREATE INDEX IF NOT EXISTS "brain_notes_org_scope_path_idx"
  ON "brain_notes" ("org_id", "scope", "path");

-- Promotion query: workspace notes with high confidence + many uses,
-- candidates to roll up to layer 2.
CREATE INDEX IF NOT EXISTS "brain_notes_promotion_idx"
  ON "brain_notes" ("scope", "uses", "confidence")
  WHERE "scope" = 'workspace';

-- Pruning query: low-confidence notes to archive.
CREATE INDEX IF NOT EXISTS "brain_notes_prune_idx"
  ON "brain_notes" ("confidence", "uses")
  WHERE "confidence" < 0.300;
