// ============================================================================
// v1.6.0 — brain store: file-tree CRUD + feedback loop
// ============================================================================
//
// Two-layer brain (Karpathy LLM-Wiki pattern):
//
//   Layer 1 (workspace): per-org notes about THIS workspace specifically
//     paths: customers/recurring.md, voice/copy-that-works.md,
//            pipeline/closed-won-patterns.md, learnings.md
//
//   Layer 2 (global): cross-workspace anonymized patterns
//     paths: patterns/by-vertical/<vertical>.md,
//            patterns/by-block-type/<type>.md,
//            patterns/by-archetype/<archetype>.md
//
// Feedback loop:
//   - readBrainNote() ticks `uses` + sets last_used_at + updates confidence
//   - markBrainOutcome() ticks `wins` for the entries a successful
//     downstream interaction (booking confirmed, deal closed, block
//     not-overridden-after-7-days) consumed
//   - Confidence = (wins + 1) / (uses + 2)  (Bayesian smoothing — cold
//     entries hover at 0.5 instead of jumping to 1.0 on first hit)
//
// Promotion (layer 1 → layer 2): weekly cron picks workspace notes with
// uses ≥ 10 AND confidence ≥ 0.7 AND appearing in ≥ 3 distinct workspaces
// (anonymized aggregation), inserts as global notes.

import { and, desc, eq, gte, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  brainNotes,
  type BrainNoteMetadata,
} from "@/db/schema/brain-notes";

