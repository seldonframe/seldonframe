-- packages/crm/drizzle/0069_supervised_runs_one_running.sql
-- Agent lifecycle slice, Wave 1 review fix F2 — close the TOCTOU window on
-- "one running supervised run per template": the app-level hasRunningRun
-- check + createRun insert (lib/agent-templates/supervised-run-actions.ts)
-- are two separate statements, so two concurrent "Run it once" clicks can
-- both pass the check before either insert lands. This partial unique index
-- makes the DB the source of truth: at most one 'running' row per
-- template_id, enforced atomically by the insert itself. The app-side check
-- stays as the friendly, low-latency path (F2's fast "already_running"
-- response); this index is the correctness backstop for the race.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE UNIQUE INDEX IF NOT EXISTS "supervised_runs_one_running_per_template"
  ON "supervised_runs" ("template_id")
  WHERE "status" = 'running';
