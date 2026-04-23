# SLICE 4a PR 1 regression report — 9 live probes + UI Multiplier Calibration

**Date:** 2026-04-23
**Scope:** SLICE 4a PR 1 (foundation + proof migration — tokens wrapper + admin theme bridge + PageShell + EntityTable + BlockListPage + activities proof migration).
**Commits:** C1 `61f8eaff` → C2 `48f070af` → C3 `e7102ad6` → C4 `d2a6544e` → C5 `24b75f94`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Cost sample | SLICE-3 baseline | Δ | Hash |
|---|---|---|---|---|
| speed-to-lead | ~$0.0763 | $0.0767 | −0.5% | `735f9299ff111080` |
| win-back | ~$0.0842 | $0.0841 | +0.1% | `72ea1438d6c4a691` |
| review-requester | ~$0.0702 | $0.0701 | +0.1% | `4464ec782dfd7bad` |

**16-in-a-row** hash preservation streak:

  PR 3 → 2b.2 (6 blocks) → 2c (PR 1/2/3) → SLICE 1-a →
  SLICE 1 PR 1 / PR 2 → SLICE 2 PR 1 / PR 2 → SLICE 3 PR 1 →
  **SLICE 4a PR 1**

Expected outcome — SLICE 4a PR 1 ships UI composition primitives + one admin-page proof migration. Synthesis doesn't read UI files; archetype hashes are driven by BlockSpec manifests + tool schemas. Zero changes there → zero drift.

---

## PR 1 summary — 5 mini-commits + close-out

| # | Commit | Scope | LOC |
|---|---|---|---|
| C1 | `61f8eaff` | typed design-token wrapper (functional API per G-4-4) + 9 tests | 257 |
| C2 | `48f070af` | admin theme bridge — OrgTheme → admin surface (curated 4-var override) + 6 tests | 179 |
| C3 | `e7102ad6` | `<PageShell>` + runner glob extension for .spec.tsx + 11 tests | 268 |
| C4 | `d2a6544e` | `<EntityTable>` + `<BlockListPage>` + `deriveColumns` + 25 tests | 706 |
| C5 | `24b75f94` | CRM proof migration — activities page uses PageShell + EntityTable | 87 ins / 77 del (net +10) |
| C6 | `[this commit]` | 9-probe regression + close-out report | ~800 |
| **Total (excl. close-out)** | | | **~1,420** |

**LOC envelope:** PR 1 target ~1,350; actual ~1,420 — **5% over target.** Stop-trigger 1,750 — well inside.

---

## §11 UI Multiplier Calibration Analysis (the load-bearing section)

Per audit §11: at PR 1 close, compare actual test LOC vs projection for PageShell + EntityTable + proof migration. Calculate effective UI test multiplier. Recalibrate downstream PRs if materially different from 2.5x.

### Actuals by commit

| Commit | Prod LOC | Test LOC | Multiplier | Kind |
|---|---|---|---|---|
| C1 tokens | ~95 | ~95 | 1.00x | Pure-logic module. No rendering. |
| C2 admin-theme | ~65 | ~95 | 1.46x | Pure data transform + tiny server-component wrapper. |
| C3 PageShell | ~95 | ~105 | 1.11x | First React component. renderToString smoke tests. |
| C4 EntityTable + deriveColumns + BlockListPage | ~270 | ~300 | 1.11x | Two components + one pure-logic helper. |
| C5 activities migration | ~105 | 0 | 0.00x | Proof migration — exercises patterns at integration level; no new unit tests (patterns tested in C3/C4). |
| **Aggregate** | **~630** | **~595** | **0.94x** | |

### Effective aggregate multiplier: **0.94x** — materially different from 2.5x projection.

Decision per §11.1 rules:
- Within ±15% of 2.5x (2.125x–2.875x): ❌ no — 0.94x is 62% below the lower bound of that band.
- Materially different (>15%): ✅ yes. **Recalibration required.**

### Why the multiplier ran so low

Three drivers:

1. **Shallow harness by design (G-4-6).** Tests use `renderToString` + regex assertions on HTML strings. No jsdom setup, no `@testing-library/react`, no user-event simulation, no axe-core. Test files are 80-120 LOC not 200-400 LOC.
2. **Pure-logic modules counted as UI.** C1 tokens + C4 deriveColumns are pure TypeScript functions — not UI components. Their multipliers look like dispatcher-logic multipliers (~1.0x), not UI-component multipliers.
3. **Proof migration has zero test LOC.** C5 exercises C3 + C4 patterns at integration level; adding unit tests for the migrated page would duplicate the pattern tests. Max's G-4-3 explicitly scoped proof-only migration.

### Recalibration impact for PR 2 + PR 3

Original PR 2 estimate (audit §7.2): ~2,500 LOC
  - 700 prod + 1,600 tests (2.29x multiplier projected for 4 new patterns + scaffold bridge)
  - Plus ~200 bridge code + ~80 SKILL + ~50 artifacts

Recalibrated using 0.94x-1.1x multiplier range (the observed UI range):
  - 700 prod + ~770 tests (1.1x tests) = ~1,470 LOC
  - Plus ~200 bridge + ~80 SKILL + ~50 artifacts = ~1,800 total
  - **~700 LOC under original PR 2 estimate**

Original PR 3 estimate (audit §7.3): ~1,400 LOC
  - 100 prod + 700 harness + ~600 close-out artifacts
  - Harness is already counted as artifact (not multiplier-inflated); this estimate stands.