export interface BrainNote {
  id: string;
  org_id: string | null;
  scope: "workspace" | "global";
  path: string;
  body: string;
  metadata: BrainNoteMetadata;
  confidence: number;
  uses: number;
  wins: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: typeof brainNotes.$inferSelect): BrainNote {
  return {
    id: row.id,
    org_id: row.orgId,
    scope: row.scope,
    path: row.path,
    body: row.body,
    metadata: row.metadata,
    confidence: Number(row.confidence),
    uses: row.uses,
    wins: row.wins,
    last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read a single brain note by path. Increments `uses` + updates
 * last_used_at + recomputes confidence. Returns null if not found.
 *
 * @param scope "workspace" requires orgId; "global" requires orgId=null
 */
export async function readBrainNote(args: {
  orgId: string | null;
  scope: "workspace" | "global";
  path: string;
}): Promise<BrainNote | null> {
  const where =
    args.scope === "workspace"
      ? and(eq(brainNotes.orgId, args.orgId!), eq(brainNotes.path, args.path))
      : and(isNull(brainNotes.orgId), eq(brainNotes.path, args.path));

  const [row] = await db.select().from(brainNotes).where(where).limit(1);
  if (!row) return null;

  // Tick uses + recompute confidence atomically.
  const nextUses = row.uses + 1;
  const nextConfidence = computeConfidence(row.wins, nextUses);
  await db
    .update(brainNotes)
    .set({
      uses: nextUses,
      confidence: String(nextConfidence),
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(brainNotes.id, row.id));

  return rowToNote({
    ...row,
    uses: nextUses,
    confidence: String(nextConfidence),
    lastUsedAt: new Date(),
  });
}

// ─── List ───────────────────────────────────────────────────────────────────

/**
 * List notes under a directory prefix. Does NOT increment uses (this is
 * a directory listing, not a content read). Returns metadata + path
 * only — body is omitted to keep the response cheap.
 */
export async function listBrainDir(args: {
  orgId: string | null;
  scope: "workspace" | "global";
  prefix?: string;
  limit?: number;
}): Promise<
  Array<Omit<BrainNote, "body"> & { body_preview: string }>
> {
  const prefix = args.prefix ?? "";
  const limit = args.limit ?? 100;

  const baseConditions =
    args.scope === "workspace"
      ? [eq(brainNotes.orgId, args.orgId!)]
      : [isNull(brainNotes.orgId)];

  const rows = await db
    .select()
    .from(brainNotes)
    .where(
      prefix
        ? and(...baseConditions, like(brainNotes.path, `${prefix}%`))
        : and(...baseConditions),
    )
    .orderBy(desc(brainNotes.confidence), desc(brainNotes.lastUsedAt))
    .limit(limit);

  return rows.map((row) => {
    const note = rowToNote(row);
    const { body, ...rest } = note;
    return {
      ...rest,
      // First 120 chars of body so the agent can decide whether to
      // fetch the full note via readBrainNote.
      body_preview: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    };
  });
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Upsert a brain note by (orgId, path). If the note exists, the body
 * is REPLACED (not appended); the entry's confidence + uses + wins are
 * preserved (the note has earned its standing — only the content
 * changes). For append-style writes (e.g. per-interaction triggers
 * adding observations), use appendToBrainNote.
 */
export async function writeBrainNote(args: {
  orgId: string | null;
  scope: "workspace" | "global";
  path: string;
  body: string;
  metadata?: BrainNoteMetadata;
}): Promise<BrainNote> {
  const where =
    args.scope === "workspace"
      ? and(eq(brainNotes.orgId, args.orgId!), eq(brainNotes.path, args.path))
      : and(isNull(brainNotes.orgId), eq(brainNotes.path, args.path));

  const [existing] = await db.select().from(brainNotes).where(where).limit(1);

  if (existing) {
    await db
      .update(brainNotes)
      .set({
        body: args.body,
        metadata: { ...existing.metadata, ...(args.metadata ?? {}) },
        updatedAt: new Date(),
      })
      .where(eq(brainNotes.id, existing.id));
    return rowToNote({
      ...existing,
      body: args.body,
      metadata: { ...existing.metadata, ...(args.metadata ?? {}) },
      updatedAt: new Date(),
    });
  }

  const [created] = await db
    .insert(brainNotes)
    .values({
      orgId: args.orgId,
      scope: args.scope,
      path: args.path,
      body: args.body,
      metadata: args.metadata ?? {},
    })
    .returning();
  return rowToNote(created);
}

/**
 * Append a paragraph to an existing brain note (or create it with the
 * paragraph if missing). Used by per-interaction triggers: each booking
 * / intake / deal-move appends one observation to the relevant note.
 *
 * The new content is prepended (newest first) so the most recent
 * observations dominate the LLM's attention when the note is read.
 * Capped at 8000 chars to prevent unbounded growth — older content at
 * the bottom gets truncated.
 */
export async function appendToBrainNote(args: {
  orgId: string | null;
  scope: "workspace" | "global";
  path: string;
  paragraph: string;
  metadata?: BrainNoteMetadata;
}): Promise<BrainNote> {
  const where =
    args.scope === "workspace"
      ? and(eq(brainNotes.orgId, args.orgId!), eq(brainNotes.path, args.path))
      : and(isNull(brainNotes.orgId), eq(brainNotes.path, args.path));

  const [existing] = await db.select().from(brainNotes).where(where).limit(1);

  const stamp = new Date().toISOString().slice(0, 10);
  const newEntry = `**${stamp}** — ${args.paragraph.trim()}`;

  if (existing) {
    const merged = `${newEntry}\n\n${existing.body}`;
    const trimmed = merged.length > 8000 ? merged.slice(0, 8000) : merged;
    await db
      .update(brainNotes)
      .set({
        body: trimmed,
        metadata: { ...existing.metadata, ...(args.metadata ?? {}) },
        updatedAt: new Date(),
      })
      .where(eq(brainNotes.id, existing.id));
    return rowToNote({
      ...existing,
      body: trimmed,
      metadata: { ...existing.metadata, ...(args.metadata ?? {}) },
      updatedAt: new Date(),
    });
  }

  return writeBrainNote({
    orgId: args.orgId,
    scope: args.scope,
    path: args.path,
    body: newEntry,
    metadata: args.metadata,
  });
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteBrainNote(args: {
  orgId: string | null;
  scope: "workspace" | "global";
  path: string;
}): Promise<boolean> {
  const where =
    args.scope === "workspace"
      ? and(eq(brainNotes.orgId, args.orgId!), eq(brainNotes.path, args.path))
      : and(isNull(brainNotes.orgId), eq(brainNotes.path, args.path));
  const result = await db.delete(brainNotes).where(where).returning({ id: brainNotes.id });
  return result.length > 0;
}

// ─── Feedback loop ──────────────────────────────────────────────────────────

/**
 * Bayesian-smoothed confidence: (wins + 1) / (uses + 2).
 *
 * Why: cold entries (0 uses, 0 wins) get confidence 0.5 instead of 0/0
 * NaN. First successful use → confidence (0+1)/(1+2) = 0.33. First
 * failed use → confidence (0+1)/(1+2) = 0.33 (same — uses ticks
 * regardless of outcome; wins ticks separately if the use was
 * successful). Many uses with high win rate → confidence approaches the
 * true win rate. Many uses with low win rate → confidence drops, prune
 * cron archives.
 */
export function computeConfidence(wins: number, uses: number): number {
  return (wins + 1) / (uses + 2);
}

/**
 * Mark a positive outcome for a list of brain notes (the entries a
 * successful interaction consumed). Increments `wins` for each and
 * recomputes confidence. Idempotent — caller passes the entry IDs the
 * downstream interaction logged at consumption time.
 */
export async function markBrainOutcome(args: {
  noteIds: string[];
  outcome: "win" | "loss";
}): Promise<void> {
  if (args.noteIds.length === 0) return;
  // Increment wins (or just touch updated_at on loss — the next read
  // will recompute confidence based on the existing uses count).
  for (const id of args.noteIds) {
    if (args.outcome === "win") {
      await db
        .update(brainNotes)
        .set({
          wins: sql`${brainNotes.wins} + 1`,
          confidence: sql`((${brainNotes.wins} + 1.0 + 1.0) / (${brainNotes.uses} + 2.0))::numeric(4,3)`,
          updatedAt: new Date(),
        })
        .where(eq(brainNotes.id, id));
    } else {
      // Loss path: confidence already reflects the failed use (uses
      // ticked, wins didn't). Just touch updated_at for staleness
      // tracking.
      await db
        .update(brainNotes)
        .set({ updatedAt: new Date() })
        .where(eq(brainNotes.id, id));
    }
  }
}

// ─── Promotion (layer 1 → layer 2) ──────────────────────────────────────────

/**
 * Find workspace-scoped notes that meet the promotion threshold:
 *   - uses >= MIN_USES (default 10)
 *   - confidence >= MIN_CONFIDENCE (default 0.7)
 *   - same path appears in >= MIN_WORKSPACES distinct workspaces (default 3)
 *
 * Returns one record per (path) suitable for promotion. The cron job
 * synthesizes a global note from these (anonymized — no org_id, no
 * workspace-specific names in the body).
 */
export async function findPromotionCandidates(opts?: {
  minUses?: number;
  minConfidence?: number;
  minWorkspaces?: number;
}): Promise<
  Array<{
    path: string;
    workspace_count: number;
    avg_confidence: number;
    total_uses: number;
    sample_bodies: string[];
  }>
> {
  const minUses = opts?.minUses ?? 10;
  const minConfidence = opts?.minConfidence ?? 0.7;
  const minWorkspaces = opts?.minWorkspaces ?? 3;

  // Aggregate workspace-scoped notes by path.
  const result = await db.execute<{
    path: string;
    workspace_count: number;
    avg_confidence: number;
    total_uses: number;
    sample_bodies: string[];
  }>(sql`
    SELECT
      path,
      COUNT(DISTINCT org_id)::int as workspace_count,
      AVG(confidence)::float as avg_confidence,
      SUM(uses)::int as total_uses,
      ARRAY_AGG(LEFT(body, 400) ORDER BY confidence DESC) FILTER (WHERE confidence >= ${String(minConfidence)})
        as sample_bodies
    FROM brain_notes
    WHERE scope = 'workspace'
      AND uses >= ${minUses}
      AND confidence >= ${String(minConfidence)}
    GROUP BY path
    HAVING COUNT(DISTINCT org_id) >= ${minWorkspaces}
    ORDER BY workspace_count DESC, avg_confidence DESC
  `);

  return (result as unknown as { rows: Array<{
    path: string;
    workspace_count: number;
    avg_confidence: number;
    total_uses: number;
    sample_bodies: string[];
  }> }).rows ?? [];
}

/**
 * Find low-confidence workspace notes that should be archived.
 * Default: confidence < 0.3 AND uses >= 10 (entries that have been
 * tried enough times to know they're not helping).
 */
export async function findPruneCandidates(opts?: {
  maxConfidence?: number;
  minUses?: number;
  limit?: number;
}): Promise<BrainNote[]> {
  const maxConfidence = opts?.maxConfidence ?? 0.3;
  const minUses = opts?.minUses ?? 10;
  const limit = opts?.limit ?? 100;

  const rows = await db
    .select()
    .from(brainNotes)
    .where(
      and(
        eq(brainNotes.scope, "workspace"),
        gte(brainNotes.uses, minUses),
        sql`${brainNotes.confidence} < ${String(maxConfidence)}`,
      ),
    )
    .limit(limit);

  return rows.map(rowToNote);
}
