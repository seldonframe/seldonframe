# PR body — SLICE 11: cost observability instrumentation

**This file is the PR body for the SLICE 11 merge.** Title:

> `SLICE 11: cost observability instrumentation`

---

## What ships

The launch-blocker fix per SLICE 11 audit §2.1 headline finding:
the SLICE 9 PR 2 cost recorder now has a production caller via the
new `llm_call` step type (the 10th).

Until this slice, every workflow_runs cost column read `$0` because
no LLM call site invoked `recordLlmUsage`. The marketing claim of
"see your costs" was technically unsupported by the running system.
After this slice, archetypes that include `llm_call` steps capture
real spend in the dashboard.

### 6 commits (audit + C0–C4)

- `d12e9a87` audit — SLICE 11 audit (804 lines, §1-17); headline:
  recorder uninstrumented
- `3baff204` C0 — L-17 addendum 3 (per-test LOC tier
  sub-categorization) + implementation baseline
- `80c690da` C1 — `LlmCallStepSchema` + cross-ref + 10th step type
  (26 tests)
- `c5eaa552` C2 — `dispatchLlmCall` + Claude SDK + `recordLlmUsage`
  wiring (11 tests)
- `4e7adb74` C3 — End-to-end cost capture verification — full
  runtime → dispatcher → recorder path (3 tests)
- `4ff37079` C4 — 18-probe regression + close-out + marketing
  reconciliation

## Schema design

`LlmCallStepSchema` (validator layer, .strict() throughout):
- `model`: free-form string. Unknown models fall back to Opus
  rates per `pricing.ts` FALLBACK_PRICING (multi-provider per
  G-11-3 deferred to v1.1).
- `user_prompt`: REQUIRED, supports `{{interpolation}}` resolved at
  dispatch time.
- `system_prompt`: OPTIONAL.
- `max_tokens`: OPTIONAL, defaults 4096, bounded 1-8192.
- `capture`: OPTIONAL; binds response.text to that name in
  `run.captureScope` for downstream `{{capture_name}}` interpolation.
- `next`: REQUIRED (string or null).

## Dispatcher behavior

`dispatchLlmCall`:
1. Resolves interpolations in user_prompt + system_prompt
2. Invokes Claude via injected `ctx.invokeClaude` (production binds
   an Anthropic SDK wrapper; tests inject stubs)
3. Calls `ctx.recordLlmUsage` with response.usage — uses
   `response.model` (what was billed) rather than `step.model`
4. Binds `response.text` to capture if set
5. Returns advance to `step.next`

Failure semantics (L-22 / SLICE 9 PR 2 C4 pattern):
- Invoker throws → fail action with error message; no recorder call
- Recorder throws → log + swallow; advance proceeds (cost capture
  is observability, never blocks workflow)
- Empty response + capture → capture binds to ""; downstream handles

## Totals

- **40 new tests**; suite total **1858 pass / 0 fail / 12 todo**
- **~1,215 combined code** (overran 1,040 stop trigger by 17%;
  entirely in test code; production landed mid-band)
- **~1,200 doc artifacts** (audit + baseline + close-out + regression)
- **31-streak structural-hash preservation** verified via 18-probe
  regression at PR HEAD

## L-17 addendum 3 verdict (first audit-time application)

Per-test count accuracy: 70-95% (in-band). Per-test LOC accuracy:
50-65% (out-of-band, especially for full-runtime integration tests
which ran ~65 LOC/test rather than the addendum 3 default of 22-28).

**CONFIRMED with refinement:** add a "full-runtime integration"
tier at ~50-70 LOC/test (existing "integration" tier remains for
narrower multi-module tests). Codified for SLICE 12 forward.

## Marketing reconciliation

**Empirical runs: NONE PRODUCED.** The 4 existing HVAC archetypes
don't use `llm_call` (they use `wait` / `mcp_tool_call` non-LLM
tools / `branch` / etc.). Running them produces $0 because no step
invokes Claude.

The "$0.05 daily digest, $0.32 heat advisory" marketing numbers are
**aspirational targets** for hypothetical archetypes that WOULD use
`llm_call` — they don't appear anywhere in running code (audit
§2.10 verified).

**Recommended marketing copy update:** reframe to *"workflows that
invoke an LLM via the new `llm_call` step capture real spend"*
rather than concrete dollar claims for current archetypes. (This
update is being applied as part of Workstream 2: marketing website.)

## Vercel preview verified at HEAD

- HEAD `4ff37079` — Vercel observed green by Max per L-27 on
  2026-04-26.

## Self-review summary

6 commits ahead of main; 14 files changed.

Discipline scans:
- **console.log/debug:** none in src outside scaffolder + observability ✅
- **TODO/FIXME:** none outside audit doc references to the absence ✅
- **.only / .skip:** none ✅
- **L-28 fixture format-matching:** codebase-wide grep returns
  zero violations ✅
- **Commented-out blocks:** none ✅

## Containment

- Zero changes to global archetype registry (preserves the 31-streak)
- Zero changes to `lib/agents/types.ts` core
- Zero changes to subscription primitive, scaffolding core
- `workflow_runs` schema unchanged (cost columns from SLICE 9 PR 2
  reused)
- `workflow_step_results` schema unchanged (per-step cost deferred
  to v1.1)
- `workflow_approvals` schema unchanged (SLICE 10 untouched)
- `lib/ai/pricing.ts` unchanged (multi-provider deferred to v1.1)
- `lib/ai/workflow-cost-recorder.ts` unchanged — SLICE 11 just
  wired the caller

## Deferred to v1.1 (per gate decisions)

- G-11-1 per-step cost tracking
- G-11-2 aggregate cost dashboard
- G-11-3 multi-LLM-provider pricing
- Per-org / non-workflow cost ledger (the 23 LLM call sites in
  `lib/ai/` + `lib/brain*` + `lib/soul-*/`)
- LLM-using HVAC archetype for empirical marketing reconciliation

## Out of scope (post-launch)

- G-11-4 cost alerts / budget caps
- G-11-5 cost API export
- Cost forecasting / optimization recommendations

## Merge strategy

**Standard merge commit (NOT squash, NOT rebase).** Slice-level
commit history preserved.

Merge commit message: `Merge SLICE 11: cost observability instrumentation`

## Branch cleanup

`claude/slice-11-cost-observability` deleted post-merge. History
preserved on main.
