// replay_skills — deterministic replay, Reelier phase 2c slice 2. One row
// per COMPILED skill (a SKILL.md source, compiled from a stored
// agent_workflow_traces row by lib/deployments/replay/compile.ts's
// compileSkillFromTrace). A skill always starts `status: 'draft'` —
// compileSkillFromTrace NEVER auto-enables (review-before-save: enabling is
// a human act, for now via SQL/ops — no UI in this slice).
//
// At most ONE 'enabled' skill per deployment (the partial unique index
// below) — lib/deployments/replay/replay-before-llm.ts's org-scoped lookup
// relies on this to make "the deployment's enabled skill" unambiguous.
//
// Org-scoped: every read/write is scoped by org_id (L-04, security
// invariant) — mirrors agent_workflow_traces.ts's contract exactly.
// deployment_id is NOT NULL + ON DELETE CASCADE (unlike
// agent_workflow_traces.deployment_id, which is nullable-on-delete): a
// compiled skill has no meaning detached from the deployment it replays
// against, so it's deleted with its deployment rather than orphaned.
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { deployments } from "./deployments";
import { agentWorkflowTraces } from "./agent-workflow-traces";
import type { TriggerFilter } from "@/lib/deployments/replay/trigger-filter";

export type ReplaySkillStatus = "draft" | "enabled" | "disabled";

/** Replay gate v2 (migration 0077) — out-of-band idempotency-key config for
 *  a skill's ONE destructive step. Lives here, NOT inside skill_md, because
 *  reelier's parseSkill (external npm dep) rejects any step bullet it
 *  doesn't recognize (`- idempotency-key: ...` would throw) — see
 *  lib/deployments/replay/gate-v2.ts's module header for the full
 *  rationale. `stepN` is the skill's own step number (1-based, matches
 *  ReelierSkillStep.n); `keyVar` MUST be `"message_id"` — see
 *  gate-v2.ts's ALLOWED_KEY_VARS (sender/subject are attacker-influenceable
 *  and forbidden as key material by the spec). Set via
 *  `pnpm tsx scripts/replay-ops.ts set-idempotency`, validated there with
 *  the SAME passesGateV2 function replay-before-llm.ts uses at replay
 *  time. NULL = not v2-eligible (gate v2 never activates for this skill,
 *  regardless of SF_REPLAY_GATE_V2). */
export type ReplaySkillIdempotency = { stepN: number; keyVar: string };

export const replaySkills = pgTable(
  "replay_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    /** The compiled trace's own meta name (e.g. "email:<deploymentId>"), or
     *  a later human rename — free text, no uniqueness constraint. */
    name: text("name"),
    /** The full SKILL.md source (frontmatter + step blocks) — reelier's
     *  renderSkillMd output verbatim. Never mutated in place by this slice
     *  (no L1/L2 escalation write-back yet — heal_count stays 0). */
    skillMd: text("skill_md").notNull(),
    status: text("status").$type<ReplaySkillStatus>().notNull().default("draft"),
    /** The trace this skill was compiled from — ON DELETE SET NULL (a
     *  skill outlives the trace row it was derived from; the trace is
     *  provenance, not a dependency). */
    sourceTraceId: uuid("source_trace_id").references(() => agentWorkflowTraces.id, {
      onDelete: "set null",
    }),
    /** Count of successful L1/L2 escalation heals written back to this
     *  skill. Always 0 in slice 2 (L0-only replay — no escalation ladder
     *  wired yet); the column exists now so a future escalation slice needs
     *  no migration. */
    healCount: integer("heal_count").notNull().default(0),
    /** Set only after a PASSED L0 replay run (replay-before-llm.ts) — never
     *  touched by a skipped or diverged attempt. */
    lastReplayAt: timestamp("last_replay_at", { withTimezone: true }),
    /** Trigger filter gate (migration 0076) — a minimal AND-matched
     *  condition set (see trigger-filter.ts) evaluated BEFORE any L0
     *  replay attempt, so a linear skill only ever replays for the branch
     *  of events it was actually recorded from. NULL = no filter, replay
     *  is attempted for every fired event (operator's own responsibility
     *  to scope a narrowly-recorded skill correctly). Never trusted
     *  as-is on read — trigger-filter.ts's validateTriggerFilter/
     *  evaluateTriggerFilter re-validate every time, since this column has
     *  no CHECK constraint (a hand-edited row could be malformed). */
    triggerFilter: jsonb("trigger_filter").$type<TriggerFilter | null>(),
    /** Replay gate v2 (migration 0077) — see ReplaySkillIdempotency above.
     *  NULL = not v2-eligible. Never trusted as-is on read — gate-v2.ts's
     *  validateIdempotencyConfig re-validates every time (this column has
     *  no CHECK constraint; a hand-edited row could be malformed). */
    idempotency: jsonb("idempotency").$type<ReplaySkillIdempotency | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one ENABLED skill per deployment — the replay-before-llm
    // lookup assumes "the" enabled skill, singular.
    uniqueIndex("replay_skills_one_enabled_per_deployment_idx")
      .on(table.deploymentId)
      .where(sql`status = 'enabled'`),
    index("replay_skills_org_deployment_idx").on(table.orgId, table.deploymentId),
  ],
);

export type ReplaySkillRow = typeof replaySkills.$inferSelect;
export type NewReplaySkillRow = typeof replaySkills.$inferInsert;
