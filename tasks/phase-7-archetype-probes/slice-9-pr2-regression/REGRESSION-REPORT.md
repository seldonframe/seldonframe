# SLICE 9 PR 2 — 18-probe regression + PR 2 close-out

**Date:** 2026-04-25
**Scope:** SLICE 9 PR 2 (capstone — 4th HVAC archetype + cost
observability foundation + cost admin UI + integration tests + edge
cases + launch content + test mode polish + close-out).
**Predecessor:** PR 1 closed at `c4fdf6b9` (Vercel-verified per L-27);
27-streak held.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **18/18 PASS · 28-streak holds · G-9-7 isolation reverified**

6 archetypes × 3 runs = 18 structural-hash verifications.

| Archetype | Baseline | Result |
|---|---|---|
| speed-to-lead          | `735f9299ff111080` | ✅ 3/3 match |
| win-back               | `72ea1438d6c4a691` | ✅ 3/3 match |
| review-requester       | `4464ec782dfd7bad` | ✅ 3/3 match |
| daily-digest           | `6e2e04637b8e0e49` | ✅ 3/3 match |
| weather-aware-booking  | `f330b46ca684ac2b` | ✅ 3/3 match |
| appointment-confirm-sms| `ef6060d76c617b04` | ✅ 3/3 match |

**G-9-7 isolation invariant** holds end-to-end across PR 2:
- All 4 HVAC archetypes (`hvac-pre-season-maintenance`,
  `hvac-emergency-triage`, `hvac-heat-advisory-outreach`,
  `hvac-post-service-followup`) live in
  `packages/crm/src/lib/hvac/archetypes/` — workspace-scoped.
- Global registry at `packages/crm/src/lib/agents/archetypes/`
  remains exactly the 6 baseline archetypes, count = 6.
- Verified by 4 explicit isolation tests (one per archetype) +
  the cross-archetype integrity sweep added in C6 that lists the
  expected 4-archetype id set exhaustively.

PR 2 changed 0 files in the global archetype registry. The 4 HVAC
archetypes are in `lib/hvac/`; the cost observability foundation
extended `workflow_runs` schema + added `lib/ai/` helpers; the
admin UI extended `/agents/runs`; brand assets are static files;
launch content is markdown. None of these touch synthesis context
for the 6 baseline archetypes.

---

## PR 2 commit summary

| # | Commit | Scope | Code Δ | Tests Δ | Notes |
|---|---|---|---|---|---|
| C1 | `0e3c6504` | Brand asset application | varies | — | 18 SVGs/PNGs/manifest; powered-by badge variant prop; sidebar + layout switches |
| C2 | `4cbc96e7` | hvac-heat-advisory-outreach archetype | ~150 | ~150 | 5 steps; schedule + external_state weather + predicate branch + write_state |
| C3 | `b50250f9` | hvac-post-service-followup archetype | ~190 | ~210 | 7 steps; payment.completed event + wait + await_event + branch + emit_event |
| C4 | `d2c33499` | Cost observability foundation | ~140 | ~230 | 3 columns + migration + pricing table + recordLlmUsage helper (never throws) |
| C5 | `88214a15` | Cost observability admin UI | ~60 | ~75 | Cost column on /agents/runs + drawer detail rows; formatLlmCost + formatTokenCount |
| C6 | `21c7c61c` | Cross-archetype graph integrity tests | 0 | ~200 | 30 tests × 4 archetypes: uniqueness + reachability + cycles + marketplace contract |
| C7 | `79076a39` | Branch resolution edge cases | 0 | ~200 | 19 tests: 11 reply patterns + 4 tier shapes + 4 cohort shapes |
| C8 | `87cdc19d` | Worked-example walkthrough | doc | — | ~1,400 words prospect-facing |
| C9 | `38e4ec84` | Demo video script | doc | — | ~750 words timestamped 6-min |
| C10 | `848699dc` | Comparison framing (LangGraph/CrewAI) | doc | — | ~600 words qualitative |
| C11 | `e778491e` | Test mode page polish | ~50 | — | HVAC-archetype guidance block on /settings/test-mode |
| C12 | `cebea752` | Close-out summary | doc | — | Scope + verification + budget actuals + follow-ups |
| C13 | `[this commit]` | 18-probe regression + push | 0 | 0 | Artifact |

**PR 2 totals (approximate):**
- Code: ~1,690 lines (prod + tests + the C5 spec fixture amendment)
- Docs (4 launch files + close-out + this report): ~3,800 words

PR 2 budget per Max's spec: 2,150–3,200 code + ~2,500 docs;
stop trigger 3,900.
- **Code 1,690 — 21% under the lower bound, 57% under the stop trigger.**
- **Docs ~3,800 — 52% over the lower target.** Overrun reflects the
  prospect-readability requirement on launch content; tighter would
  have been thinner narrative without saving meaningful budget.

---

## Containment verification

| Surface | Changes? | Notes |
|---|---|---|
| Global archetype registry (`lib/agents/archetypes/index.ts`) | ✅ none | Count remains 6 |
| `lib/agents/types.ts` core | ✅ none | |
| SeldonEvent union | ✅ none | HVAC events live in archetype JSON |
| Subscription primitive | ✅ none | post-service-followup uses existing `event` trigger |
| Schedule dispatcher | ✅ none | heat-advisory uses existing schedule trigger |
| Branch primitive (predicate + external_state) | ✅ none | Used by 3 of 4 HVAC archetypes unchanged |
| await_event primitive | ✅ none | Used by post-service-followup unchanged |
| emit_event primitive | ✅ none | Used by post-service-followup unchanged |
| Loop guard (SLICE 7) | ✅ none | Inherited unchanged |
| Test mode runtime (SLICE 8) | ✅ none | C11 ships UI guidance copy only |
| `workflow_runs` schema | ✅ extended (additive) | 3 cost columns; migration 0026; defaults to 0 for existing rows |
| `/agents/runs` page + JSON route | ✅ extended (additive) | Cost column + drawer rows |
| New: `lib/ai/pricing.ts` | ✅ new | Pricing table + computeCallCost |
| New: `lib/ai/workflow-cost-recorder.ts` | ✅ new | recordLlmUsage helper |
| New: `lib/utils/format-llm-cost.ts` | ✅ new | UI formatters |
| New: 4-archetype HVAC registry (workspace-scoped) | ✅ extended | 1 → 4 archetypes; still NOT in global registry |
| `public/brand/*` | ✅ new | Static brand assets |
| Launch content (markdown only) | ✅ new | tasks/launch-content/ |

---

## Green bar PR 2

| Check | Source | Result |
|---|---|---|
| `pnpm typecheck` | repo root | 4 errors (matches pre-existing baseline) ✅ |
| `pnpm test:unit` | repo root | 1664/1676 (12 todo from prior scaffolded test stubs, 0 fail) ✅ |
| 18-probe regression | this regression dir | ✅ 18/18 match — 28-streak |
| G-9-7 isolation invariant | 4 dedicated tests + integrity sweep | ✅ verified |
| Cost observability defaults to 0 for existing rows | migration 0026 | ✅ verified |
| recordLlmUsage NEVER throws | C4 unit tests (NaN, sync DB throw, async DB reject) | ✅ verified |
| **Vercel preview build** | observe at HEAD post-push | **🟡 PENDING USER CONFIRMATION (per L-27)** |

---

## Per L-21 + L-27: STOP

PR 2 green bar verified locally + push pending.
**Vercel preview build at HEAD pending Max's direct observation.**
Do NOT mark SLICE 9 closed until the Vercel preview is genuinely
green AND Max has approved.
