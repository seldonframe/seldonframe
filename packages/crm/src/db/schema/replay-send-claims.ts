// replay_send_claims — Replay gate v2, the double-send lock (migration
// 0077). One row per (skill, step, idempotency_key) claim ATTEMPT — the
// UNIQUE index on (skill_id, step_n, idempotency_key) below IS the lock: a
// concurrent second INSERT for the same key raises a Postgres 23505
// unique-violation, which lib/deployments/replay/send-claim.ts's
// claimSendStep treats as "a prior attempt already reached this step for
// this key — do not execute, treat as already-sent" (see
// docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md §2).
//
// Lifecycle of one row: INSERT with outcome='unknown' (the claim itself,
// BEFORE the destructive tool call runs) -> UPDATE to 'sent' (tool call
// succeeded) or 'failed' (tool call threw — the claim stays either way,
// so a retry never re-attempts an ambiguous send; see the spec's asymmetric
// divergence policy). 'skipped-claimed' is a STEP-record label used at
// replay time when an INSERT loses the unique race (see
// AttemptL0ReplayResult's "failed-post-send"/"passed" kinds in
// replay-before-llm.ts) — no row is ever WRITTEN with that outcome value
// (the losing attempt's INSERT never succeeds), but it's included in the
// column's type for forward-compat / ops annotation.
//
// Org-scoped: every read/write is scoped by org_id (L-04, security
// invariant) — mirrors replay_skills.ts's contract. skill_id is NOT NULL +
// ON DELETE CASCADE (a claim has no meaning detached from the skill it
// gates), mirroring replay_skills.deployment_id's own cascade reasoning.
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { replaySkills } from "./replay-skills";

export type ReplaySendClaimOutcome = "sent" | "failed" | "unknown" | "skipped-claimed";

export const replaySendClaims = pgTable(
  "replay_send_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => replaySkills.id, { onDelete: "cascade" }),
    /** The skill's declared destructive step number (replay_skills.idempotency.stepN). */
    stepN: integer("step_n").notNull(),
    /** The resolved key VALUE (never the var name) — for v2, always the
     *  fired event's message_id (the only allowed key var; see
     *  gate-v2.ts's ALLOWED_KEY_VARS). */
    idempotencyKey: text("idempotency_key").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: text("outcome").$type<ReplaySendClaimOutcome>().notNull().default("unknown"),
  },
  (table) => [
    // THE double-send lock — see module header.
    uniqueIndex("replay_send_claims_skill_step_key_idx").on(
      table.skillId,
      table.stepN,
      table.idempotencyKey,
    ),
    index("replay_send_claims_org_idx").on(table.orgId),
  ],
);

export type ReplaySendClaimRow = typeof replaySendClaims.$inferSelect;
export type NewReplaySendClaimRow = typeof replaySendClaims.$inferInsert;
