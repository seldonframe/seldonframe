-- v1.4.0 — block_instances: per-workspace storage for v2 (MCP-native) blocks.
--
-- The v2 architecture moves block GENERATION out of the SF backend and
-- into the operator's IDE agent context. The IDE agent reads a block's
-- SKILL.md (via the get_block_skill MCP tool), generates props using its
-- own LLM, then POSTs the props (plus the prompt that produced them) to
-- /api/v1/workspace/v2/blocks. This table is where those props + the
-- rendered HTML land.
--
-- One row per (workspace, block_name). The unique index enforces that
-- v1.4 has at most one hero / services / faq per workspace; relax later
-- if we want stacked sections.
--
-- Forever-frozen edits live in `customizations` (jsonb array). Empty
-- means never-customized; presence means "skip me on regenerate_workspace".

CREATE TABLE IF NOT EXISTS "block_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "block_name" text NOT NULL,
  "template_version" text NOT NULL,
  "generation_prompt" text NOT NULL,
  "customizations" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "props" jsonb NOT NULL,
  "rendered_html" text NOT NULL,
  "rendered_html_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "block_instances_org_idx"
  ON "block_instances" ("org_id");

CREATE UNIQUE INDEX IF NOT EXISTS "block_instances_org_block_uniq"
  ON "block_instances" ("org_id", "block_name");
