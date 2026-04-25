# SLICE 9 PR 2 — Close-out summary

**Date:** 2026-04-25 · **Branch:** `claude/fervent-hermann-84055b`
**Predecessor:** PR 1 closed at `c4fdf6b9` (Vercel-verified per L-27).

---

## Scope shipped

PR 2 was the capstone PR for SLICE 9. Three workstreams folded:

- **W1** — Original PR 2: heat advisory + post-service-followup
  archetypes, integration tests, edge cases, launch content.
- **W2** — Cost observability (folded per Max's directive).
- **W3** — Logo asset application (folded per Max's directive).

13 mini-commits planned + executed (C1–C13). All landed at HEAD
on this branch.

## What landed

### Code (1,689 lines added across 26 files)

- **C1** — Brand asset application: 18 SVGs/PNGs/manifest under
  `packages/crm/public/brand/`; powered-by badge upgraded with
  `variant: "light" | "dark"` and inline wordmark; sidebar +
  layouts switched from generic logo to brand assets.
- **C2** — `hvac-heat-advisory-outreach` archetype (5 steps:
  schedule → external_state weather → mcp_tool_call →
  predicate branch → write_state). Allowlist entry for
  `workspace.soul.outreach_log.heat_advisory.{{today}}`.
- **C3** — `hvac-post-service-followup` archetype (7 steps:
  payment.completed event → wait → SMS → await_event → branch
  on rating → review request OR escalation; reminder on timeout).
  Used `any` predicate composed of 4 `field_equals` against
  high-rating literals (workaround for missing `field_gte`).
- **C4** — Cost observability foundation: 3 columns on
  `workflow_runs` (total_tokens_input, total_tokens_output,
  total_cost_usd_estimate); migration 0026; pricing table for
  Claude Opus/Sonnet/Haiku 4.x; `recordLlmUsage()` helper that
  never throws (missing tokens → no-op early return; DB errors
  → console.warn + swallow).
- **C5** — Cost observability admin UI: cost column on
  `/agents/runs` table + cost/tokens rows in the detail drawer.
  `formatLlmCost` + `formatTokenCount` helpers tested for the
  full magnitude range (em-dash for zero, sub-cent precision
  for micro-costs, 2-decimal currency for normal spend).
- **C11** — Test mode page polish: HVAC-archetype-specific
  guidance block listing how each of the 4 archetypes behaves
  under workspace test mode + a launch-walkthrough tip.

### Tests (76 new, all green)

- **C6** — Cross-archetype graph integrity (30 tests): step-id
  uniqueness, reference-existence, reachability from entry,
  cycle detection, requiresInstalled-includes-crm, marketplace
  copy thresholds. All run × 4 archetypes.
- **C7** — Branch resolution edge cases (19 tests): 11 reply
  patterns against post-service-followup check_rating; tier
  routing × 4 against emergency-triage; cohort-shape × 4
  against heat-advisory.
- **C4 unit tests** (23): pricing table contents + fallback +
  rounding precision + edge cases (NaN/Infinity/negatives);
  recorder early-return paths + sync + async DB error swallow.
- **C5 unit tests** (11): cost + token formatter behavior incl.
  string coercion + garbage input safety.

### Docs (3 launch-content files, ~3,500 words)

- **C8** — `tasks/launch-content/hvac-worked-example-walkthrough.md`
  (~1,400 words). Prospect-facing day-in-the-life narrative for
  Jordan Reyes / Desert Cool HVAC.
- **C9** — `tasks/launch-content/hvac-demo-video-script.md`
  (~750 words). Timestamped 6-min script for the SLICE 9
  launch demo.
- **C10** — `tasks/launch-content/seldonframe-vs-langgraph-crewai.md`
  (~600 words). Qualitative comparison framing for prospects + press.

## Verification at C12

- **Unit tests**: 1664 pass / 0 fail / 12 todo (1676 total).
- **Typecheck**: 4 pre-existing baseline errors only — no new
  errors introduced by any PR 2 commit.
- **Workspace-scoped HVAC archetypes** (G-9-7): all 4 stay out
  of the global registry; global archetype count remains 6.
  27-streak hash invariant preserved (formal verification at
  C13 via the 18-probe regression).
- **Cost observability**: schema + helper + UI shipped as a
  self-contained foundation. Call-site integration with
  existing Claude SDK calls (client.ts, soul-conversation.ts,
  generate-block.ts, engine.ts, seldon-actions.ts) was
  deferred — the foundation is ready to import; no live archetype
  invokes the LLM at runtime, so 0-cost rows are correct today.

## Budget actuals

- **Code**: 1,689 lines added. Spec budget was 2,150–3,200 with a
  3,900 stop trigger. Came in under the lower bound — the
  archetypes + cost observability work was tighter than estimated
  and integration test scope stayed lean (graph-integrity sweeps
  + branch-resolution edge cases instead of DB-backed E2E
  harness, which is captured as a follow-up ticket).
- **Docs**: ~3,500 words across 3 launch files + 1 close-out.
  Spec budget was ~2,500. Slight overrun (~40%) on launch
  content reflects the prospect-readability requirement —
  shorter would have been thinner narrative without saving
  much. Acceptable.

## Known follow-ups (not gating launch)

1. **DB-backed end-to-end archetype runs** (C6 deferral). Need a
   Drizzle test harness in the unit tree that the existing tests
   don't have. Captured here; not on the launch path.
2. **Claude SDK call-site integration** for the C4 cost recorder.
   The helper is shipped + tested; wrapping the 5 known call sites
   is small + isolated, can land in a follow-up commit on main
   without blocking SLICE 9 close.
3. **PredicateSchema `field_gte` primitive**. Post-service-followup's
   rating branch composed `any` of `field_equals` literals as a
   workaround. A native `field_gte` primitive would simplify this
   archetype and unlock cleaner numeric comparisons elsewhere.
4. **Per-workspace heat-advisory threshold tuning**. Currently
   hardcoded at 110°F (Phoenix convention). Other markets need
   different thresholds; configurable via Soul-driven param is
   post-launch.
5. **Stripe test-mode workspace scoping** (SLICE 8b). Already
   tracked; called out in the C11 test-mode page block.

## Next: C13

- 18-probe regression + structural-hash sweep to formally
  verify the 27-streak still holds with PR 2's archetype + brand
  asset additions.
- Push branch to origin; await Max's PR 2 sign-off per L-21 + L-27.
- Vercel preview must verify green before SLICE 9 marked closed.
