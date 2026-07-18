# Replay Ledger v1 — build report

## Files changed

- `packages/crm/src/lib/deployments/replay/ledger-queries.ts` (NEW) — org-scoped read queries + pure summary/shaping functions
- `packages/crm/tests/unit/deployments/replay/ledger-queries.spec.ts` (NEW) — unit tests for the above
- `packages/crm/src/app/(dashboard)/replay/page.tsx` (NEW) — the Replay Ledger dashboard page
- `packages/crm/src/components/layout/nav-config.ts` (edited) — added a "Replay" nav entry, indented under Agents

No other files were touched. `replay-before-llm.ts`, `replay-or-turn.ts`, and any claims module were left untouched per the concurrent gate-v2 work warning.

## What changed, per file

### `ledger-queries.ts`
Three read surfaces, each split into (a) a pure compute/shape function taking already-loaded rows, and (b) an async DI wrapper that does the actual `@/db` read — mirroring `persist.ts`/`compile.ts`'s `defaultInsert`/`defaultLoadTrace` pattern (lazy dynamic imports, injectable `deps`):

- `computeLedgerSummary(rows, agentTurnCount) → LedgerSummary` / `getLedgerSummary(orgId, deps?)` — folds `agent_workflow_traces` rows (both `kind`s) into: `tracesRecorded` (count of `kind='trace'`), `replayRunsTotal`/`replayRunsOk`/`replayRunsFailed` (count of `kind='replay-run'` split by `ok`), `llmTurnsAvoided` (= `replayRunsOk` — see honesty note below), `stepsPassed`/`stepsUnchecked`/`stepsSkipped`/`stepsFailed` (summed from each replay-run row's `records.totals`, kept as separate fields — never merged), `totalReplayMs` (summed `records.totals.ms`), `agentTurnCount` (a separate `agent_run_receipts` count query, the turn-count denominator), `lastActivityAt` (max `createdAt` across all rows).
- `getLedgerSkillRows(orgId, deps?) → LedgerSkillRow[]` — reads `replay_skills` left-joined to `deployments` for `clientName`, ordered by `updatedAt desc`; carries `name`, `status`, `triggerFilter`, `healCount`, `lastReplayAt`, `sourceTraceId` (provenance).
- `toLedgerRecentRun(row)` / `getLedgerRecentRuns(orgId, deps?, limit = 20)` — reads the last 20 `agent_workflow_traces` rows (both kinds, left-joined to `deployments`), shapes each into `{ kind, ok, callCount (trace rows), stepTotals (replay-run rows, `null` for trace rows) }`.

Every DB-touching function takes `orgId` as its first argument, filters `WHERE org_id = $orgId`, and never reads it from anywhere else — the caller (the page) resolves it from `getOrgId()` (session-derived).

**Honesty-rule enforcement in code:** `llmTurnsAvoided` is documented in the file header as structurally true (not an estimate) because `attemptL0Replay`'s own contract in `replay-before-llm.ts` states a passed replay "skip[s] the agentic turn entirely" — so every `ok=true` replay-run row IS one avoided turn. No token/dollar math is derived anywhere in this file (trace `input_tokens`/`output_tokens` are never read).

### `page.tsx`
Server component, `dynamic = "force-dynamic"`. Auth: `getOrgId()` + `redirect("/login")` if absent, matching `approvals/page.tsx` and `agents/runs/page.tsx`. Renders regardless of `SF_DETERMINISTIC_REPLAY` (reads history only; the flag only gates writes).

- Header: "Replay Ledger"
- 4 KPI cards (styling lifted from the reskinned `studio/agents/activity/page.tsx` — `rounded-2xl border bg-card`, tone-tinted icon chip, big number, sublabel):
  - **Replays** — `replayRunsTotal`, sublabel "N ok · N failed"
  - **LLM turns avoided** — `llmTurnsAvoided`, sublabel "ok replay runs"
  - **Steps verified** — `stepsPassed` ONLY, sublabel "N unchecked · N failed" (never merged into the headline number)
  - **Traces recorded** — `tracesRecorded`, sublabel "last activity <date>" when available
- Compiled-skills table: name, deployment, status chip (enabled=green/draft=grey/disabled=amber), trigger filter (human-readable from `TriggerFilter`, or "every event"), heal count, last replayed (or "never")
- Recent-runs table (last 20): when, kind (trace/replay), deployment, outcome chip (ok=green/failed=red), and per-run step-outcome chips for replay-run rows (passed=green, unchecked=amber, skipped=neutral (only shown if >0), failed=red) — trace rows show `N call(s)` instead since they have no step totals
- Empty state (zero traces AND zero replay runs): "No replay activity yet — traces appear when SF_DETERMINISTIC_REPLAY is on and agents run."

### `nav-config.ts`
Added one `NavItem` (`{ href: "/replay", label: "Replay", icon: "BookOpen", indent: true }`) to the "agency" (default) session's first/untitled group, indented under Agents alongside Automations — same nesting precedent as the existing Automations sub-item. Only the `agency` branch was touched; `operator-portal` and `inside-client-workspace` sessions are unaffected (Replay Ledger is an agency-operator surface for v1).

## Nav decision

Nav IS config-driven (`components/layout/nav-config.ts`'s `buildNavGroups`), so I added a real entry rather than skipping. Placed as an indented sub-item under "Agents" (same pattern as "Automations") in the `agency` session branch only, since the ledger surfaces agent reliability data for the builder-operator, not the sub-tenant/client-workspace views.

## Summary cards — what they show from the real current data model

- `agent_workflow_traces` currently has rows only where `SF_DETERMINISTIC_REPLAY=1` was on when the turn ran (fail-soft, dark by default) — so on most orgs today the page renders the empty state.
- Where rows exist: `kind='trace'` rows are the slice-1 observe-mode captures (one per email-triggered turn); `kind='replay-run'` rows are slice-2 L0 replay attempts, each carrying a `ReelierRunRecord` with `totals: {steps, passed, unchecked, skipped, failed, ms, llmInputTokens, llmOutputTokens}`.
- `input_tokens`/`output_tokens` on the trace row itself are documented as 0-populated in the schema comment — this page never reads them, and no dollar/savings figure exists anywhere in the code.
- "LLM turns avoided" reads directly as `replayRunsOk` — a structural count, traceable row-by-row back to `agent_workflow_traces WHERE kind='replay-run' AND ok=true`.

## Test results (verbatim tail)

New spec, run in isolation:
```
▶ computeLedgerSummary — pure math over fixture rows
  ✔ empty input yields all-zero summary with agentTurnCount passed through (0.7287ms)
  ✔ counts legacy kind='trace' rows separately from replay-run rows (0.121ms)
  ✔ llmTurnsAvoided = count of ok=true replay-run rows, never an estimate (0.1848ms)
  ✔ lastActivityAt is the max createdAt across all rows regardless of kind (0.688ms)
  ✔ a replay-run row whose records blob isn't a RunRecord contributes 0 step totals (never throws) (0.1144ms)
✔ computeLedgerSummary — pure math over fixture rows (2.7677ms)
▶ toLedgerRecentRun — pure shaping
  ✔ kind='trace' row carries callCount, stepTotals null (0.1417ms)
  ✔ kind='replay-run' row carries stepTotals from records.totals (1.5707ms)
✔ toLedgerRecentRun — pure shaping (1.8591ms)
▶ getLedgerSummary — org-scoped DI wrapper
  ✔ calls both fetch fns with the caller's orgId (0.23ms)
✔ getLedgerSummary — org-scoped DI wrapper (0.3337ms)
▶ getLedgerSkillRows — org-scoped DI wrapper
  ✔ calls fetchSkillRows with the caller's orgId and passes rows through (0.1447ms)
✔ getLedgerSkillRows — org-scoped DI wrapper (0.1938ms)
▶ getLedgerRecentRuns — org-scoped DI wrapper
  ✔ calls fetchRecentRunRows with the caller's orgId and the default limit (0.1933ms)
  ✔ shapes fetched rows through toLedgerRecentRun (0.097ms)
✔ getLedgerRecentRuns — org-scoped DI wrapper (0.3749ms)
ℹ tests 11
ℹ suites 5
ℹ pass 11
ℹ fail 0
```

Full `tests/unit/deployments/replay/*.spec.ts` (46 suites, 164 tests): 163 pass, 1 pre-existing failure unrelated to this change (`compile.spec.ts` fails with `Cannot find module '@seldonframe/reelier/compile'` — confirmed via `git stash` that this fails identically on the pre-change tree; the package isn't even present under the repo root's `node_modules/@seldonframe`, an environment gap, not something this task introduced).

`tests/unit/layout/nav-config.spec.ts` (42 tests): 41 pass, 1 pre-existing failure unrelated to this change (`'SF Admin'` vs `'Seldon Admin'` label mismatch — confirmed via `git stash` it fails identically pre-change). My added nav item does not touch the `inside-client-workspace`/`operator-portal` branches those other 41 tests cover, and the `agency`-branch pinned-baseline test (in the `enabledModules` describe block) is unaffected since it exercises a different session branch.

`npx tsc --noEmit`: 247 errors both before and after my change (identical count, confirmed via `git stash` diff) — zero new errors from `ledger-queries.ts`, `page.tsx`, or `nav-config.ts` (none of the 247 lines reference those files).

`pnpm check:use-server` (via `bash scripts/check-use-server.sh src`): `✓ All 'use server' files export only async functions / types.` — exit 0, clean.

## Deviations from the plan and why

- **Worktree had no `node_modules`** at session start (both root and `packages/crm`). Recreated the junctions to the main repo's `node_modules` (per the "Worktree typecheck method" memory note that junctions vanish and must be re-verified) before any test/tsc could run. This is environment setup, not a plan deviation.
- **"Source" column on skill rows**: the plan said "name, status, trigger_filter, heal_count, last_replay_at, source" — I read "source" as `sourceTraceId` (the trace a skill was compiled from, per the schema's own doc comment calling it "provenance"). Exposed as `sourceTraceId` in the query/type layer; the page table doesn't render a dedicated "Source" column in v1 (kept the table to 6 columns matching the plan's other fields) — this is a minor cut, easy to add a column for later if wanted.
- **Agent-turn count**: used `agent_run_receipts` (one row per agent RUN attempt, org-scoped, already exists) as the "agent-turn count for the same deployments" denominator, per the plan's own phrasing ("for the same deployments" — I scoped it to the same `org_id`, which agent_run_receipts already ties to; a stricter same-deployment-id-set join was possible but would have required intersecting with the trace rows' deployment ids, adding a second data dependency for a number that's shown only as a summary sublabel context, not a headline card in this v1). Flagging this as the one place I made a scoping call rather than a literal deployment-id-set join — happy to tighten if the deployment-id-exact semantics matter later.
- Page-level tests: skipped per the plan's own fallback ("otherwise skip page tests and say so") — no existing pattern for testing a Next.js server-component page directly in this repo's harness; route render is left to live smoke.

## Open risks

- Zero-row state is the common case today (flag is dark by default) — the empty state is the only thing most operators will see until `SF_DETERMINISTIC_REPLAY` is flipped and skills get compiled/enabled. Worth a live smoke once there's real data in a workspace.
- The two pre-existing test failures (`compile.spec.ts` module resolution, `nav-config.spec.ts` label mismatch) are NOT fixed by this task — flagging so they aren't mistaken for regressions introduced here.
- No pagination on the skills table or recent-runs list beyond the existing 20-row cap on runs — fine for v1 scale, would need a "load more" if a single deployment accumulates many replay-run rows.

## Worktree

`C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\agent-a7958eef4f08afcc5`, branch `feat/replay-ledger-page`, based on `origin/main` at `1d5241c5f`. Not pushed, no PR opened, per instructions.
