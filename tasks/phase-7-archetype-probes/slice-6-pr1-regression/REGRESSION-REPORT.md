# SLICE 6 PR 1 close-out — branch primitive + external_state core

**Date:** 2026-04-24
**Scope:** SLICE 6 PR 1 (branch step primitive + external_state variant + schema + runtime + dispatcher).
**Commits:** C1 `9c06a62b` → C2 `0aa4392c` → C3 `4b911aab` → C4 `1504b5fe` → C5 `1ff70cce` → C6 `[this commit]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **12/12 PASS · 23-in-a-row streak · all 4 archetype baselines preserved**

| Archetype | Baseline | Result | Runs |
|---|---|---|---|
| speed-to-lead | `735f9299ff111080` | ✅ match | 3/3 |
| win-back | `72ea1438d6c4a691` | ✅ match | 3/3 |
| review-requester | `4464ec782dfd7bad` | ✅ match | 3/3 |
| daily-digest | `6e2e04637b8e0e49` | ✅ match | 3/3 |

**23-in-a-row** streak extended. No archetype uses the new branch
primitive yet (PR 2 C3's weather-aware archetype will be the first);
the 4 existing hashes preserved byte-for-byte confirms the
discriminated-union extension + runtime dispatcher addition are
synthesis-invisible, as predicted in the audit's §11.4.

### Final green bar

- `pnpm test:unit` — **1,218 pass + 5 todos** (+108 across PR 1)
- `tsc --noEmit` — 4 pre-existing, zero new across SLICE 6 PR 1
- `pnpm emit:blocks:check` — clean
- `pnpm emit:event-registry:check` — clean
- `node --import tsx --test` — 1,218 tests green

---

## PR 1 summary

| # | Commit | Scope | Prod | Tests | Ratio |
|---|---|---|---|---|---|
| C1 | `9c06a62b` | BranchStepSchema + ConditionSchema + cycle detection | 90 | 310 | 3.44x |
| C2 | `0aa4392c` | ExternalStateConditionSchema + HttpRequestConfig + Auth + interpolation-scope | 95 | 300 | 3.16x |
| C3 | `4b911aab` | fetchWithTimeout + extractResponsePath | 155 | 275 | 1.77x |
| C4 | `1504b5fe` | evaluateExternalState + auth + operators | 135 | 290 | 2.15x |
| C5 | `1ff70cce` | dispatchBranch + error matrix (7 error types × 2 timeout behaviors) | 190 | 340 | 1.79x |
| C6 | `[this commit]` | 12-probe regression + PR 1 close-out | 0 | 0 | artifact |
| **PR 1 total** | | | **~665 prod** | **~1,515 tests** | **2.28x aggregate** |

**PR 1 LOC envelope:** ~2,180 LOC (prod + tests; excludes close-out).
Audit recalibrated projection: ~2,100.
Stop-and-reassess trigger: 2,730 (30% over 2,100).
→ **4% over projection, 20% under trigger. Safe inside envelope.**

---

## §11 L-17 methodology calibration — 3rd datapoint for cross-ref Zod

Cross-ref Zod validator 3rd datapoint per Max's Condition 3:

| Slice | Validator | Cross-ref edges | Prod | Tests | Ratio |
|---|---|---|---|---|---|
| SLICE 4b | customer_surfaces | 4 edges | 85 | 250 | **2.94x** |
| SLICE 5 | ScheduleTriggerSchema | 5 edges | 215 | 565 | **2.63x** |
| SLICE 6 PR 1 C1+C2 | BranchStepSchema + ExternalStateConditionSchema | 10 edges | 185 | 610 | **3.30x** |

**Observation:** the multiplier scales with cross-ref edge count, not just "has cross-refs yes/no."

- 4-5 edges → 2.5-3.0x window (SLICE 4b, SLICE 5)
- 10+ edges → 3.0-3.5x window (SLICE 6 PR 1)

**Refinement candidate (to formalize in PR 2 close-out L-17 addendum):**

```
Cross-ref Zod validator multiplier scales with edge count:
  4-6 edges   → 2.5-3.0x (settled, 2-datapoint support)
  7-9 edges   → 2.8-3.2x (interpolated; no data yet)
  10+ edges   → 3.0-3.5x (observed, 1-datapoint support, SLICE 6 PR 1)

How to apply at audit time:
  1. Count cross-ref edges in §3 schema section
  2. Apply the multiplier from the bucket above
  3. For mixed-complexity schemas (e.g., 8 edges with 3
     discriminators + 5 refine guards), use the upper end of
     the interpolated band

