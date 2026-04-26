# SLICE 11 — implementation baseline + scope memo

**Date:** 2026-04-26
**Branch:** `claude/slice-11-cost-observability`
**Base:** main HEAD `0122710f` (post-SLICE-10 merge)
**Audit:** [step-11-cost-observability-audit.md](step-11-cost-observability-audit.md)
**Gate resolutions:** Max's gate-resolution prompt (Option 3 minimum
viable instrumentation; G-11-1/2/3 deferred to v1.1).

---

## Gate decisions snapshot (final)

| Gate | Decision |
|---|---|
| **G-11-6 NEW** | Ship `llm_call` as 10th step type with dispatcher invoking Claude + calling `recordLlmUsage`. Launch-blocker fix. |
| **G-11-1** | Per-step token tracking — DEFER to v1.1 |
| **G-11-2** | Aggregate cost dashboard — DEFER to v1.1 |
| **G-11-3** | Multi-LLM-provider pricing — DEFER to v1.1 |
| **G-11-4** | Cost alerts / budget caps — OUT OF SCOPE |
| **G-11-5** | Cost API export — OUT OF SCOPE |

## Scope

**In:** `llm_call` step type + dispatcher + `recordLlmUsage` wiring +
empirical HVAC archetype cost capture + marketing reconciliation.

**Single PR.** Projected ~525-860 combined code; 1,040 stop trigger.

## Mini-commit plan

| # | Mini-commit | Estimated combined |
|---|---|---|
| C0 | L-17 addendum 3 + this baseline | doc only |
| C1 | `LlmCallStepSchema` + cross-ref validator + 10th step type | ~280 (80 prod + 200 test) |
| C2 | `dispatchLlmCall` + Claude SDK invocation + `recordLlmUsage` integration | ~340 (155 prod + 185 test) |
| C3 | Empirical HVAC archetype cost capture (integration test) | ~120 (test only) |
| C4 | 18-probe regression + close-out + marketing reconciliation | doc only |
| **Total** | | **~740 combined** |

Within the 400-800 expected band; under the 1,040 stop trigger.

## Per-file estimates (L-17 addendum 2 + 3 applied)

Tier defaults from addendum 3:
- Unit-thin: 10-12 LOC/test
- Unit-rich: 15-18 LOC/test
- Integration: 22-28 LOC/test
- Edge-case: 25-30 LOC/test

### Production files

| File | Est. prod LOC | Notes |
|---|---|---|
| `lib/agents/validator.ts` (extension) | ~80 | LlmCallStepSchema + type guard + cross-ref + 10-type message |
| `lib/workflow/step-dispatchers/llm-call.ts` | ~140 | New dispatcher: interpolation + Claude SDK + recordLlmUsage + capture |
| `lib/workflow/runtime.ts` (extension) | ~25 | Dispatch switch entry |
| `lib/workflow/types.ts` (extension) | ~10 | RuntimeContext field for `invokeClaude` injection |
| **Subtotal** | **~255** | |

### Test files

| Test file | Tier | Est. tests | Est. LOC |
|---|---|---|---|
| `llm-call-step-schema.spec.ts` | unit-rich | 14-18 | 210-325 |
| `dispatch-llm-call.spec.ts` | unit-rich | 10-14 | 150-250 |
| `slice-11-integration.spec.ts` | integration | 4-6 | 90-170 |
| **Subtotal** | | **28-38** | **~450-745** |

### Combined projection

| Path | Combined LOC |
|---|---|
| Low | ~705 |
| Mid | ~830 |
| High | ~1,000 |

Mid-band sits comfortably within the 400-800 expected; high-band
brushes the 1,040 stop trigger but doesn't exceed it.

## L-17 addendum 3 application

This is the **first slice** to apply addendum 3 at audit time. Test
LOC tier predictions:
- Unit-rich tier: 15-18 LOC/test (default for SLICE 11 schema +
  dispatcher tests)
- Integration tier: 22-28 LOC/test (used for slice-11-integration)

**Watch item:** at C4 close-out, validate per-tier prediction
accuracy. If integration tier runs ~50% over (matching SLICE 10 PR 2
empirical), addendum 3 may need a "fixture-heavy integration"
sub-tier.

## Empirical reconciliation (C3 + C4)

After C2 wires the dispatcher, run all 4 HVAC archetypes through
the runtime with `recordLlmUsage` capturing actual usage. Capture
the real per-run cost values from `workflow_runs.totalCostUsdEstimate`
and reconcile against marketing copy:

| Archetype | Marketing estimate | Actual | Δ |
|---|---|---|---|
| Daily digest | $0.05 | $___ | _ |
| Pre-season campaign | $2.40 | $___ | _ |
| Heat advisory | $0.32 | $___ | _ |
| Emergency triage | $0.08 | $___ | _ |

