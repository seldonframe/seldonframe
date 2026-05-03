// ============================================================================
// v1.6.0 — brain_notes: file-tree storage for the Karpathy LLM-Wiki brain
// ============================================================================
//
// Two-layer brain:
//   Layer 1 (workspace): org_id NOT NULL, scope='workspace'
//   Layer 2 (global):    org_id NULL,     scope='global'
//
// Each note is a markdown body keyed by file-tree path. The IDE agent
// reads relevant notes (via list_brain_dir + read_brain_path MCP tools)
// before generating blocks; the brain compounds across every workspace
// interaction. The feedback loop (uses/wins) self-prunes bad entries
// and self-promotes good ones from layer 1 → layer 2.

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** Frontmatter-style metadata persisted with each note. */
export interface BrainNoteMetadata {
  /** Categorization: "pattern" | "fact" | "preference" | "warning" |
   *  "playbook" | "anti-pattern". Free-text — we don't enforce. */
  type?: string;
  /** Tags for filtering (e.g. ["barbershop", "weekend-bookings"]). */
  tags?: string[];
  /** Where this note came from. Examples:
   *    "background-job:summarize-events:2026-05-04T03:00Z"
   *    "trigger:booking.confirmed:bk_abc123"
   *    "operator:claude-code/desktop-7af3"
   *    "promotion:workspace-pattern->global:abc->def"
   */
  source?: string;
  /** Related block types for the search index — when an IDE agent is
   *  generating a hero, it can find brain entries relevant to hero blocks. */
  related_block_types?: string[];
  /** Vertical hint for layer-2 patterns (barbershop, hvac, legal, etc.). */
  vertical?: string;
}

export const brainNotes = pgTable(
  "brain_notes",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** NULL for global / layer-2 patterns. */
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").notNull().$type<"workspace" | "global">(),
    /** File-tree path. Examples: "customers/recurring.md",
     *  "patterns/by-vertical/hvac.md". Slashes optional. */
    path: text("path").notNull(),
    /** The markdown content the LLM reads. */
    body: text("body").notNull(),
    metadata: jsonb("metadata")
      .$type<BrainNoteMetadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Bayesian-smoothed confidence: (wins + 1) / (uses + 2).
     *  Persisted for cheap range queries; recomputed on every uses/wins update. */
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.500"),
    /** Times an LLM consumed this entry as context. */
    uses: integer("uses").notNull().default(0),
    /** Times the downstream outcome that consumed this entry was judged
     *  successful. Increment via the cron job that judges 7-day-old blocks
     *  + booking-confirmed events + deal-stage-moved-forward events. */
    wins: integer("wins").notNull().default(0),
    /** Last time the note was read. Cron uses this to archive stale entries. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // (org, path) unique within workspace scope.
    uniqueIndex("brain_notes_org_path_uniq")
      .on(table.orgId, table.path)
      .where(sql`${table.orgId} IS NOT NULL`),
    // path unique within global scope (org_id IS NULL).
    uniqueIndex("brain_notes_global_path_uniq")
      .on(table.path)
      .where(sql`${table.orgId} IS NULL`),
    // List by directory prefix.
    index("brain_notes_org_scope_path_idx").on(
      table.orgId,
      table.scope,
      table.path,
    ),
  ],
);
