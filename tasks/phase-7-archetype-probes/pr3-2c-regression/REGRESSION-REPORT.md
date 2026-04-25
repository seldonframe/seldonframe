# 2c PR 3 regression report — 9 live probes

**Date:** 2026-04-22
**Scope:** 2c PR 3 (observability admin surface + manual resume/cancel). Commits M1 → M5.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-PR2 baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0772 | PASS $0.0772 | PASS $0.0765 | $0.0770 | $0.0762 | +1.0% | `735f9299ff111080` |
| win-back | PASS $0.0845 | PASS $0.0846 | PASS $0.0844 | $0.0845 | $0.0844 | +0.1% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0704 | PASS $0.0707 | PASS $0.0704 | $0.0705 | $0.0707 | −0.3% | `4464ec782dfd7bad` |

**9-in-a-row hash preservation streak** (PR 3 → 6 × 2b.2 → 3 × 2c). Expected outcome — PR 3 ships UI + endpoints only; zero changes to BLOCK.md, synthesis prompts, or archetype templates.

## PR 3 green bar

- `pnpm test:unit` — **317/317 pass** (+5 new smoke tests in M4 over PR 2's 312).
- `pnpm emit:blocks:check` — clean on all 7 v2 blocks.
- `pnpm emit:event-registry:check` — clean (45 events).
- `tsc --noEmit` — 4 pre-existing errors, zero new.

## PR 3 LOC actuals vs L-17 calibration

| Mini-commit | Scope | LOC |
|---|---|---|
| M1 | workflow_step_results schema + migration + runtime write-through | 310 |
| M2 | resume + cancel endpoints + tests | 420 |
| M3 | /agents/runs page + client + JSON endpoint | 500 |
| M4 | L-17 addendum + Playwright deferral + smoke tests | 150 |
| **Total** | | **~1,380** |

Audit §8.3 estimate: 500-700 LOC. L-17 calibrated range: 600-900. Stop-and-reassess: 1,170.

**Landed ~18% past the trigger.** Stop-and-reassess fired at M3 close. Per the L-17 addendum (captured this PR), distinguishing architectural vs horizontal-infrastructure overruns gave:
- M1 + M2 + M3 (1,230 LOC): capability work mapping to audit scope. Option A profile.
- M4 (Playwright): horizontal infrastructure serving ≥5 future surfaces. Option B scope-cut to `tasks/follow-up-workflow-runs-e2e.md`.

Final PR 3 total of ~1,380 LOC includes the L-17 addendum + deferral doc + component smoke tests as the lean Option B landing. Without Playwright setup, the trigger-overrun is ~18% — acceptable per the L-17 addendum.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (unchanged since 2b.2).