**Catch:** the existing HVAC archetypes don't currently use the
`llm_call` step type — they use `wait` / `mcp_tool_call` (non-LLM
tools) / `branch` / `await_event` / `request_approval`. To produce
non-zero cost data, C3 must either:
- (a) Add `llm_call` steps to one or more archetypes (modifies
  existing archetypes — risk to G-9-7 isolation invariant)
- (b) Author a SLICE 11 test fixture archetype that exercises the
  `llm_call` step + verify it produces cost data
- (c) Run a synthesis-time probe that uses `llm_call` against Claude
  + capture cost

**Recommendation: Option (b)** — author a minimal test fixture
spec in the test suite that uses `llm_call`, run it through the
in-memory storage harness with a stub Claude invoker, verify
`recordLlmUsage` is called with the right args, and verify the
storage layer's cost columns get the increment. Then for actual
cost reconciliation, use one of the existing pre-launch probes
that DOES invoke Claude (e.g., the 18-probe regression already
runs Claude calls for archetype synthesis — but that's synthesis
cost, not workflow runtime cost).

For C4 marketing reconciliation: explicitly document that the
existing HVAC archetypes don't use `llm_call` today (so workflow
runtime cost = $0), and the marketing numbers are aspirational
targets for hypothetical archetypes that WOULD use `llm_call`.
Actual reconciliation will happen post-launch when operators
build archetypes that use the new step type.

This is a more honest read of the situation than pretending we
can reconcile against archetypes that don't invoke LLMs.

## Containment

| Surface | Changes? | Notes |
|---|---|---|
| Global archetype registry | ✅ none | 6 archetypes preserved; 30-streak protected |
| Workspace-scoped HVAC archetypes | ✅ none | C3 uses test fixtures, not archetype edits |
| `lib/agents/types.ts` core | ✅ none | Schema extension at validator layer |
| Subscription primitive / scaffolding core | ✅ none | Orthogonal |
| `workflow_runs` schema | ✅ none | Cost columns from SLICE 9 PR 2 reused unchanged |
| `workflow_step_results` schema | ✅ none | Per-step cost deferred to v1.1 (G-11-1) |
| `workflow_approvals` schema | ✅ none | SLICE 10 unchanged |
| `lib/ai/pricing.ts` | ✅ none | Multi-provider deferred to v1.1 (G-11-3) |
| `lib/ai/workflow-cost-recorder.ts` | ✅ none | Already implemented; SLICE 11 just wires callers |
| New: `LlmCallStepSchema` | ✅ new | 10th step type (validator layer) |
| New: `dispatchLlmCall` | ✅ new | New step dispatcher |
| `lib/workflow/runtime.ts` | ✅ extended | Dispatch switch entry |
| `lib/workflow/types.ts` | ✅ extended | RuntimeContext.invokeClaude field |

## Green bar (per L-27)

| Check | Source | Expectation |
|---|---|---|
| `pnpm typecheck` | repo root | Zero errors |
| `pnpm test:unit` | repo root | 1818 baseline → expected ~1,860+ |
| `pnpm emit:event-registry:check` | repo root | No drift |
| `pnpm emit:blocks:check` | repo root | Pre-existing 9-file LF↔CRLF drift only (non-gating per prior PRs) |
| 18-probe regression | new dir under `tasks/phase-7-archetype-probes/slice-11-regression/` | 18/18 PASS — 30-streak holds |
| Vercel preview | observe at HEAD post-push | 🟡 PENDING USER CONFIRMATION (per L-27) |

## Watch items

1. **`recordLlmUsage` actually called in production path** — the
   audit's headline finding. C3 integration test verifies the
   call happens with the right args.
2. **Cost calculation precision** — pricing.ts already tested for
   sub-penny rounding; SLICE 11 doesn't change pricing.ts.
3. **Error handling for LLM call failures** — if Claude API throws,
   does the dispatcher record partial usage? Default: no — the
   dispatcher catches the error before `recordLlmUsage` is reached;
   no usage data → no cost recorded. Documented in C2 dispatcher.
4. **Test fixture credentials** — Anthropic API key in tests = NEVER.
   Tests use a stub invoker that returns a mocked response shape.
5. **Per-test LOC tier accuracy** — first SLICE applying addendum 3
   at audit time. C4 close-out validates.

## Per L-21 + L-27: STOP at PR close

Standard discipline:
- Green bar verified locally
- Push to origin
- Vercel preview at PR HEAD must be observed green by Max
- Close-out at `tasks/step-11-closeout.md` with empirical cost
  reconciliation + per-tier accuracy verdict
- Then await Max approval before SLICE 11 merge to main
