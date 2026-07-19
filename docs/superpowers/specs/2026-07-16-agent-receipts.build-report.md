# Agent receipts + activity upgrade + connected-account pin — build report

Branch `feat/agent-receipts` @ `3823b298f` (base) → see per-task shas below.
Design: `docs/superpowers/specs/2026-07-16-agent-receipts-design.md`.

## Per-task shas

| Task | Sha | Summary |
| --- | --- | --- |
| 1 — schema + migration 0073 | `758225afa` | `agent_run_receipts` table + `db/schema/agent-run-receipts.ts`; hand-written additive `drizzle/0073_agent_run_receipts.sql` mirroring 0072's style; journal idx 50. |
| 2 — writer + call sites | `8e98fb80f`, `256213f60` | `lib/agent-receipts/write.ts` (fail-soft `writeRunReceipt` + `deriveReceiptSummary`), then wired as an OPTIONAL `writeReceipt` DI hook into `composio-event-dispatch.ts`/`-deps.ts` (push path) and `schedule-agents.ts`/`-deps.ts` (cron path). |
| 3 — activity section + LIVE banner | `6d912046e` | `lib/agent-receipts/{store,live-status}.ts` + `components/agent-receipts/{receipts-section,live-banner}.tsx`; wired into `/studio/agents/activity` and the template editor's non-lifecycle path. |
| 4 — connected-account pin | `bf3d04c1e` | `client.ts::createTrigger` gains `connectedAccountId`; new `listConnectedAccountIds`; `upgrade-inbox-trigger.ts::resolveConnectedAccountId` (pure) + two optional deps; `store.ts::persistDeploymentConnectedAccountId`. |
| 5 — regression + report | this file | See below. |

## Files changed (cumulative, Tasks 1–4)

