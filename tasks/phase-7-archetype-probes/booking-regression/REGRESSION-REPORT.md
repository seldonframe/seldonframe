# 2b.2 Booking block regression report — 9 live probes

**Date:** 2026-04-22
**Block migrated:** `caldiy-booking` (first 2b.2 block, risk-front-loaded)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | PR 3 baseline | Δ vs PR 3 | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS $0.0753 | PASS $0.0752 | PASS $0.0751 | **$0.0752** | $0.0754 | **−0.3%** | 3/3 identical `91d983f11180d68d` (same as PR 3) | 0 / 0 / 0 |
| **win-back** | PASS $0.0847 | PASS $0.0830 | PASS $0.0835 | **$0.0837** | $0.0835 | **+0.2%** | 3/3 identical `afdf6da22817c737` (same as PR 3) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0690 | PASS $0.0689 | PASS $0.0694 | **$0.0691** | $0.0688 | **+0.4%** | 3/3 identical `c82f2db816a85c81` (same as PR 3) | 0 / 0 / 0 |

All 9 validator checks ran via `pnpm test:unit` under the
`2b.2 Booking regression — 9 live-probe outputs validate clean` describe
block in `packages/crm/tests/unit/validator.spec.ts`. Zero audit-critical
issues across the full set.

## Red flags per 2b.2 directive — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any probe | No — worst delta is +0.4% (review-requester). Booking migration is essentially cost-neutral. |
| Determinism drops below 3x structurally-identical | No — 3/3 identical within each archetype. |
| **Structural hash shifts vs PR 3 baseline** | **No — all 3 hashes match PR 3 exactly.** The Booking migration didn't change the step layout / tool names / capture/extract keys any archetype picks. Strong signal that v2 schema doesn't create synthesis-confusion relative to v1. |
| Validator surfaces errors on known-good archetype output | No — 0 critical issues across 9 runs. |
| Schema migration forces tool signature changes | No — crm.tools.ts unchanged; caldiy-booking.tools.ts newly authored (9 tool Zod schemas) but tools.js runtime is unchanged. |
| Block fails to parse under v1 fallback AND v2 path | No — parser tests still green. Booking parses as v2; other 5 on v1. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across all three runs per archetype, and match the PR 3 baseline exactly.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes sit comfortably under $0.10 with post-Booking migration within ±0.4% of PR 3 baseline. No prompt-bloat signal from adding Booking's v2 contract.

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — the 2 broken fixtures (`broken-unresolved-tool.invalid.json` and `broken-capture-typo.invalid.json`) still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After Booking migration, both CRM and Booking TOOLS blocks round-trip cleanly.

## Pattern confirmed for remaining 2b.2 blocks

Booking was the risk-front-loaded first block (highest archetype coverage — in all 3 archetypes' `compose_with`). Zero shift in archetype synthesis output, zero new validator issues, zero cost regression. The pattern holds. Remaining 5 blocks (Email, SMS, Payments, Intake, Landing) can proceed as mechanical application.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`

The per-archetype top-level `.filled.json` / `.raw.txt` / `.prompt.txt` / `.report.md` files are also refreshed from these runs (probe script overwrites; current contents mirror each archetype's run3).
