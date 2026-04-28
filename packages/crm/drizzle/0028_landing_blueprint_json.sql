-- C3.3 — `landing_pages.blueprint_json` source-of-truth column.
--
-- The blueprint renderer (general-service-v1) was producing gorgeous
-- HTML/CSS into landing_pages.contentHtml/contentCss, but the *source*
-- Blueprint JSON wasn't being persisted. That broke the customization
-- loop: MCP tools couldn't load → mutate → re-render, only blindly
-- overwrite contentHtml.
--
-- This column stores the structured Blueprint that produced the rendered
-- output. update_landing_content / update_landing_section / update_theme
-- read it, mutate the relevant slot, run renderGeneralServiceV1 again,
-- and write back. All C3.x visual polish (frame, navbar, glass, italic
-- accent, scroll word-reveal, etc.) is preserved on every customization.
--
-- Nullable on purpose:
--   - existing rows from before this migration land with NULL
--   - the persistence helper falls back to pickTemplate(industry) when
--     blueprint_json is NULL, then writes the result on the next save
--   - rows whose source != 'template' (Puck-edited, mcp-typed, etc.)
--     stay NULL — they don't have a structured blueprint to round-trip
--
-- Additive only; no changes to existing columns or indexes.

ALTER TABLE "landing_pages"
  ADD COLUMN IF NOT EXISTS "blueprint_json" jsonb;

COMMENT ON COLUMN "landing_pages"."blueprint_json" IS
  'Source Blueprint JSON for blueprint-rendered pages (source=template, settings.blueprintRenderer set). Mutate + re-render via renderGeneralServiceV1 on customization. NULL for legacy / Puck-edited rows.';
