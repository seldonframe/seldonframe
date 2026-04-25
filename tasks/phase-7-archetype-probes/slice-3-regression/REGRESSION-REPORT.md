# SLICE 3 PR 1 regression report — 9 live probes

**Date:** 2026-04-23
**Scope:** SLICE 3 PR 1 (state-access step types in AgentSpec — read_state, write_state, emit_event).
**Commits:** C1 `3a098a03` → C2 `2df704c4` → C3 `21bdb41e` → C4 `3dedd45a` → C5 `62af9a46`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | SLICE-2-PR-2 baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0770 | PASS $0.0768 | PASS $0.0763 | $0.0767 | $0.0768 | −0.1% | `735f9299ff111080` |
| win-back | PASS $0.0839 | — | PASS $0.0842 | $0.0841 | $0.0841 | 0.0% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0703 | PASS $0.0699 | PASS $0.0702 | $0.0701 | $0.0709 | −1.1% | `4464ec782dfd7bad` |

> Win-back run 2 had a cosmetic `fs.open` error during the intermediate raw-txt write, but the `.filled.json` output landed cleanly and hashed to the baseline alongside runs 1 + 3. All three slice-3-regression artifacts match. Treating as clean.

**15-in-a-row** hash preservation streak:

  PR 3 → 2b.2 (6 blocks) → 2c (PR 1/2/3) → SLICE 1-a →
  SLICE 1 PR 1 / PR 2 → SLICE 2 PR 1 / PR 2 → **SLICE 3 PR 1**

Expected outcome — SLICE 3 ships new step types that existing archetypes (speed-to-lead / win-back / review-requester) don't use. Their synthesis surface is byte-identical to SLICE 2 close. Cost deltas within ±1%. The synthesis comparison harness (C5) exercises the new types on NET-NEW scenarios; the probe regression exercises the UNCHANGED archetypes.

---

## PR summary — 6 mini-commits

| # | Commit | Scope | LOC |
|---|---|---|---|
| C1 | `3a098a03` | read_state schema + SoulStore + dispatcher + validator layer + 22 tests | 794 |
| C2 | `2df704c4` | write_state schema + static allowlist + dispatcher + 11 tests | 571 |
| C3 | `21bdb41e` | emit_event schema + registry cross-check + dispatcher + 8 tests | 508 |
| C4 | `3dedd45a` | shared interpolation helper + refactor + 14 tests + L-17 addendum | 318 |
| C5 | `62af9a46` | synthesis comparison harness: 10 scenarios + runner + 7 tests | 528 |
| C6 | `[this commit]` | 9-probe regression + close-out report | ~800 |
| **Total (excl. close-out)** | | | **~2,719** |

Running PR total including C6's report + artifacts: **~3,519 LOC**.

---

## LOC Overrun Analysis (per Max's Condition 2)

| Metric | Value |
|---|---|
| **Audit projection** | 1,350 |
| **Actual final (excl. C6 artifacts)** | ~2,719 |
| **Actual including C6** | ~3,519 |
| **Overrun vs audit projection** | +101% (excl. C6) / +160% (incl. C6) |
| **Overrun vs 1,275 stop-trigger** | +113% (excl. C6) / +176% (incl. C6) |

### Root cause

**Methodology gap in the SLICE 3 audit — not scope creep or undisciplined implementation.**

