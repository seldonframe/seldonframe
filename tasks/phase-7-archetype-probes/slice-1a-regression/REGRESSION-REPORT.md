# SLICE 1-a regression report — 9 live probes

**Date:** 2026-04-22
**Scope:** SLICE 1-a (orgId required + 68 call sites migrated + per-site persistence tests + integration + SQL health-check docs).
**Commits:** Commit 1 `dfdf1810` → Commit 7 `[this PR]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-2c baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0765 | PASS $0.0770 | PASS $0.0763 | $0.0766 | $0.0770 | −0.5% | `735f9299ff111080` |
| win-back | PASS $0.0862 | PASS $0.0841 | PASS $0.0849 | $0.0851 | $0.0845 | +0.7% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0702 | PASS $0.0703 | PASS $0.0711 | $0.0705 | $0.0705 | 0.0% | `4464ec782dfd7bad` |

**10-in-a-row** hash preservation streak — extended from 2c close's 9-in-a-row. All three archetype hashes unchanged across:

  PR 3 (CRM v2) →
  2b.2 Booking / Email / SMS / Payments / Intake / Landing →
  2c PR 1 / PR 2 / PR 3 →
  SLICE 1-a

Expected outcome — SLICE 1-a is a runtime-emission refactor. Zero synthesis-layer changes. Claude's context at probe time is byte-identical to 2c close. Cost deltas within ±1%.

## PR summary — 7 mini-commits

| # | Commit | Scope | LOC |
|---|---|---|---|
| 1 | `dfdf1810` | bus.ts signature (orgId required) + 68 site migrations + test updates | ~105 net |
| 2 | `[hash]` | Dashboard server-actions persistence tests (23 sites) | ~120 |
| 3 | `34a6a430` | Portal category persistence tests (4 sites) | ~25 |
| 4 | `d6f2fd60` | Library API-helpers persistence tests (17 sites) | ~75 |
| 5 | `a21952de` | Webhook handlers persistence tests (17 sites) | ~75 |
| 6 | `04bcf230` | API routes + runtime helpers tests (7 sites) | ~40 |
| 7 | `[this commit]` | Integration + L-22 verification + SQL health-check | ~280 |
| **Total** | | | **~720 LOC** |

Audit estimate: 1,900-2,200 LOC midpoint. Stop-and-reassess trigger: ~2,860. **Landed well under estimate (~720 LOC)** because:
- Migration was 100% Category A — orgId was trivially in scope at every site. No scope threading required.
- Per-site test pattern at 5-6 LOC each (via shared `assertOrgIdExpr` helper).
- No new Drizzle schemas, no new runtime machinery — pure wiring.

## Green bar

- `pnpm test:unit` — **387/387 pass** (+71 over 2c close's 316: 68 per-site + 2 integration + 1 L-22 verification).
- `pnpm emit:blocks:check` — clean.
- `pnpm emit:event-registry:check` — clean (45 events).
- `tsc --noEmit` — 4 pre-existing errors, zero new.
- 9 archetype regression probes PASS with hash preservation.

## L-22 verification (close-out "deferred items from 2c" section)

Per addition #3 approved 2026-04-22, verification checklist:

| Deferred item from 2c PR 1 M4 | Status |
|---|---|
| Migrate 68 `emitSeldonEvent` call sites to pass `orgId` | ✅ Completed in Commit 1 |
| `workflow_event_log` receives writes in production | ✅ Guaranteed by Option 1 typecheck + SQL health-check |
| 2c synchronous wake-up scan fires against real events | ✅ Proven by Commit 7 integration test |
| No silent log-skip regression possible | ✅ Structural: TypeScript rejects omissions |

### Runtime grep verification (test-encoded)

Commit 7's integration-sync-wakeup.spec.ts includes a deterministic runtime check:

```ts
test("no production site remains without an orgId 3rd argument", ...);
```

This test walks every `emitSeldonEvent(` call in `src/app` + `src/lib`, counts top-level commas in the argument list, and asserts ≥2 commas (≥3 args). Passes on current tree. Catches any future regression where a new emit site skips orgId via `any` cast or similar typecheck escape.

### Typecheck verification (compile-enforced)

Option 1's TypeScript signature change is the structural invariant. A new `emitSeldonEvent("x", {})` call fails `tsc --noEmit` with:

```
Expected 3 arguments, but got 2.
```

This is the L-22 addendum's "structural enforcement over process discipline" in action.

### No dangling overloads verification

`bus.ts` exports exactly one `emitSeldonEvent` signature — the required-orgId one. No overloads, no transitional fallback, no legacy helper. Verified by reading the file post-Commit-1.

## Side-effect bonus: 2c sync wake-up is now live

Pre-SLICE-1-a, `bus.ts` had `if (!options?.orgId) return;` — effectively dead code for the entire sync-resume path. Post-SLICE-1-a, every emission reaches the sync-resume scan. Commit 7's integration test exercises this chain for the first time in a way that mirrors production.

## What remains

- **Out-of-slice:** SLICE 1 (subscription primitive) is now unblocked. The `workflow_event_log` populates from every emission site; subscription delivery reads from there.
- **Retention cleanup cron** — flagged in `docs/ops/workflow-event-log-health-check.md` as post-SLICE-1-a. Will land alongside SLICE 1 PR 2's subscription cron tick or as its own slice.
- **Metrics dashboard** — G-1a-4 deferred to SLICE 1 PR 2. SQL health-check doc is the interim ops readout.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (unchanged since 2b.2 Payments).
- SQL health-check: `docs/ops/workflow-event-log-health-check.md`.

## Sign-off

SLICE 1-a COMPLETE. The deferred-from-2c orgId threading landed with compile-time enforcement + runtime verification + L-22 close-out checklist. SLICE 1 subscription primitive unblocked.

Per rescope discipline: do NOT start SLICE 1 PR 1 until Max confirms SLICE 1-a approval.
