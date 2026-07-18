-- packages/crm/drizzle/0076_replay_skills_trigger_filter.sql
-- Deterministic replay — trigger filter gate (Reelier phase 2c, gap 2).
-- Adds `replay_skills.trigger_filter` (nullable jsonb) — a minimal
-- per-skill filter ({senderEndsWith?, senderContains?, subjectContains?})
-- evaluated BEFORE any L0 replay attempt
-- (lib/deployments/replay/trigger-filter.ts). NULL = no filter, replay is
-- attempted for every fired event — a filterless skill sitting on a
-- filtered workload (e.g. a labeler skill only ever recorded from an
-- @seldonframe.com-sender branch) is the OPERATOR's responsibility to scope
-- narrowly via `pnpm tsx scripts/replay-ops.ts set-filter <skillId> --filter
-- '{"senderEndsWith":"@seldonframe.com"}'`.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op. Mirrors 0075's style.

ALTER TABLE "replay_skills"
  ADD COLUMN IF NOT EXISTS "trigger_filter" jsonb;
