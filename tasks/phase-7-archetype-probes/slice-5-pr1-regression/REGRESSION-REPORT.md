# SLICE 5 PR 1 close-out — scheduled triggers core

**Date:** 2026-04-24
**Scope:** SLICE 5 PR 1 (core scheduled-trigger infrastructure — schema + tables + dispatcher + catchup + concurrency).
**Commits:** C1 `3158b5bc` → C2 `af6891c2` → C3 `d96c1d52` → C4 `a7269175` → C5 `289727df` → C6 `[this commit]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS · 21-in-a-row hash streak extended**

| Archetype | Cost sample | Baseline | Δ | Hash |
|---|---|---|---|---|
| speed-to-lead | ~$0.076 | $0.077 | −0.5% | `735f9299ff111080` |
| win-back | ~$0.084 | $0.084 | 0.0% | `72ea1438d6c4a691` |
| review-requester | ~$0.070 | $0.070 | 0.0% | `4464ec782dfd7bad` |

**21-in-a-row** streak. TriggerSchema discriminated-union refactor was
the sole risk — existing archetype fixtures could have regressed at
validation time if the refactor's shape inference shifted. Zero issues
surfaced.

### Green bar

- `pnpm test:unit` — **1,060 pass + 5 todos** (+95 from 965 at SLICE 4b close)
- `tsc --noEmit` — 4 pre-existing, zero new across SLICE 5 PR 1
- `pnpm emit:blocks:check` — clean
- `pnpm emit:event-registry:check` — clean (47 events)

---

## PR 1 summary

| # | Commit | Scope | Prod | Tests | Ratio |
|---|---|---|---|---|---|
| C1 | `3158b5bc` | TriggerSchema → discriminatedUnion; event-only branch | 5 | 160 | artifact-like (refactor gate) |
| C2 | `af6891c2` | ScheduleTriggerSchema + inline cron utility + IANA tz | 215 | 565 | **2.63x** (cross-ref Zod) |
| C3 | `d96c1d52` | organizations.timezone column + resolve helper + migration | 40 | 95 | 2.4x (schema + fallback chain tests) |
| C4 | `a7269175` | scheduled_triggers tables + persistence helpers + in-memory store | 220 | 225 | 1.02x |
| C5 | `289727df` | Dispatcher (catchup + concurrency) + Drizzle store + route wire | 260 | 300 | 1.15x |
| C6 | `[this commit]` | Integration test + 9-probe regression + close-out | 0 | 220 | artifact |
| **PR 1 total** | | | **~740 prod** | **~1,565 tests** | **2.12x aggregate** |

**PR 1 LOC envelope:** ~2,305 LOC (prod + tests; excludes close-out report artifact).
Audit projection: ~1,100 LOC.
Stop-and-reassess trigger: ~1,430 LOC (30% over 1,100).
→ **61% over projection. Materially above trigger.**

### §11 LOC overrun analysis

Per L-17 decision-framework (tasks/lessons.md audit-time trigger overshoot
addendum):

1. **Is every LOC defensible against a specific purpose?** Yes. Each component
   maps to §3 or §4 of the approved audit. No scope creep detected. The
   inline cron utility (C2) replaces the rejected `croner` dependency
   install with ~180 LOC of tested pure logic — not original scope, but
   structurally unavoidable given the worktree's pnpm-virtual-store
   limitation (same constraint that produced SLICE 2's inline AST work).

2. **Is the overshoot within L-17 measurement noise (±5-7%)?** No —
   61% is well past measurement noise. This is a material overshoot.

3. **Can the overshoot be absorbed without scope-cutting?** Yes. The
   stop-and-reassess trigger was set against the audit's original 1,100
   LOC projection; the ACTUAL scope includes three components that
   weren't fully budgeted in the projection:
   - Inline cron utility (~180 prod + ~185 tests = ~365 LOC; audit
     budgeted ~40 prod for a croner adapter + ~60 tests = ~100 LOC)
   - Fallback-chain resolver (~30 prod + ~95 tests = ~125 LOC; audit
     budgeted ~25 prod + ~20 tests inside C3's overall envelope)
   - Dispatcher with three catchup policies + three error paths
     (~260 prod + ~300 tests = ~560 LOC; audit budgeted "dispatcher
     extension" at ~150 prod + ~200 tests = ~350 LOC, underscoping
     the breadth of the catchup + concurrency + idempotency matrix)

**Honest framing:** the audit's 1,100 LOC projection was light. The
actual work needed to ship a functioning dispatcher with all 3 catchup
policies + concurrency + idempotency + IANA timezone support is closer
to 2,300 LOC. This is PROJECTION CALIBRATION error at audit time, not
mid-implementation scope creep.

**PR 1 still closes:**
1. Every line maps to an approved §3/§4 capability.
2. No padding or speculative work. Every commit shipped its calibrated
   L-17 category band (except C2 which confirmed the cross-ref 2.5-3.0x
   rule).
3. Cutting scope to hit 1,430 LOC would require dropping either the
   cron utility (blocks C2 entirely) or the catchup logic (blocks the
   dispatcher's core feature). Neither is a coherent scope-cut.

**Recommended decision for Max:** accept the 2,305 LOC close + recalibrate
PR 2's projection against the new total. Per the audit's Option C split
(1,100 + 950 = 2,050 total), the combined SLICE 5 will land closer to
~3,200 LOC. Still inside the "reasonable architectural slice" band for
a state-machine-heavy infrastructure slice (SLICE 3 landed at 1,420 LOC
for simpler dispatcher work; SLICE 5 is correspondingly larger because
cron + catchup + timezone are genuinely more complex).

If Max prefers to hold the 2,080 LOC SLICE 5 aggregate ceiling, PR 2's
remaining scope (archetype template + parallel concurrency + observability +
close-out) can tighten:
- Drop the observability extension of /agents/runs (defer to follow-up)
- Skip the archetype template proof (ship raw dispatcher only; no
  end-to-end archetype demo until a post-launch slice)

Both cuts are ugly. Recommend accepting the overshoot instead.

---

## §11 L-17 cross-ref Zod validator — 2-datapoint support confirmed

| Slice | Commit | Prod | Tests | Ratio |
|---|---|---|---|---|
| SLICE 4b | customer_surfaces (~85 prod / ~250 tests) | 85 | 250 | **2.94x** |
| SLICE 5 | ScheduleTriggerSchema (~215 prod / ~565 tests) | 215 | 565 | **2.63x** |

Both datapoints inside the predicted 2.5-3.0x window. **The cross-ref
Zod validator rule moves from 1-datapoint to 2-datapoint support.**
Will fold into `tasks/lessons.md` as an L-17 addendum in PR 2 close-out.

Refined rule text:

> **Cross-ref Zod validators** (schemas with .refine() cross-validation
> + superRefine cross-table cross-refs + enum enforcement + discriminated-
> union branches) test at **2.5-3.0x** multiplier. Driven by the
> fan-out of rejection variants: each cross-ref edge generates 2-4 test
> cases (happy path + 1-3 rejection variants per guard). Common examples:
> `customer_surfaces.opt_in` z.literal(true) + entity/tool cross-refs
> (SLICE 4b); `ScheduleTriggerSchema` cron + IANA tz + enum + discriminator
> (SLICE 5 C2).
>
> Apply this multiplier at audit time when the schema under design has
> 2+ cross-ref guards. For schemas with 0-1 cross-refs, the standard
> 1.6-2.0x Zod baseline applies.

---

## What ships in PR 1

- **C1:** TriggerSchema refactored to `z.discriminatedUnion("type", [...])`.
  Existing event branch unchanged. Consumers narrowing via
  `if (trigger.type === "event")` still work (Zod inference preserves
  the discriminator-driven narrowing).
- **C2:** `ScheduleTriggerSchema` as the second discriminator branch.
  Accepts `{ type: "schedule", cron, timezone?, catchup=skip,
  concurrency=skip }`. Validation layered via Zod `.refine()` calling
  the inline cron utility (`lib/agents/cron.ts`): POSIX 5-field syntax
  + IANA tz via `Intl.DateTimeFormat` + enum-constrained catchup +
  concurrency.
- **C3:** `organizations.timezone` column (text NOT NULL DEFAULT "UTC").
  `resolveScheduleTimezone` helper with fallback chain (trigger tz →
  workspace tz → UTC).
- **C4:** `scheduled_triggers` + `scheduled_trigger_fires` tables.
  ScheduledTriggerStore contract + in-memory test harness +
  `buildInitialScheduledTrigger` + `computeNextFireAtForTrigger` pure
  helpers.
- **C5:** `dispatchScheduledTriggerTick` with three-layer logic:
  computeMissedWindows → applyCatchupPolicy → orchestrator. Drizzle-
  backed store. Wired into `/api/cron/workflow-tick` with a log-stub
  onFire (PR 2 ships archetype dispatch).
- **C6:** End-to-end integration test covering the full path
  (spec validate → trigger insert → tick fires → advance → second tick
  re-fires) + idempotency smoke + catchup=fire_all smoke.

---

## Deferred to PR 2

Per audit §7.2:
1. Archetype template for a scheduled-trigger use case (daily-digest or
   weekly-reconcile). Establishes a proof-of-concept + probe hash
   baseline.
2. Archetype-run dispatch in the onFire callback (replaces PR 1's
   log stub). Inserts `workflow_runs` row + starts first step.
3. Observability extension of `/agents/runs` (per G-5-6): sidebar
   "Active schedules" section + "fired via schedule" pill on runs.
4. L-17 addendum for the 2-datapoint cross-ref Zod validator rule.
5. Final 9-probe regression (22-in-a-row streak extension).
6. SLICE 5 close-out report.

---

## Sign-off

SLICE 5 PR 1 code complete + green bar clean. 21-in-a-row hash streak
extended — TriggerSchema discriminated-union refactor preserved
archetype hashes exactly as predicted (schema inference preserved
consumer narrowing; zero structural change visible to synthesis).

LOC overshoot (2,305 actual vs 1,100 projected) flagged + analyzed.
Recommended acceptance + PR 2 recalibration per L-17 decision framework.

**Per L-21:** stopping here. Do NOT start PR 2 until Max approves PR 1
close + LOC decision.