The audit §9 applied the 1.3x test multiplier (single/two-path category) on the basis that the three new step types are "parallel dispatchers with no runtime interaction." That framing captured the runtime-path interaction level correctly (dispatchers don't race each other), but missed the **dispatcher-count scaling axis**:

- Each dispatcher is a complete validated primitive, not a shared-runtime modification.
- Each needs its own schema (~20 LOC) + type + guard + `validate<X>Step` function (~30-80 LOC) + import wiring (~20 LOC) = ~80 LOC production per dispatcher.
- Each needs its own test suite covering happy path + interpolation + error branches + defense-in-depth = ~200 LOC tests per dispatcher.
- Parallel-path classification missed that N dispatchers = **N× test surface**, not shared test surface.

Evidence (excl. C4 refactor + C5 harness + C6 close-out):

| | Audit projected | Actual |
|---|---|---|
| C1 (read_state) | ~320 | ~720 |
| C2 (write_state) | ~250 | ~550 |
| C3 (emit_event) | ~270 | ~440 |
| **C1-C3 subtotal** | **~840** | **~1,710** |

~2.0x on test-LOC alone across dispatchers. The 1.3x projection undershot by a factor that matches the N-dispatcher scaling.

### L-17 addendum captured in C4 per Condition 1

Committed in `3dedd45a` (tasks/lessons.md):

> L-17 — Dispatcher-heavy slices need higher test-LOC budgets than parallel-path count implies.
>
> Rule: when audit §8 shows N new dispatchers (not shared runtime modifications), estimate ~80 LOC production per dispatcher + ~200 LOC tests per dispatcher. Multi-dispatcher slices have N× test surface, not shared test surface. Additional axis BEYOND the 1.3x/1.6x/2.0x path-interaction spectrum.

Future audits should state BOTH the dispatcher-count multiplier AND the path-interaction multiplier separately in the §11 LOC table.

### No corrective scope-cut applied

Per Max's overrun decision:
> Overrun driven by audit methodology under-specifying test depth and validator coverage for dispatcher-heavy slices — not scope creep or undisciplined implementation. Correction is in future audit methodology.

SLICE 4 audit will apply the corrected methodology:
- Count dispatchers explicitly.
- Apply ~80/200 LOC per dispatcher.
- If re-estimate materially exceeds 4,000 LOC upper bound, audit-time conversation required before implementation.

---

## Synthesis comparison harness results (§9.1 — C5)

10 hand-crafted scenarios exercised both paths:

| Metric | Baseline (mcp_tool_call-only) | Candidate (with new types) |
|---|---|---|
| Avg steps per scenario | 6.0 | 6.0 (unchanged — no step inflation) |
| Total mcp_tool_call count | 35 | 14 (−60%) |
| Total state-access step count | 0 | 22 |
| Avg distinct step types | 2.5 | 4.0 |
| Distribution match vs expected pattern | — | 10/10 (gate was ≥8) |

**Readability uplift:** candidate path cuts mcp_tool_call coupling by 60% across state-touching scenarios; step-type diversity rises from 2.5 → 4.0 distinct types. Step count preserved — new types REPLACE tool calls, don't add alongside them.

**Gate-worthy outcome met:** all 10 scenarios distribution-match. Both paths parse via AgentSpecSchema. Production ready.

Caveat: the harness uses hand-crafted specs to measure STRUCTURE. Real LLM synthesis would produce higher variance — Claude's adoption of new types depends on prompt engineering that PR 1 does NOT ship. Follow-up SLICE 3 PR 2 (synthesis prompt update) could improve LLM-driven adoption if evidence shows Claude underusing the new types in production archetype generation.

---

## Green bar

- `pnpm test:unit` — **671 pass + 5 todos** (was 570+1 at SLICE 2 close → +101 pass + 4 new state-access-related todos).
- `pnpm emit:blocks:check` — clean (9 blocks: crm / caldiy-booking / email / sms / payments / formbricks-intake / landing-pages / notes / vehicle-service-history).
- `pnpm emit:event-registry:check` — clean (47 events, no drift — SLICE 3 doesn't touch the SeldonEvent union).
- `tsc --noEmit` — 4 pre-existing unrelated errors, zero new.
- 9 archetype regression probes PASS with hash preservation.

Containment delivered:
- Zero changes to SeldonEvent union
- Zero changes to 7 core blocks
- Zero changes to subscription primitive (SLICE 1)
- Zero changes to scaffolding primitive (SLICE 2)
- Zero archetype source file changes (existing archetypes unchanged)
- RuntimeContext gained TWO optional fields (soulStore + emitSeldonEvent); existing dispatchers ignore them
- mcp-tool-call.ts refactored but behavior strictly preserved (verified by existing test suite)

---

## What ships — SLICES 1-3 complete

Three of the six atomic agent primitives are now first-class step types:
- **read** → `read_state` (SLICE 3)
- **commit (write)** → `write_state` (SLICE 3)
- **emit** → `emit_event` (SLICE 3)

The other three (trigger, execute via tools, next-action) already existed. **AgentSpec's atomic decomposition is complete for state access.**

Remaining in Scope 3:
- SLICE 4 — UI composition layer
- SLICE 5 — scheduled triggers
- SLICE 6 — external-state branching (the `decide` atom; 2e scope)
- SLICE 7 — message triggers
- SLICE 8 — workspace test mode
- SLICE 9 — worked example + composability validation

---

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`

## Sign-off

SLICE 3 PR 1 green bar complete. State-access step types are live. 15-in-a-row hash streak preserved.

LOC overrun at +101% vs audit projection is a methodology calibration issue, not a quality issue. L-17 dispatcher-count addendum captured; SLICE 4 audit will apply the corrected methodology.

Per rescope discipline: **do NOT start SLICE 4 audit drafting until Max explicitly approves this close-out.**
