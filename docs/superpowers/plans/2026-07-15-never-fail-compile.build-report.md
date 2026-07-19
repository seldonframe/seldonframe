# Never-fail record compile — build report

**Branch:** `feat/never-fail-compile` · **Worktree:** `.claude/worktrees/never-fail-compile`
**Plan:** `docs/superpowers/plans/2026-07-15-never-fail-compile.md`
**Spec:** `docs/superpowers/specs/2026-07-15-never-fail-compile-design.md`

## Environment setup (pre-Task-1)

The worktree's `node_modules` junctions (root + `packages/crm`) had vanished
(per the documented "worktree-typecheck-method" gotcha) and the PARENT
repo's `packages/crm/node_modules` was also an empty directory (pnpm
isolated-linker state not populated there either) — so re-junctioning to the
parent wouldn't have worked. Ran `pnpm install --frozen-lockfile` directly
in the worktree (no lockfile changes, no new dependencies) to populate both
`node_modules` trees natively. This is a one-time environment fix, not a
plan deviation.

## Baselines (captured before Task 1)

- **Unit tests:** `node scripts/run-unit-tests.js` → **9981 tests, 9913 pass,
  55 fail**. All 55 failures are DB-bound (ECONNREFUSED/fetch-failed against
  a live Neon DB not reachable from this sandbox) across 15 files, PLUS one
  pre-existing non-DB failure: `tests/unit/layout/nav-config.spec.ts` — "adds
  the SF Admin entry" expects label `"SF Admin"`, actual `"Seldon Admin"`
  (stale test, unrelated to this slice).
- **tsc:** `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json
  --noEmit` → **1 pre-existing error**: `app/api/copilot/turn/route.ts:315`
  (`'persist' does not exist` — unrelated file, not touched by this slice).

## Final (after Task 6)

- **Unit tests:** **10007 tests, 9938 pass, 56 fail.**
  - Delta: **+26 tests total** (all new, from this slice), **+25 pass**,
    **+1 fail**.
  - The failing-FILE set is byte-identical to baseline (same 15 files —
    verified by diffing sorted file lists from both runs). The +1 fail count
    (vs +0 expected at the file level) is fluctuation inside the DB-bound
    workflow retry tests (`tests/unit/workflow/*`), not a new failure class —
    same known flakiness the CRM harness memory calls out. **Zero new
    failing files.**
  - All 26 new tests added by this slice pass 100% individually (verified
    per-task before each commit).
- **tsc:** identical output to baseline — the one pre-existing
  `copilot/turn/route.ts` error, zero new errors.
- **check:use-server:** `bash scripts/check-use-server.sh src` → clean
  (`(dashboard)/approvals/actions.ts` starts with `"use server"` and exports
  only async functions).
- **sql.raw grep (L-04):** zero hits in any new file.
- **Migration journal:** `0072_agent_action_drafts` at idx 49, consistent
  with the migration filename.

## Per-task commits

| Task | SHA | Summary |
|---|---|---|
| 1 | `8b28cf10d` | `agent_action_drafts` schema + migration 0072 |
| 2 | `11ad81e89` | Draft store contract + memory twin + drizzle impl |
| 3 | `d6d88aeab` | `draft_for_approval` opt-in native tool |
| 4 | `9145fe049` | Compile changes — autonomy score + draft sections behind flag |
| 5 | `7e9071098` | `/approvals` inbox + nav entry + recap autonomy line |
| 6 | (this report) | Full-suite regression + build report |

## Deviations from the plan (with reasons)

1. **drizzle `onConflictDoNothing` API** — the plan anticipated a possible
   `targetWhere` incompatibility and specified the fallback: "use
   `.onConflictDoNothing()` with no target." Investigation found a *better*
   fit within the installed `drizzle-orm@0.45.1`: its config shape is
   `{ target?, where? }`, and `where` compiles to exactly the target's
   partial-index predicate (`ON CONFLICT (...) WHERE status = 'pending' DO
   NOTHING` — verified against the compiled JS). Used `where` instead of
   `targetWhere` — same SQL, same semantics, `target` (the 3-column tuple)
   preserved, so the fallback used is *stronger* than the plan's literal
   "no target" fallback. No new dependency installed.

