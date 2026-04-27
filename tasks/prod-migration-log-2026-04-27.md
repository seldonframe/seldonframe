# Production DB migration log — 2026-04-27

**Operator:** Max (with Claude assist)
**Production DB:** Neon, host `ep-young-water-am8zkako-pooler.c-5.us-east-1.aws.neon.tech`
**Backup:** Neon branch `pre-migration-backup-2026-04-27` (created BEFORE any writes; snapshot point for rollback)
**Trigger:** Pre-launch test protocol cleanroom run on the published `@seldonframe/mcp@1.0.0` returned `column "timezone" of relation "organizations" does not exist` from `POST /api/v1/workspace/create`. Surfaced massive prod-vs-dev schema drift.

---

## Summary

Production database was ~15 migrations behind the application code. All `INSERT INTO organizations` requests for new workspaces were failing because the model expected columns the DB didn't have.

Applied migrations 0012 through 0027 in numerical order via direct SQL execution (NOT `drizzle-kit migrate` — see "Why not drizzle-kit migrate" below). 15 migrations effectively applied; 1 skipped (already done in production).

After migration, the same `POST /api/v1/workspace/create` request that previously returned the schema error now returns 200 with full workspace metadata.

---

## Pre-state (Phase 1 diagnostic, ran via `scripts/diag-prod-schema.mjs`)

- `__drizzle_migrations` table exists but never populated (drizzle never tracked anything in this prod DB)
- `organizations` table had 21 columns; missing `timezone` (0022) and `test_mode` (0025)
- 13 of 14 expected post-0011 tables were missing (only `preview_sessions` from 0011 was present)
- Production effectively at migration `0011_preview_sessions` + the duplicate-prefix "second" siblings of 0001-0007 (`seldon_usage`, `marketplace_blocks`, `generated_blocks`, etc.)

## Apply log

Each migration was applied in its own transaction (`BEGIN ... COMMIT`). On any failure within a file, the file was rolled back as a unit and the run halted.

| File | Statements | Elapsed | Outcome |
|---|---|---|---|
| `0012_brain_event_salience.sql` | 1 | 301 ms | ✅ Applied (used `IF NOT EXISTS` — idempotent) |
| `0013_brain_feedback_score.sql` | 1 | 306 ms | ✅ Applied (used `IF NOT EXISTS`) |
| `0014_workspace_secrets.sql` | 7 | 832 ms | ✅ Applied — created `workspace_secrets` table + 3 FKs + 3 indexes |
| `0015_workspace_bearer_tokens.sql` | — | — | ⏭ **SKIPPED** — `api_keys.kind` column AND `api_keys_kind_prefix_idx` index were both already present in production from a prior partial-apply (mechanism unknown — possibly manual psql or `drizzle-kit push`). Verified via `scripts/diag-prod-pre-15.mjs`. |
| `0016_phase3_email_conversations_suppression.sql` | 21 | 2044 ms | ✅ Applied — `email_events`, `conversations`, `conversation_messages`, `suppression_list` |
| `0017_phase4_sms_messages_events.sql` | 20 | 822 ms | ✅ Applied — `sms_messages`, `sms_events` |
| `0018_phase5_invoices_subscriptions.sql` | 29 | 1125 ms | ✅ Applied — `invoices`, `invoice_items`, `subscriptions`, `payment_events` |
| `0019_workflow_tables.sql` | 14 | 568 ms | ✅ Applied — `workflow_runs`, `workflow_waits`, `workflow_event_log` |
| `0020_workflow_step_results.sql` | 3 | 193 ms | ✅ Applied — `workflow_step_results` |
| `0021_block_subscriptions.sql` | 11 | 496 ms | ✅ Applied — `block_subscription_registry`, `block_subscription_deliveries` |
| `0022_organizations_timezone.sql` | 1 | 120 ms | ✅ Applied — **THE FIX** — `organizations.timezone text NOT NULL DEFAULT 'UTC'` |
| `0023_scheduled_triggers.sql` | 1 | 111 ms | ✅ Applied — `scheduled_triggers`, `scheduled_trigger_fires` |
| `0024_message_triggers.sql` | 1 | 144 ms | ✅ Applied — `message_triggers`, `message_trigger_fires` |
| `0025_workspace_test_mode.sql` | 1 | 118 ms | ✅ Applied — `organizations.test_mode boolean NOT NULL DEFAULT false` |
| `0026_workflow_runs_cost_observability.sql` | 1 | 100 ms | ✅ Applied — added cost columns to `workflow_runs` (per SLICE 11) |
| `0027_workflow_approvals.sql` | 1 | 134 ms | ✅ Applied — `workflow_approvals` |

**Total:** 15 of 16 applied, 1 skipped, 0 failed. Total apply time: ~7.5 seconds.

