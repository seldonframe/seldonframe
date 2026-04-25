# PR 3 regression report — 3 archetypes × 3 live probes against CRM v2

**Date:** 2026-04-22
**CRM block state:** v2 shape (migrated this PR, commit `212166e8`)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Validator issues | Structural hash | Avg cost | Avg latency |
|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS | PASS | PASS | 0 / 0 / 0 | `91d983f11180d68d` (identical across all 3) | **$0.0754** | 18.0s |
| **win-back** | PASS | PASS | PASS | 0 / 0 / 0 | `afdf6da22817c737` (identical) | **$0.0835** | 18.6s |
| **review-requester** | PASS | PASS | PASS | 0 / 0 / 0 | `c82f2db816a85c81` (identical) | **$0.0688** | 15.0s |

All 9 validator checks ran inside `pnpm test:unit` via the new
`PR 3 regression — 9 live-probe outputs validate clean` describe
block in `packages/crm/tests/unit/validator.spec.ts` — zero
audit-critical issues across the full set.

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each

**PASS.** Structural hashes computed by stripping NL-generated copy strings
(initial messages, email/SMS bodies, subject lines) and hashing the
remaining skeleton (step ids + types + tool names + captures + extract
keys + next pointers + trigger shape + variable keys). All three
archetypes produced structurally identical output across 3 runs.
Synthesis-generated NL copy does vary run-to-run (as expected — Claude's
temperature isn't zero for text) but the structural shape Claude picks is
stable.

### Gate 2: total cost per synthesis <$0.10 average (v1 ship criterion)

**PASS.** All three archetypes sit under $0.10:

- Speed-to-Lead: $0.0754 avg (baseline $0.073, +3.3%)
- Win-Back: $0.0835 avg (baseline $0.082, +1.8%)
- Review-Requester: $0.0688 avg (baseline $0.067, +2.7%)

All within +20% regression tolerance Max set. The uniform modest uptick
(~2-3% across all three) likely reflects the v2 CRM contract being
slightly longer than v1 (JSON-object entries + the TOOLS block) — not a
design-cost regression. Well within the <$0.10 ship bar with headroom.

### Gate 3: PR 2 validator flags zero false positives on valid archetypes

**PASS.** All 9 filled specs pass validation against the PR 2 validator
with zero audit-critical issues. Validator does NOT mistake valid
synthesis output for broken. Confirms:
- `{{variable}}` resolution (variables from `spec.variables` pass)
- `{{reserved.namespace}}` resolution (trigger / contact / agent pass without path check)
- `{{extract}}` resolution (extracts from earlier conversations pass)
- `{{capture.field}}` resolution across the data-unwrap convention (Win-Back's 6 `{{coupon.*}}` refs all walk the `data.{couponId,promotionCodeId,code}` shape correctly)
- Tool name resolution against CRM + stubs (integration-test registry)

### Gate 4: validator catches injected errors (sanity)

**PASS** — verified via the 2 broken fixtures in
`packages/crm/tests/unit/fixtures/agents/`:
- `broken-unresolved-tool.invalid.json` → `unknown_tool` fires correctly
- `broken-capture-typo.invalid.json` → `unresolved_interpolation` fires on `{{newContact.fullName}}` with a message listing available fields

Validator is running and is not vacuously passing.

### Gate 5: `pnpm emit:blocks:check` shows no drift

**PASS.** After CRM v2 migration and emit, the drift-detector returns
`No drift`. Committed BLOCK.md matches freshly-emitted output byte-for-byte.

## Red flags — none fired

| Red flag from PR 3 directive | Status |
|---|---|
| Archetype cost regresses >20% from baseline | No — worst is Speed-to-Lead at +3.3% |
| Determinism drops below 3x structurally-identical | No — all three archetypes hit 3/3 identical |
| Validator surfaces errors on known-good archetype output | No — 0 critical issues across all 9 runs |
| Schema migration forces tool-signature changes | No — crm.tools.ts unchanged; only crm.block.md migrated |
| CRM block fails to parse under both v1 and v2 paths | No — parses v2 cleanly; parser unit tests still green |

## Pattern proven for 2b.2

CRM v2 migration validated end-to-end:
- **Shape works**: typed `produces` + `consumes` + TOOLS block emitted from Zod source round-trips cleanly.
- **Validator works**: catches the audit's named bug class (capture field typos) without false positives on valid output.
- **No runtime impact**: synthesis cost / latency / determinism within +20% tolerance of the v1 baseline.
- **Mechanical from here**: the remaining 6 core blocks in 2b.2 follow the same migration pattern — new `<block>.tools.ts` (if not present), rewrite `## Composition Contract` to v2 shape, run `pnpm emit:blocks`, commit.

## Artifacts

- `speed-to-lead.run{1,2,3}.json` — 3 filled AgentSpec outputs
- `win-back.run{1,2,3}.json` — 3 filled AgentSpec outputs
- `review-requester.run{1,2,3}.json` — 3 filled AgentSpec outputs

The `tasks/phase-7-archetype-probes/<archetype>.{filled,raw,report,prompt}.*`
files are also updated from these runs (per-archetype .filled.json mirrors
`run3.json` since the probe script overwrites on each invocation).