- `packages/crm/src/db/schema/agent-run-receipts.ts` (new)
- `packages/crm/src/db/schema/index.ts`
- `packages/crm/drizzle/0073_agent_run_receipts.sql` (new)
- `packages/crm/drizzle/meta/_journal.json`
- `packages/crm/src/lib/agent-receipts/write.ts` (new)
- `packages/crm/src/lib/agent-receipts/live-status.ts` (new)
- `packages/crm/src/lib/agent-receipts/store.ts` (new)
- `packages/crm/src/components/agent-receipts/receipts-section.tsx` (new)
- `packages/crm/src/components/agent-receipts/live-banner.tsx` (new)
- `packages/crm/src/lib/deployments/composio-event-dispatch.ts`
- `packages/crm/src/lib/deployments/composio-event-dispatch-deps.ts`
- `packages/crm/src/lib/agents/triggers/schedule-agents.ts`
- `packages/crm/src/lib/agents/triggers/schedule-agents-deps.ts`
- `packages/crm/src/lib/deployments/store.ts` (`persistDeploymentConnectedAccountId` + `COMPOSIO_CONNECTED_ACCOUNT_ID_KEY`)
- `packages/crm/src/lib/deployments/upgrade-inbox-trigger.ts`
- `packages/crm/src/lib/integrations/composio/client.ts`
- `packages/crm/src/lib/agent-templates/deploy-to-self-actions.ts`
- `packages/crm/src/app/(dashboard)/studio/agents/activity/page.tsx`
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/page.tsx`
- Tests: `packages/crm/tests/unit/agent-receipts/{write,live-status,receipts-section,live-banner}.spec.ts(x)` (new); `packages/crm/tests/unit/deployments/composio-event-dispatch.spec.ts`; `packages/crm/tests/unit/agents/triggers/run-due-scheduled-agents.spec.ts`; `packages/crm/tests/unit/deployments/upgrade-inbox-trigger.spec.ts`

## Task 4 SDK finding (not a STOP)

Investigated the installed `@composio/core@0.13.1` SDK (`node_modules/.pnpm/@composio+core@0.13.1.../dist`). The exact
`"[Warn] Multiple connected accounts found for user ${userId}, using the first one. Pass connectedAccountId to select a specific account."`
string (matching the live-incident warning verbatim) lives in `index.mjs`'s
`triggers.create` implementation — i.e. the SAME call site `client.ts`'s
`createTrigger` already uses (`composio.triggers.create(userId, slug, body)`).
The body type `TriggerInstanceUpsertParams`
(`composio-BHSQwOUz.d.mts:2673`) DOES expose a `connectedAccountId?: string`
selector. **API used**: `composio.triggers.create(orgId, triggerSlug, { triggerConfig, connectedAccountId })`.
A second confirmed selector exists for direct tool execution
(`composio.tools.execute(slug, { connectedAccountId })`) but is out of scope —
this slice's live incident was specifically the trigger-creation warning.

Design's "list toolkit connections for the entity" is implemented as a new
`listConnectedAccountIds(orgId, toolkitSlug)` wrapping
`composio.connectedAccounts.list({ userIds: [orgId], toolkitSlugs: [toolkitSlug] })`
(note: SDK params are camelCase `userIds`/`toolkitSlugs`, not the internal
`user_ids`/`toolkit_slugs` seen in the SDK's own source).

## Deviations from the plan

1. **`getDeploymentLiveStatus` takes `orgId`, not just `deploymentId`.** The
   design's signature was `getDeploymentLiveStatus(deploymentId)`; L-04
   (org-scope every query) requires the deployment lookup to be scoped, so
   the implementation is `getDeploymentLiveStatus(deploymentId, orgId)`,
   scoped to `builderOrgId OR clientOrgId === orgId`. Returns `null` (render
   nothing) for a deployment outside the org, same as "not found."
2. **LIVE banner wired only into the non-lifecycle page path.** The template
   page (`studio/agents/[id]/page.tsx`) has two render paths gated by
   `SF_AGENT_LIFECYCLE` (five-stage ladder vs. the older single-page editor).
   Per CLAUDE.md 3.1 (Runaway Refactor / Minimal Impact), the banner was
   added to the live, non-lifecycle path only (one extra query: this
   template's primary deployment + its status) — the comment above the
   branch was updated to say so honestly. Wiring the lifecycle-flag-on path
   too is a documented, deliberate cut for a follow-up.
3. **Schedule-path receipts have no per-tool detail.** `RunEventAgentResult`
   (schedule-agents.ts's turn result) is an aggregate (matched/sent/skipped/
   ...), not a per-tool-call list — unlike the push path's
   `StatelessToolEvent` stream. `summarizeScheduleFireResult` folds the
   aggregate into one summary line instead; `toolCalls` stays empty for
   schedule-triggered receipts. This matches the design's "summarizing from
   the turn result available in scope."
4. **Read-back registry / test-fire / notifications** — all explicitly cut
   in the design (§5), untouched here.

## STOP conditions hit

None. Task 4's SDK investigation resolved to a working `connectedAccountId`
parameter (see above) — the STOP condition (no selector exposed) did not
apply.

## Test results

### Targeted (all new + all touched specs), verbatim tail

```
ℹ tests 92
ℹ suites 16
ℹ pass 92
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1715.3729
```
(92 = 11 write.spec + 12 live-status.spec + 6 receipts-section.spec + 4
live-banner.spec + 18 composio-event-dispatch.spec + 21
upgrade-inbox-trigger.spec + 20 run-due-scheduled-agents.spec.)

Individually, per file, all green — e.g.:
- `write.spec.ts`: 11/11 pass
- `live-status.spec.ts`: 12/12 pass
- `receipts-section.spec.tsx`: 6/6 pass
- `live-banner.spec.tsx`: 4/4 pass
- `composio-event-dispatch.spec.ts`: 18/18 pass (12 pre-existing + 6 new)
- `upgrade-inbox-trigger.spec.ts`: 21/21 pass (12 pre-existing + 9 new)
- `run-due-scheduled-agents.spec.ts`: 20/20 pass (15 pre-existing + 5 new)

**All pre-existing tests in touched files stayed green, unmodified** — the
new DI hooks (`writeReceipt`, `listConnectedAccounts`,
`persistConnectedAccountId`) are all OPTIONAL fields on their deps types,
default no-op, so every existing `fakeDeps()`/object-literal in the
pre-existing specs kept compiling and passing without edits.

### tsc --noEmit -p tsconfig.json

Clean except ONE pre-existing, unrelated error (confirmed present before
this slice's first commit, in a file this slice never touches):

```
src/app/api/copilot/turn/route.ts(315,9): error TS2353: Object literal may
only specify known properties, and 'persist' does not exist in type '...'.
```

### pnpm check:use-server

```
✓ All 'use server' files export only async functions / types.
```

### migration-journal check

```
[check-migrations-journaled] OK — 95 .sql file(s); 51 journaled, 44 known
out-of-band, 0 orphans.
```

### Full suite (all 740 spec files) — infra finding, not a regression

`node scripts/run-unit-tests.js` (the repo's single-invocation full-suite
runner) now fails immediately with `spawnSync ... ENAMETOOLONG` on this
Windows worktree BEFORE running a single test. Root cause: the script passes
every matched spec file as an individual `argv` token to `node --test`; the
suite is now at 740 files / ~32,908 command-line characters, just over
Windows's ~32,767-char `CreateProcess` limit. This is a PRE-EXISTING
fragility at the edge (confirmed the exact same command succeeded before
this session's first commit) that this slice's 4 new spec files tipped over.
It is a Windows-only, tooling-level issue — not caused by a logic change in
this slice, and `scripts/run-unit-tests.js` is outside this slice's "Files
touched" list, so it was NOT patched here. Flagged via `spawn_task` for a
follow-up (chunk/dir-glob the invocation) rather than fixed inline.

**Judged by delta instead**: ran the full 740-file suite in 5 manually
chunked batches (`node --import tsx --test <~150 files>` × 5, working around
the same argv limit without modifying the runner script). Authoritative
per-chunk `node:test` summaries: **10,042 pass / 56 fail** total across all
5 chunks. Confirmed (`grep`) **zero failures** in any agent-receipts file or
any file this slice touched (`agent-receipts`, `composio-event-dispatch`,
`upgrade-inbox-trigger`, `schedule-agents`). Inspected all 56 failing test
names — every one is pre-existing and unrelated to this slice: DB-bound
(Neon `ECONNREFUSED`), or content/assertion drift in unrelated areas (brand
color hex checks, FAQ-schema JSON-LD counts, telephony-copy wording,
portal-login session shape, blueprint-workspace naming, SMS run-flow
fixtures, a stale `__generated__` skill-block check). None reference
`agent_run_receipts`, `agent-receipts`, `composio-event-dispatch`,
`schedule-agents`, or `upgrade-inbox-trigger`. This matches the
`crm-unit-test-harness` memory's "DB-bound baseline expected, judge by
delta" pattern — the targeted 92-test run above remains the authoritative
green evidence for every file this slice actually touched.

## Open risks

- The LIVE banner's `SF_AGENT_LIFECYCLE`-on path (the five-stage ladder) has
  no banner yet — deliberate cut #2 above. If that flag flips before a
  follow-up lands, the banner won't render there.
- `getDeploymentLiveStatus` reads the connected-account label straight off
  `deployments.customization._composioConnectedAccountId` as a raw Composio
  account id (not a human-friendly email) — the design's "reading
  &lt;account&gt;" copy will show a Composio id, not an email address, until a
  follow-up resolves it to a display name via the toolkit connection lookup.
- `scripts/run-unit-tests.js`'s Windows ENAMETOOLONG (see above) — flagged,
  not fixed; blocks the one-command full-suite run for every Windows
  dev/CI runner on this repo until addressed.
