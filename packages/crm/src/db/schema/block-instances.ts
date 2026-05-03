// ============================================================================
// v1.4.0 — block_instances: per-workspace storage for v2 (MCP-native) blocks
// ============================================================================
//
// May 3, 2026. The v2 architecture moves block GENERATION out of the SF
// backend and into the operator's IDE agent context. The IDE agent reads a
// block's SKILL.md, generates props using its own LLM, then POSTs the props
// (plus the prompt that produced them) to /api/v1/workspace/v2/blocks.
//
// This table is where those props + the rendered HTML land. It is the
// canonical source of truth for any v2-rendered surface — the existing
// `landing_pages.contentHtml` becomes a *cached projection* that's
// regenerated whenever a block instance is added/edited/removed.
//
// Persistence shape (matches the architecture conversation 2026-05-03):
//   - generation_prompt: the full prompt the IDE agent sent (initial create)
//   - customizations: append-only list of operator-driven prompt overrides
//   - props: the validated JSON that matches the block's SKILL.md schema
//   - rendered_html: cached projection (props → HTML via the renderer)
//   - rendered_html_hash: cheap drift-detection
//   - template_version: which version of the block's SKILL.md generated this
//
// Forever-frozen edits (the rule the operator decided):
//   - regenerate_workspace skips rows where customizations.length > 0
//   - regenerate_block(prompt) replaces both generation_prompt + customizations
//   - customize_block(prompt) appends to customizations + re-renders
//
// Unique constraint on (org_id, block_name) for v1.4 — one hero per
// workspace, one services-grid per workspace, one FAQ per workspace.
// Will relax to support multiple instances per type when v2 expands beyond
// the 3 high-stakes blocks.

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** A single recorded operator customization on top of the initial generation. */
export interface BlockCustomization {
  /** ISO timestamp when the customization was applied. */
  at: string;
  /** Free-text prompt the operator (or their agent) supplied. */
  prompt: string;
  /** Who initiated this — currently always "operator" but reserved for
   *  future "system" / "agent" sources (e.g. Brain-driven nudges). */
  actor: "operator" | "system" | "agent";
  /** Identifier for the source device / session. e.g. "claude-code/desktop-7af3".
   *  Pulled from the auth context when v2 magic-link auth lands; "unknown"
   *  for v1.4 since auth is still admin-token. */
  source: string;
}

export const blockInstances = pgTable(
  "block_instances",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Matches the SKILL.md folder name: "hero", "services", "faq", etc. */
    blockName: text("block_name").notNull(),
    /** The SKILL.md `version` field at generation time. Used by re-render
     *  logic to detect when a block was generated against an older template. */
    templateVersion: text("template_version").notNull(),
    /** The initial generation prompt the IDE agent sent. Source of truth
     *  for re-rendering; cached HTML below is derived from this + customizations. */
    generationPrompt: text("generation_prompt").notNull(),
    /** Append-only list of operator customizations applied after the
     *  initial generation. Empty for never-customized blocks. */
    customizations: jsonb("customizations")
      .$type<BlockCustomization[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Validated JSON props matching the block's SKILL.md prop schema.
     *  This is the structured data the renderer consumes. */
    props: jsonb("props").$type<Record<string, unknown>>().notNull(),
    /** Cached rendered HTML for this block instance. Regenerated whenever
     *  props change OR the block's renderer is updated. The complete
     *  landing-page HTML is assembled by replacing each section in the
     *  page schema with its corresponding block instance's HTML. */
    renderedHtml: text("rendered_html").notNull(),
    /** Stable hash of rendered_html. Lets re-render code cheaply detect
     *  whether a re-render actually changed anything before incurring a
     *  full landing_pages.contentHtml update. */
    renderedHtmlHash: text("rendered_html_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("block_instances_org_idx").on(table.orgId),
    // One instance per (workspace, block name) for v1.4. Relax later if
    // we want stacked sections (e.g. two CTA blocks on one page).
    uniqueIndex("block_instances_org_block_uniq").on(table.orgId, table.blockName),
  ]
);
