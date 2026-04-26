# SLICE 10 PR 2 — close-out

**Date:** 2026-04-25
**Branch:** `claude/slice-10-approval-primitive` (continued from PR 1)
**Base:** PR 1 close `a0cd2454`
**HEAD:** `[after-C8]`
**Audit:** [step-10-request-approval-audit.md](step-10-request-approval-audit.md)
**PR 1 close-out:** [step-10-pr-1-closeout.md](step-10-pr-1-closeout.md)
**PR 2 baseline:** [step-10-pr-2-baseline.md](step-10-pr-2-baseline.md)
**Regression:** [phase-7-archetype-probes/slice-10-pr2-regression/REGRESSION-REPORT.md](phase-7-archetype-probes/slice-10-pr2-regression/REGRESSION-REPORT.md)

---

## What shipped

PR 2 delivered the human-facing half of the request_approval
primitive: admin drawer + customer magic-link surface + email
notifier + cron timeout sweep + integration tests + edge case tests.
The schema + persistence + dispatcher + API foundation shipped in
PR 1.

**8 commits** (C0 + C1 + C2 + C3 + C5 + C6 + C7 + C8 close-out;
C4 dedicated `/agents/approvals` page deferred to v1.1 per PR 2
baseline Option 1).

| # | Commit | One-line scope |
|---|---|---|
| C0 | `ed0144a4` | L-17 addendum 2 (per-file test estimation) + PR 2 baseline |
| C1 | `5e313013` | Approval notifier + applyAction wiring |
| C2 | `bd240c40` | Cron timeout sweep wired into workflow-tick |
| C3 | `a738a296` | Admin inline drawer in /agents/runs |
| C5 | `92efc1fe` | Customer magic-link approval surface (HIGH polish) |
| C6 | `7fa55c4b` | HVAC integration + cost-attribution invariant |
| C7 | `8d2e0b46` | Edge cases (provider failure / race / override / tampering / replay / long pause) |
| C8 | `[this commit]` | 18-probe regression + close-out |

## SLICE 10 LOC totals (across PR 1 + PR 2)

Per L-17 addendum (PR 1 C0): combined production + test code is the
budget metric; documentation tracked separately.

| | Combined code | Doc artifacts |
|---|---|---|
| **PR 1** | ~3,721 | ~1,920 (audit + baseline + close-out + regression) |
| **PR 2** | ~2,395 | ~330 (baseline addendum + close-out + regression) |
| **SLICE 10 total** | **~6,116** | **~2,250** |

PR 1 was 30% over its 2,860 stop trigger. PR 2 was 23% over its
1,950 stop trigger. Both overruns were entirely in test code; both
production LOC totals landed in-band of their respective ranges.

**Per the L-17 addendum 2 verdict in the regression report:**
per-file test count estimation works (~80-94% accuracy) but per-test
LOC tier needs sub-categorization (integration + edge tests run
~22-28 LOC/test, not the 16 LOC/test default). This refinement is
the SLICE 10 PR 2 contribution to the calibration framework.

## L-17 hypothesis measurements

### L-17 addendum 2 (per-file estimation) — first validation

**Predicted (PR 2 baseline C0):** 47-61 tests across 6 files;
~825-1,140 combined test LOC.

**Actual:** 44 tests across 6 files (+1 shape test in
runs-page-smoke); ~1,417 combined test LOC.

- Per-test count accuracy: **80-94%** (in-band of L-17 ±20%
  prediction tolerance)
- Per-test LOC accuracy: **60-75%** (out-of-band; integration +
  edge-case tests run ~22-28 LOC/test rather than the 16 LOC/test
  default applied)

**Verdict: L-17 addendum 2 CONFIRMED with refinement** —
counting tests works; per-test LOC needs sub-categorization by test
class. New refinement codified in this PR 2 close-out + (after PR 2
merges to main) lessons.md addendum 3 in SLICE 11 C0.

### L-17 hypothesis A (cross-ref Zod) and B (dispatcher orthogonal)

PR 2 didn't add new schema cross-refs or dispatchers, so neither
hypothesis had a fresh datapoint here. Both stand at the PR 1 close
verdicts: A confirmed with refinement (2.5x lower edge), B confirmed
with cluster note (1.7-2.1x for orthogonal-with-sibling-modules).

## Polish bar verification (HIGH for customer portal)

Per Max's spot-check criterion: "would Max ship this to a real
client of a real agency?"