Edge-counting rule of thumb:
  - discriminated union branch              = 1 edge
  - .refine() with external check           = 1 edge
  - z.literal(T) opt-in                     = 1 edge
  - enum field with 3+ values               = 1 edge
  - superRefine cross-table cross-ref       = 1 edge
  - bounds/range check                      = 1 edge per bound
```

Will fold into lessons.md at PR 2 close-out once the 3rd-datapoint
observation is durable (pending PR 2 schema work confirming the band).

---

## What ships in PR 1

**Schema + validator (C1-C2):**
- `BranchStepSchema` as the 8th known step type
- `ConditionSchema` discriminated union with 2 branches (predicate + external_state)
- `ExternalStateConditionSchema` + `HttpRequestConfigSchema` + `AuthConfigSchema`
- 9 operators (equals, not_equals, contains, gt/lt/gte/lte, exists, truthy)
- `timeout_behavior` enum (fail | false_on_timeout)
- Static graph cycle detection (G-6-8 A) — self-ref + mutual + long cycles rejected; diamonds allowed
- Multi-successor graph-ref validator (both `on_match_next` + `on_no_match_next` checked)
- Interpolation-scope guard: `{{secrets.*}}` rejected at validator time per Max's additional spec

**Runtime (C3-C5):**
- `fetchWithTimeout` utility — AbortController + structured result + 1MB body cap + tagged causes (timeout / network / body_too_large)
- `extractResponsePath` — dotted JSON path with array indexing (G-6-1 A grammar)
- `evaluateExternalState` — auth + fetch + extract + operator pipeline with SecretResolver injection
- `applyOperator` — 9-case pure fn (exported for testing)
- `dispatchBranch` step dispatcher with flat-scope predicate evaluator + external-state path + observability hook

**New validation issue code:** `graph_cycle`.

**Extended (not modified):**
- `validator.ts` — 8 known step types (was 7); `validateStep` dispatches to branch handling
- Error message for `unsupported_step_type` lists all 8 types
- `workflow-tick` route — unchanged (no new cron work; branch is synchronous step dispatch)

**Zero changes:**
- `PredicateSchema` (external_state lives on ConditionSchema, not inside Predicate)
- SeldonEvent union (workflow.external_state.evaluated is observability-only; lands in PR 2 C2)
- Subscription primitive / scaffolding core / SLICE 4 composition / SLICE 5 dispatcher
- 4 existing archetype baseline hashes preserved

---

## Deferred to PR 2

Per audit §7.2:
1. `retryWithBackoff` integration with `fetchWithTimeout` (G-6-4 B).
2. `workflow.external_state.evaluated` event emission to `workflow_event_log` (G-6-6 A). Wires to `dispatchBranch`'s `onEvaluated` hook.
3. Weather-aware archetype template + probe baseline (establishes 5th archetype hash).
4. Shallow-plus integration harness.
5. End-to-end integration test through the runtime engine (C5's dispatcher tests verify dispatcher in isolation; PR 2's integration exercises the full engine path).
6. L-17 addendum for the 3-datapoint cross-ref Zod rule with edge-count scaling.
7. Final 9-probe regression (24-in-a-row streak extension).
8. SLICE 6 close-out report.

---

## Follow-up tickets flagged (not blocking)

- **Reserved-token interpolation** ({{runId}}, {{orgId}}, {{now}}) per Max's additional gate spec — the existing `resolveInterpolations` helper passes reserved tokens through as literals. Variables + captures work today. Extension fits in a small lib/workflow/interpolate.ts patch; tracked as a PR 2 close-out follow-up ticket.
- **SecretResolver production wiring** — `dispatchBranch` accepts a SecretResolver closure; the production caller (runtime engine) needs to bind one to (orgId, db) + decrypt workspace_secrets. Not in PR 1 scope; lands with the runtime-engine integration in PR 2 C1 or its dedicated commit.

---

## Sign-off

SLICE 6 PR 1 code complete + green bar clean (tests + typecheck + emit). 23-in-a-row hash streak extended — the discriminated-union ConditionSchema + the 8th step type are fully synthesis-transparent, preserving all 4 archetype baselines across 12 probe runs.

Cross-ref Zod validator 3rd datapoint observed at 3.30x for 10-edge schemas; suggests refined multiplier buckets per edge count (pending formalization in PR 2 close-out L-17 addendum).

**Per L-21:** stopping here. Do NOT start PR 2 until Max approves PR 1 close.