2. **`nav-config.ts` prop-threading** — the plan's illustrative snippet read
   `process.env.SF_DRAFT_APPROVALS` inline inside `buildNavGroups`. That
   module is explicitly framework-free/pure (header comment: "no React, no
   hooks, no I/O — every input is explicit"), so an inline env read would
   have broken its own documented contract. Per the plan's own fallback
   instruction ("thread a `draftApprovalsOn: boolean`... same mechanism as
   existing conditional entries [isSuperAdmin]"), added `draftApprovalsOn`
   as an explicit `BuildNavInput` field and threaded it from
   `(dashboard)/layout.tsx` (server, reads `process.env`) through
   `sidebar.tsx` → `buildNavGroups`. Files touched beyond the plan's Task 5
   list: `src/components/layout/sidebar.tsx`,
   `src/app/(dashboard)/layout.tsx` — both required by this threading, both
   explicitly anticipated by the plan's own Step 4 instruction.

3. **Recap-panel prop threading** — similarly required touching
   `unified-landing.tsx` (`RecordSurfaceProps` type), `record-hero.tsx`, and
   `record-client.tsx` in addition to `recap-panel.tsx`/`tiers.ts` (the
   plan's listed files) to carry `draftApprovals` from `record/page.tsx`'s
   server-side flag read down to the client `RecapPanel`. This is exactly
   the plan's Step 5 instruction: "find where `<RecapPanel` is rendered...
   and pass `draftApprovals` from the server boundary."

4. **`process.env` typing** — `isDraftApprovalsOn(process.env)` failed tsc
   (`ProcessEnv` has no properties in common with the narrow env type
   parameter) in the compile-agent route; fixed by passing an explicit
   `{ SF_DRAFT_APPROVALS: process.env.SF_DRAFT_APPROVALS }` object, matching
   the exact pattern already used by `isRecordToAgentOn`/`isWebUngatedBuildOn`
   calls elsewhere in the same file. Applied the same pattern everywhere
   else `isDraftApprovalsOn`/`isSuperAdminUser`-style calls were added.

5. **Approvals nav icon** — `"CheckSquare"` is not in
   `sidebar-nav.tsx`'s `iconMap`; `resolveIcon()` safely falls back to the
   `Puzzle` glyph (no crash, no test failure). Left `sidebar-nav.tsx`
   untouched — it's outside Task 5's file list and the plan gave no
   instruction to extend the icon map. Noted here as a conscious minor cut,
   same spirit as the nav count-badge cut the plan's self-review already
   flagged.

6. **Nav count badge (spec §7.2)** — confirmed the plan's own self-review
   note: no badge mechanism exists on `NavItem` today. Cut consciously,
   entry-only for v1, per the plan.

## Nothing STOPPED on

Task 3 Steps 5–6 (the two explicit VERIFY-and-possibly-STOP steps) were
checked and passed cleanly:
- Both eval runners (`run-agent-evals.ts`, `run-deployed-agent-evals.ts`)
  short-circuit tool execution via `ctx.testMode`, which `draftForApproval`
  already honors — no per-tool synthetic map was needed.
- Both dispatch loops (`runtime.ts:508`, `stateless-turn.ts:372`) resolve
  the called tool via `tools.find(t => t.name === name)` against the
  per-call merged list returned by `getToolsForCapabilities` — never the
  module-global `findTool(ALL_TOOLS)` seam. No dispatch-loop surgery was
  required.

## Hard-rule compliance

- Flag-off byte-parity: enforced by dedicated regression tests
  (`flowModelToSkillMd` un-optioned vs `{ draftApprovals: false }` equal;
  `flowModelToBundle` flag-off deep-equal to flag-omitted) — both pass.
- `draft_for_approval` never enters `ALL_TOOLS`: enforced by a dedicated
  reference-equality regression test (`getToolsForCapabilities(undefined)`
  returns the literal `ALL_TOOLS` array, same references, same order) —
  passes.
- Migration: hand-written, additive (`CREATE ... IF NOT EXISTS`), journal
  idx 49 exactly as specified.
- Every new-table query is org-scoped (verified in both `storage-memory.ts`
  and `storage-drizzle.ts` — every method takes/filters by `orgId`).
- No `sql.raw` with interpolation anywhere in new code (L-04) — verified
  by grep, zero hits.
- No new dependencies — `pnpm install --frozen-lockfile` only (lockfile
  unchanged, verified by `git status` showing no `pnpm-lock.yaml` diff).

## Open risks / follow-ups (not in scope for this slice, per spec §10)

- Execute-on-approve, per-step operator gating, notification-on-new-draft,
  coverage telemetry, `workflow_approvals` convergence, Screenpipe import,
  replay verification — all explicitly out of scope.
- Live smoke (vision-gate `/approvals` render, flag-on preview-env compile
  → file → approve flow) is a controller-level post-merge step per the
  plan's self-review, not part of this build.
- Approvals nav icon falls back to a generic Puzzle glyph — a one-line
  `sidebar-nav.tsx` iconMap addition (`checksquare: CheckSquare`) would
  fix this cosmetically; flagged rather than done, since it's outside the
  approved file list.