Recalibrated SLICE 4a total:
  - PR 1 actual: 1,420
  - PR 2 recalibrated: ~1,800
  - PR 3 unchanged: ~1,400
  - **Total ~4,620 LOC — 12% under the 5,200 stop-trigger + 12% under the 5,250 audit projection.**

### §11.1 decision: proceed to PR 2 with recalibrated estimate

- Corrected total (~4,620) lands ≤5,200 trigger. Per §11.1 rule 2, proceed with PR 2; note recalibration here.
- **NOT** triggering the audit-time conversation because the recalibration is in the safe direction (projection drops, not rises).

### Proposed L-17 addendum (to ship in PR 3 close-out or a standalone doc commit)

> **L-17 — UI component test multiplier empirically runs ~1.0-1.2x, not 2.5x, when the harness is shallow.**
>
> SLICE 4a PR 1 shipped four UI components + pure-logic helpers with `renderToString`-based smoke tests (G-4-6 shallow harness). Aggregate multiplier landed at 0.94x — materially lower than the 2.5x industry-pattern estimate.
>
> Drivers:
> - Shallow harness: renderToString + regex assertions instead of jsdom + testing-library + user-event. 2-3x less test LOC per component.
> - Pure-logic modules inside UI slices (token wrappers, column-derivation helpers) act like dispatchers, not UI — 1.0x multiplier applies.
> - Proof migrations have 0x test LOC when the pattern tests cover the structural contract — don't double-count.
>
> **Rule:** for UI slices with shallow harness (G-4-6 posture):
> - Component tests: 1.0-1.2x multiplier on production LOC.
> - Pure-logic support modules: 1.0x (per L-17 original).
> - Proof migrations: 0x new test LOC (integration-covered).
>
> For UI slices with DEEP harness (jsdom + testing-library + axe-core): the 2.5x multiplier probably applies. SLICE 4a+4b don't exercise this posture; SLICE 9 or a polish slice might.
>
> **For SLICE 4b audit:** apply 1.1x test-LOC multiplier on UI components. Expect the customer-facing patterns to land materially under the audit's 2,265 LOC projection.

---

## Green bar

- `pnpm test:unit` — **722 pass + 5 todos** (was 671+5 at SLICE 3 close → +51 pass: 9 tokens + 6 admin-theme + 11 PageShell + 25 EntityTable/BlockListPage/deriveColumns = 51).
- `pnpm emit:blocks:check` — clean.
- `pnpm emit:event-registry:check` — clean (47 events, no drift).
- `tsc --noEmit` — 4 pre-existing unrelated errors, zero new.
- 9 archetype regression probes PASS with hash preservation.
- Test runner updated: `.spec.ts` + `.spec.tsx` both globbed (SLICE 4a addition).

### Quality gates (§4) self-verification

| Gate | Status |
|---|---|
| 1. Typography reads correctly | ✅ components use tokens.text() indirectly via `text-page-title` / `text-label` / `text-tiny` / `text-body` classes |
| 2. Spacing consistent (token scale) | ✅ components use `gap-6`, `p-8`, `p-4`, etc. — Tailwind's default scale matched 1:1 to token steps |
| 3. Empty states with intentional copy + CTAs | ✅ EntityTable renders "No records yet." by default; overridable |
| 6. Loading states as skeletons | 🟡 not yet applicable (PR 1 components are server components; skeleton pattern lands when PR 2 introduces client-side interactive pieces) |
| 7. Error states distinguishable | 🟡 same as 6 — not yet applicable |
| 8. No console warnings in dev | ⚠️ manual verification needed at preview URL (not automated in shallow harness) |
| 9-11. a11y + dark/light + motion | ✅ ARIA labels + scope="col" + nav landmarks + uses existing transition-duration-fast token |
| 12. No new fonts | ✅ Geist inherited; no additions |
| 13. No inline styles outside theme | ✅ admin-theme-provider is the sole inline-style user (intentional — CSS-var injection) |

Manual QA checklist moves to PR 3 close-out per G-4-6.

---

## What ships in PR 1

- `lib/ui/tokens.ts` — typed functional API for design tokens.
- `lib/theme/admin-theme.ts` + `components/theme/admin-theme-provider.tsx` — admin surface theme bridge.
- `components/ui-composition/page-shell.tsx` — admin page wrapper (title + breadcrumbs + actions + content).
- `components/ui-composition/entity-table.tsx` + `lib/ui/derive-columns.ts` — data table with Zod-schema-driven columns.
- `components/ui-composition/block-list-page.tsx` — preset: PageShell + EntityTable.
- `app/(dashboard)/activities/page.tsx` — proof migration exercising the above.
- `scripts/run-unit-tests.js` — glob extended to include `.spec.tsx`.

## Deferred

Per PR split in audit §7:
- PR 2 (recalibrated ~1,800 LOC): `<BlockDetailPage>` + `<EntityFormDrawer>` + `<ActivityFeed>` + `<CompositionCard>` + scaffold → UI bridge.
- PR 3 (~1,400 LOC): shallow integration harness + manual QA checklist + 9-probe regression + close-out.

---

## Sign-off

SLICE 4a PR 1 green bar complete. Foundation primitives landed + proof migration validates them on real CRM data. 16-in-a-row hash streak preserved.

**Key outcome beyond the code:** first empirical UI LOC calibration data — ~1.0x multiplier for shallow-harness UI work. Recalibrates SLICE 4a PR 2 + informs SLICE 4b audit methodology. L-17 addendum proposed.

**Recalibration:** PR 2 projection drops from ~2,500 → ~1,800 LOC. Trigger-safe to proceed.

Per rescope discipline: **do NOT start PR 2 until Max approves this close-out + the multiplier recalibration.**
