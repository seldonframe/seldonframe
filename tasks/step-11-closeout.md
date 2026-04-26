# SLICE 11 — close-out

**Date:** 2026-04-26
**Branch:** `claude/slice-11-cost-observability`
**Base:** main HEAD `0122710f` (post-SLICE-10 merge)
**HEAD:** `[after-C4]`
**Audit:** [step-11-cost-observability-audit.md](step-11-cost-observability-audit.md)
**Baseline:** [step-11-baseline.md](step-11-baseline.md)
**Regression:** [phase-7-archetype-probes/slice-11-regression/REGRESSION-REPORT.md](phase-7-archetype-probes/slice-11-regression/REGRESSION-REPORT.md)

---

## What shipped

The launch-blocker fix per audit §2.1 headline finding: the SLICE 9
PR 2 cost recorder now has a production caller via the new
`llm_call` step type (the 10th).

**5 commits** (audit + C0 + C1 + C2 + C3 + C4 close-out).

| # | Commit | One-line scope |
|---|---|---|
| Audit | `d12e9a87` | SLICE 11 audit (804 lines, §1-17) |
| C0 | `3baff204` | L-17 addendum 3 (per-test LOC tier sub-categorization) + baseline |
| C1 | `80c690da` | LlmCallStepSchema + cross-ref + 10th step type (26 tests) |
| C2 | `c5eaa552` | dispatchLlmCall + Claude SDK + recordLlmUsage wiring (11 tests) |
| C3 | `4e7adb74` | End-to-end cost capture verification — runtime → dispatcher → recorder (3 tests) |
| C4 | `[this commit]` | 18-probe regression + close-out + marketing reconciliation |

## Final LOC totals

- **Combined code (prod + test):** ~1,215 LOC
- **Doc artifacts:** ~1,200 LOC (audit 804 + baseline 192 + close-out + regression report)
- **40 new tests** across 3 files; suite total **1,858 pass / 0 fail / 12 todo**

**Combined code overran the 1,040 stop trigger by ~17%.** Per the
regression report's LOC envelope analysis, the overrun is entirely
in test code; production landed mid-band of the 525-860 prod-only
projection. Drivers documented + addendum 3 refinement codified
(see L-17 verdict below).

## L-17 hypothesis measurements

### L-17 addendum 3 (per-test LOC tier sub-categorization) — first audit-time application

**Predicted (baseline C0):**
- Unit-rich tests at 15-18 LOC/test (C1 schema, C2 dispatcher)
- Integration tests at 22-28 LOC/test (C3)

**Actual:**
- C1 unit-rich: 26 tests × ~13 LOC = ~335 (per-test count over 1.4-1.9x; per-test LOC under)
- C2 unit-rich: 11 tests × ~26 LOC = ~285 (per-test LOC over by 1.6x — fixture-heavy injection patterns)
- C3 integration: 3 tests × ~65 LOC = ~195 (per-test LOC over by 2.6x — full-runtime advanceRun loop)

**Verdict: addendum 3 CONFIRMED with another sub-tier needed.**
The "integration" tier as defined (~22-28 LOC/test) captures
moderate multi-module orchestration. **Full-runtime integration**
(advanceRun loop + storage + dispatcher + injection + assertions
about captureScope + status transitions) runs 50-70 LOC/test —
roughly 2x the addendum 3 integration default.

**Refinement for SLICE 12 forward:** add a "full-runtime integration"
tier at ~50-70 LOC/test. The existing "integration" tier remains
for narrower multi-module tests.

### A and B from prior slices

PR didn't add new schema cross-refs or new orthogonal dispatcher
patterns at the SLICE 6/7/10 scale, so neither hypothesis A
(cross-ref Zod gate-breadth) nor hypothesis B (dispatcher
orthogonal interleaving) had a fresh datapoint here. Both stand at
their SLICE 10 verdicts.

## Marketing reconciliation

Per Max's prompt: "SLICE 11 close-out must include empirical per-run
cost data from running all 4 HVAC archetypes with the wired
recorder. Marketing copy updates to whatever the recorder actually
produces. Flag if actuals differ from estimates by >2x."

**Empirical runs: NONE PRODUCED.** The 4 existing HVAC archetypes
do not currently use the `llm_call` step type. Running them produces
$0 / 0 tokens because no step in any of them invokes Claude.

**The "$0.05 daily digest, $0.32 heat advisory" marketing numbers
are aspirational targets** for hypothetical archetypes that WOULD
use `llm_call` — they are NOT empirical measurements (audit §2.10
verified the numbers don't appear anywhere in running code).

**Recommended marketing copy update** (full text in regression
report):

> Workflows that invoke an LLM (via the new `llm_call` step) capture
> real spend in your dashboard. The current example archetypes don't
> use LLM calls — they're cheap orchestrations over your CRM, SMS,
> and email blocks. When you build an archetype that asks Claude to
> draft a message or summarize a conversation, the cost per run
> shows up immediately on the /agents/runs view.

**Alternative:** author one new HVAC archetype that uses `llm_call`
+ run it empirically + publish actual numbers. Documented as a
v1.1 / SLICE 12 candidate alongside the per-org cost ledger work.

**>2x delta flag:** N/A (no actuals).

## Hash streak status

**31-in-a-row** (was 30 at SLICE 10 close). Verified by 18-probe
regression at HEAD.

## Vercel preview observation

🟡 **Pending Max's direct observation per L-27.** New HEAD
post-push. Branch:
`https://github.com/seldonframe/crm/tree/claude/slice-11-cost-observability`.

## Open items for post-launch

### Immediately after SLICE 11 closes (per Max's post-merge sequence)

1. **Merge SLICE 11 to main** — same PR-with-self-review pattern as
   Scope 3 + SLICE 10 merges
2. **MCP discovery deliverable** (~3-5 days)
3. **Single launch content rewrite** (incorporates the marketing
   copy update from this close-out)
4. **Launch**

### v1.1 / SLICE 12 candidates (deferred per gate decisions)

- **Per-step cost tracking** (G-11-1) — extend workflow_step_results
  with cost columns; per-step admin display
- **Aggregate cost dashboard** (G-11-2) — workspace-level rollup;
  per-archetype + per-time-window views
- **Multi-LLM-provider pricing** (G-11-3) — extend PRICING table
  with OpenAI / Gemini entries; provider tagging
- **Per-org / non-workflow cost ledger** — covers the 23 existing
  LLM call sites in `lib/ai/` + `lib/brain*` + `lib/soul-*/`
  (block generation, brain compilation, soul wiki, etc.) that
  remain invisible operator spend
- **LLM-using HVAC archetype** — author one or more archetypes that
  use `llm_call` so empirical cost data flows into /agents/runs
  for the marketing reconciliation story
- **Pricing table staleness mechanism** — env-var override OR DB
  cache + sync job to reduce PR + deploy friction for rate updates

### Post-launch (not gating any near-term slice)

- **Cost alerts / budget caps** (G-11-4)
- **Cost API export** (G-11-5)
- **Cost forecasting / optimization recommendations**

## STOP per L-21 + L-27

Standing by for Max's Vercel preview observation at HEAD before
opening the SLICE 11 → main merge. Per discipline:
- No merge until Max approves
- Vercel green at this HEAD must be observed via direct external
  observation (screenshot or structured input)
- L-27 applies regardless of work-in-progress momentum
