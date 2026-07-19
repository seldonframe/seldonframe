-- packages/crm/drizzle/0077_replay_gate_v2.sql
-- Replay gate v2 — idempotent-send
-- (docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md, approved by
-- Max 2026-07-18). Adds:
--   1. `replay_skills.idempotency` — nullable jsonb {stepN, keyVar}. Reelier's
--      parseSkill (external npm dep, @seldonframe/reelier) rejects any
--      unrecognized `- key:` step bullet (confirmed against the installed
--      0.2.0 dist), so a v2 skill's idempotency-key declaration cannot live
--      inside skill_md — it's stored out-of-band here instead, set via
--      `pnpm tsx scripts/replay-ops.ts set-idempotency`. Mirrors
--      trigger_filter's precedent (migration 0076) exactly.
--   2. `replay_send_claims` — the double-send lock. One row per
--      (skill, step, idempotency_key) claim attempt; the UNIQUE index below
--      IS the lock — a concurrent second INSERT for the same key raises a
--      23505 unique-violation, which
--      lib/deployments/replay/send-claim.ts treats as "already sent, do not
--      execute" (skip the step as skipped-claimed, continue).
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op. Mirrors 0076's style.

ALTER TABLE "replay_skills"
  ADD COLUMN IF NOT EXISTS "idempotency" jsonb;

CREATE TABLE IF NOT EXISTS "replay_send_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "replay_skills"("id") ON DELETE CASCADE,
  "step_n" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "claimed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "outcome" text NOT NULL DEFAULT 'unknown'
);

-- THE double-send lock: at most one claim row per (skill, step, key).
CREATE UNIQUE INDEX IF NOT EXISTS "replay_send_claims_skill_step_key_idx"
  ON "replay_send_claims" ("skill_id", "step_n", "idempotency_key");

CREATE INDEX IF NOT EXISTS "replay_send_claims_org_idx"
  ON "replay_send_claims" ("org_id");