## Why not `drizzle-kit migrate`?

The drizzle journal (`packages/crm/drizzle/meta/_journal.json`) registers only 13 of 35 migrations on disk. `drizzle-kit migrate` would consult the journal and either:
- Refuse to apply anything (because journal says it's "up to date"), OR
- Try to apply only journal-registered migrations and miss the unjournaled ones

The 0022 migration's own header comment confirms this is a known pattern: *"Authored manually (drizzle-kit journal out of sync; same pattern as 0019 / 0020 / 0021)"*. So we bypassed drizzle-kit entirely and applied the SQL files directly.

The journal sync issue is a separate post-launch tech debt item — see "Open follow-ups" below.

## Verification

### Direct API smoke test

```
$ curl -X POST https://app.seldonframe.com/api/v1/workspace/create \
    -H "Content-Type: application/json" \
    -d '{"name": "post-migration verify"}'
```

Returned 200 OK with workspace metadata, including `id`, `slug`, `bearer_token`, and all four URL surfaces (home, book, intake, admin_dashboard). Pre-migration this same request returned a Postgres schema error.

Workspace `7be829ae-cd4a-4227-946b-38354dbba608` was created during verification at `2026-04-27T12:10:49.881Z`. It can be cleaned up post-launch if you want a tidy production data state, but it's harmless data.

### Schema diff confirmed

`organizations` now has `timezone` and `test_mode` columns. All `0019-0021` workflow tables, `0023-0024` trigger tables, and `0027` workflow_approvals table are present.

## Operational scripts created (kept for future reference)

| Script | Purpose |
|---|---|
| `packages/crm/scripts/diag-prod-schema.mjs` | Read-only diagnostic — Q1-Q5 on production schema state |
| `packages/crm/scripts/diag-prod-pre-15.mjs` | Read-only — confirms 0015's effects already in production (after first-apply false positive) |
| `packages/crm/scripts/verify-state.mjs` | Read-only — confirms 0012/0013/0014/0015 effects post-apply |
| `packages/crm/scripts/apply-prod-migrations.mjs` | Apply 0012→0027 in order, transactional, stops at first error. **First-run version**, halted at 0015. |
| `packages/crm/scripts/apply-prod-migrations-resume.mjs` | Resume from 0016, skip 0015. Successful run. |

All scripts read `DATABASE_URL` from `.env.prod` (which was deleted post-migration per Phase 4 cleanup).

## Open follow-ups (NOT blocking launch)

### F1 — `_journal.json` is out of sync with on-disk SQL files

35 SQL files exist but only 13 are in the journal. Long-term fix: either backfill the journal entries (and matching `meta/00XX_*.json` snapshots), or migrate to a simpler runner that doesn't need a journal. **Tech debt — file as a post-launch issue.**

### F2 — Drizzle's `__drizzle_migrations` tracking table is empty in production

This means future `drizzle-kit migrate` runs would either no-op (if it sees the journal as "applied") or try to re-apply everything from scratch. We should reconcile this table to reflect reality before any future drizzle-kit-based migration. **Tech debt — post-launch.**

### F3 — Duplicate-prefix migration files (0001-0007 pairs)

7 pairs of files share the same numeric prefix (e.g. `0001_solid_gateway.sql` AND `0001_soul_package_tracking.sql`). Both versions of each pair were applied to production via some past mechanism. Long-term: consolidate or rename. **Tech debt — post-launch.**

### F4 — Vercel deploys don't run migrations

This is the root cause of how production drifted ~15 migrations behind dev. Either:
- Add a `pnpm db:migrate` step to the Vercel build (depends on F1+F2 being resolved first), OR
- Document a manual "apply migrations before deploying" checklist as part of release process, OR
- Set up a separate CI workflow that runs migrations on a schedule or via manual trigger before promotion to production.
**Process gap — post-launch priority since launch is imminent and we just synced manually.**

### F5 — `.gitignore` doesn't cover plain `.env.prod`

Current `.gitignore` patterns: `.env*.local` and `.vercel`. `.env.prod` (created by `vercel env pull --environment=production`) is NOT ignored. The file was deleted post-cleanup, but a future operator could accidentally commit it. **One-line `.gitignore` fix — post-launch.**

### F6 — Document the manual migration runbook

This file IS that runbook for the current event. For future migrations, lift the pattern into a reusable playbook at `tasks/runbook-prod-migration.md`. **Post-launch.**

## L-29 reflection

This is the second P0 surfaced by the cleanroom test. First was Node-16 incompatibility in the published MCP (fixed in v1.0.1). Second was this schema drift. Both would have launched silently and broken every new signup.

The L-29 cleanroom discipline paid for itself twice in one afternoon.

---

*Migration completed at approximately 2026-04-27T12:10 UTC. Production now schema-aligned with main HEAD.*