Implementation checklist (regression report §"Polish bar
self-check"):
- ✅ Mobile-first layout (full-width buttons; sm: breakpoints)
- ✅ Empty / loading / error / success states polished (each with
  specific copy + tone)
- ✅ Professional copy, no jargon (verified by `mapServerErrorToUserMessage`
  test "no jargon leak")
- ✅ SeldonFrame attribution stays SeldonFrame brand (theme-bridge
  isolation per SLICE 4b — `PoweredByBadge` rendered outside
  `PublicThemeProvider`)
- ✅ Workspace customer theme on chrome (`getPublicOrgThemeById`
  → `PublicThemeProvider`)
- ✅ Specific error pages for expired / invalid / already-resolved
- ✅ Successful resolution shows confirmation panel inline
- ✅ Test mode aware (`TestModePublicBadge` shown when
  `org.testMode === true`)
- 🟡 Visual sign-off pending Max's Vercel preview observation

## Cost-attribution invariant verification

Per audit §15 risk register + Max's PR 2 watch item:

- Cost recorder (SLICE 9 PR 2 C4) is **status-agnostic** + **time-agnostic**.
  `recordLlmUsage` operates on `runId` via SQL `+=`; doesn't read
  `workflow_runs.status` or `updatedAt`.
- `pause_approval` action carries **NO cost-related fields**
  (verified by inspection in C6 last test).
- `applyAction.pause_approval` does NOT touch `workflow_runs.{totalTokensInput,
  totalTokensOutput, totalCostUsdEstimate}` columns (verified by
  reading runtime.ts).
- Long-pause edge (>24h, even 7-day pause) verified in C7: resume
  completes cleanly; cost recorder would continue accumulating
  against the same `runId` on subsequent LLM calls regardless of
  pause duration.

**Verdict: invariant CONFIRMED.** No cost-recording gap introduced
by the request_approval primitive.

## Hash streak status

**30-in-a-row** (was 29 at PR 1 close). Verified by 18-probe
regression at HEAD.

## Vercel preview observation

🟡 **Pending Max's direct observation per L-27.** New HEAD post-push.
Branch:
`https://github.com/seldonframe/crm/tree/claude/slice-10-approval-primitive`.

## Open items for SLICE 11 audit

### Methodology debt to codify in SLICE 11 C0

- **L-17 addendum 3** — per-test LOC tier sub-categorization:
  - Unit tests with thin assertions: ~10-12 LOC/test
  - Unit tests with rich fixtures: ~15-18 LOC/test
  - Integration tests with multi-module orchestration: ~22-28 LOC/test
  - Edge-case tests with explicit error-path setup: ~25-30 LOC/test
- Apply to SLICE 11 budget projection at audit time.

### v1.1 fast-follow tickets (not gating SLICE 11)

- **Dedicated `/agents/approvals` page** — secondary surface per
  G-10-4; deferred from PR 2 Option 1 budget tightening
- **Workspace-scoped HMAC magic-link secrets** — v1 uses single
  env-var; rotation API + per-workspace storage in v1.1
- **user_id approver runtime support** — schema-supported; runtime
  resolver for v1.1
- **Approval analytics dashboard** — post-launch per audit §13
- **SLA tracking on approvals** — post-launch
- **Approval pools / delegation / escalation** — post-launch
- **SMS-reply approvals** — post-launch (extends SLICE 7 message-trigger
  infra)

### Cost observability gaps (per Max's prompt: "open items for SLICE 11")

These are the items NOT absorbed by SLICE 9 PR 2's cost observability
fold that may warrant SLICE 11 scope:
- **Workspace-level cost rollup dashboard** — currently per-run
  visible at `/agents/runs` drawer; no workspace-aggregate view
- **Cost alerts / budget caps** — no current way to set "alert at
  $X spend" or "cap monthly at $Y"
- **Per-archetype cost analytics** — useful for "which workflows
  are expensive" decisions
- **Cost attribution to triggering event** — currently aggregates
  per-run; no "this customer triggered $X of LLM spend across N
  runs" rollup

### Pre-existing artifacts (not gating)

- `pnpm emit:blocks:check` reports LF↔CRLF "drift" on 9 BLOCK.md
  files; pre-existing on `origin/main` (verified at PR 1 close);
  cleanup ticket for a dedicated commit

## STOP per L-21 + L-27

Standing by for Max's Vercel preview observation at HEAD before
opening SLICE 11 audit-implementation kickoff. Per discipline:
- No SLICE 11 work begins until Max approves PR 2
- Vercel green at this HEAD must be observed via direct external
  observation (screenshot or structured input)
- L-27 applies regardless of work-in-progress momentum
