# 2c PR 1 regression report — 9 live probes

**Date:** 2026-04-22
**Scope:** 2c PR 1 (validator + Drizzle schemas + event-log persistence). Commits M1 `cd0bf4ad` → M4 `543b3ceb`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-Landing baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0767 | PASS $0.0770 | PASS $0.0764 | $0.0767 | $0.0764 | +0.4% | `735f9299ff111080` |
| win-back | PASS $0.0841 | PASS $0.0843 | PASS $0.0851 | $0.0845 | $0.0850 | −0.6% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0705 | PASS $0.0701 | PASS $0.0702 | $0.0703 | $0.0705 | −0.3% | `4464ec782dfd7bad` |

## Hash-preservation streak: 7 consecutive checkpoints

PR 3 → Booking → Email → SMS → Payments → Intake → Landing → **2c PR 1**.
All 3 archetype hashes unchanged across every checkpoint. 2c PR 1 is
purely additive (new step type the current archetypes don't use, new
DB tables, optional persistence hook on the event bus) — synthesis
output is identical at the byte-structure level.

## Why synthesis is unchanged (expected)

PR 1 doesn't ship any BLOCK.md updates, archetype-template changes, or
synthesis-prompt changes. The Claude surface sees the same 7 core
blocks with the same v2 contracts as at Landing close. The changes in
PR 1 are:

- New step type (`await_event`) that no shipped archetype uses yet.
- Three new Drizzle tables that synthesis has no reason to know about.
- An optional `emitSeldonEvent` parameter that defaults to absent.

Zero of the above reach Claude's prompt context. Hash preservation is
the predicted outcome.

## Red flags — all clear

| Red flag | Status |
|---|---|
| Structural hash shift on any archetype | No |
| Cost regression >20% | No (max delta +0.4%) |
| Determinism drop below 3/3 | No (3/3 identical per archetype) |
| `lib/agents/types.ts` changes | **None.** Predicate + Duration primitives absorbed await_event without extension. |
| Shared-schema regressions | None. SeldonEvent union unchanged. |
| Tool-signature changes to `skills/mcp-server/src/tools.js` | None. |

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (shipped in 2b.2 Payments migration; still the standard verification).

## PR 1 summary — green bar

- `pnpm test:unit` — **282/282 pass** (+22 new tests over the 260 baseline at Landing close: 7 schema tests M1 + 11 dispatcher tests M2 + 4 event-bus tests M4).
- `pnpm emit:blocks:check` — clean on all 7 v2 blocks.
- `pnpm emit:event-registry:check` — clean (45 events).
- `tsc --noEmit` — 4 pre-existing errors (junction-artifact from main worktree branch), zero new.
- 9 live probes PASS with hash preservation on all 3 archetypes.

## PR 1 LOC — actuals vs audit

| Mini-commit | Scope | LOC (actual) |
|---|---|---|
| M1 `cd0bf4ad` | `AwaitEventStepSchema` + type + guard + 7 schema tests | 240 |
| M2 `86cc961b` | `validateAwaitEventStep` + event-data-shape + predicate walker + 11 tests | 494 |
| M3 | 3 Drizzle schemas + migration + index.ts | 220 |
| M4 `543b3ceb` | `emitSeldonEvent` extension + 4 tests | 159 |
| **Total** | | **~1,113 LOC** |

Audit §8.1 estimate: 600–900 LOC. Stop-and-reassess trigger was 1,170
LOC (30% over high end). Landed at 1,113 LOC — **4.7% under the
stop-and-reassess trigger**. No trigger fired.

Breakdown analysis:
- Validator work (M1+M2) = 734 LOC vs audit's 360 LOC estimate. +103%.
  Over-scoped because: M2 added defensive re-parse inside the dispatcher
  (previously UnknownStep fallthrough absorbed malformed await_event
  shapes silently; tightening required spec_malformed routing), the
  `buildEventDataShape` helper to build Zod shapes from the EventRegistry
  for {{capture.field}} type-checking, and the `durationToApproxMs`
  helper for the G-3 ceiling check. All three are load-bearing for
  PR 2's runtime work.
- Drizzle schemas (M3) = 220 LOC vs audit's 150 LOC estimate. +47%.
  Inline containment comments are intentional (per L-17 precedent from
  Payments + Intake + Landing migrations).
- Bus extension (M4) = 159 LOC vs audit's 100 LOC estimate. +59%.
  Same doc-density pattern; actual Zod work is ~20 LOC.

Per L-17 calibration, accept-with-trace (Option A) applies. Comment
density carries non-obvious invariants (the UnknownStep fallthrough
gotcha, the best-effort log-write semantics, the G-4 interpolation
freeze timing). This is intentional and matches the 2b.2 containment
precedent.

## Next: PR 2 (runtime engine + cron tick + resume path)

PR 1 closes with the surface + schemas committed. PR 2 builds the
engine that actually executes AgentSpecs against these schemas.
Await Max's PR 1 approval before starting PR 2.
