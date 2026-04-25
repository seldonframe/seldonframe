# SLICE 7 PR 2 — fix verification + Vercel-readiness close-out

**Date:** 2026-04-25
**Trigger:** Max withdrew SLICE 7 close — Vercel preview build was FAILING on commits `01a87ac1` (PR 1) and `24ad606d` (PR 2) with type error `Module '"./validator"' has no exported member 'MessageChannel'`.
**Fix commit:** `520a0855`
**Tooling commit:** `54651bf3` (added `pnpm typecheck` script)
**This regression:** 18/18 PASS on the fixed branch.

---

## Verdict: **18/18 PASS on fix · 26-streak intact · awaiting Vercel preview observation**

| Archetype | Baseline | Result |
|---|---|---|
| speed-to-lead          | `735f9299ff111080` | ✅ 3/3 |
| win-back               | `72ea1438d6c4a691` | ✅ 3/3 |
| review-requester       | `4464ec782dfd7bad` | ✅ 3/3 |
| daily-digest           | `6e2e04637b8e0e49` | ✅ 3/3 |
| weather-aware-booking  | `f330b46ca684ac2b` | ✅ 3/3 |
| appointment-confirm-sms| `ef6060d76c617b04` | ✅ 3/3 |

The fix did not touch any archetype file or synthesis pipeline. Hashes preserve as expected.

---

## Root cause + fix

**Vercel error:**
```
./src/lib/agents/message-pattern-eval.ts:15:47
Type error: Module '"./validator"' has no exported member 'MessageChannel'.
```

**Investigation (full `tsc --noEmit -p packages/crm/tsconfig.json`):**
- The Vercel error was 1 of **15 SLICE-7-induced type errors** that local `pnpm test:unit` (which uses `tsx --test`) silently ignored.
- 1 error: wrong import path — `MessageChannel` is defined in `message-trigger-storage.ts`, not `validator.ts`. Other consumers (storage-drizzle, dispatcher) had the import right; only the evaluator was wrong.
- 11 errors: Zod `.default()` makes the inferred output type's field REQUIRED. `MessagePattern.caseSensitive` was missing from test literals constructing patterns directly (bypassing schema parse). TypeScript correctly rejected.
- 4 errors: PRE-EXISTING, last touched in SLICE 4b PR 1 / SLICE 1-a / shadcn install. NOT introduced by SLICE 7. Vercel evidently tolerates these (Next.js's `next build` type-checker permits them where strict tsc rejects).

**Fix (commit `520a0855`):**
1. `message-pattern-eval.ts:15` — split the import: `MessageChannel` from `./message-trigger-storage`, `ChannelBinding` + `MessagePattern` from `./validator`.
2. `message-trigger-store.spec.ts` — added `caseSensitive: false` to 8 pattern literals.
3. `message-trigger-dispatcher.spec.ts` — added `caseSensitive: false` to 3 pattern literals.
4. `tasks/lessons.md` — added L-27 (Vercel preview green requires actual preview verification).

**L-27 follow-up (commit `54651bf3`):**
1. `packages/crm/package.json` — added `"typecheck": "tsc --noEmit -p tsconfig.json"`.
2. Root `package.json` — added `"typecheck": "pnpm --filter @seldonframe/crm typecheck"`.

Now `pnpm typecheck` from monorepo root produces the same output Vercel sees during type-check. Documented baseline: 4 pre-existing errors. Future slices' green-bar must diff against this baseline.

---

## Local verification (this commit)

| Check | Command | Result |
|---|---|---|
| Strict typecheck | `pnpm typecheck` | 4 errors (matches pre-existing baseline) ✅ |
| SLICE-7-induced type errors | (filter from above) | **0** ✅ |
| Unit tests | `pnpm test:unit` | 1445/1450 (5 todo, 0 fail) ✅ |
| `emit:blocks:check` | | no drift ✅ |
| `emit:event-registry:check` | | no drift (47 events) ✅ |
| 18-probe regression | (this run) | 18/18 PASS, 26-streak holds ✅ |
| **Vercel preview build** | observe after push | **🟡 PENDING USER CONFIRMATION** |

The Vercel-preview row is intentionally NOT marked ✅ — per L-27, that mark requires direct observation of Vercel build status. Awaiting Max's confirmation.

---

## Audit of prior slices' Vercel history (per Max's action item #7)

**Method:** I cannot directly query Vercel from this environment (no `gh` CLI; `vercel` CLI auto-creates stray project links). The audit is reasoning-based on what's observable:

1. **The 4 pre-existing strict-tsc errors** (`public-booking-form.tsx:29`, `:191`, `sonner.tsx:4`, `payments/actions.ts:123`) are stable. Last touched: SLICE 4b PR 1 C5 (`8dd43f80`), shadcn install (`03420988`), SLICE 1-a Commit 1 (`dfdf1810`). None changed in SLICE 5/6/7.

2. **Max has not flagged Vercel failures for SLICE 4b PR 2 / SLICE 5 PR 1 / SLICE 5 PR 2 / SLICE 6 PR 1 / SLICE 6 PR 2.** First Vercel-failure flag was on SLICE 7. Strong signal those slices deployed cleanly.

3. **The MessageChannel error pattern is a HARD type error** (missing exported member) which Next.js production build does fail on. The 4 pre-existing errors are softer (missing modules, implicit-any, unknown-property) — Next.js with default config tolerates many of these via `typescript.ignoreBuildErrors` semantics in `next.config.ts` (worth verifying separately).

4. **My SLICE 7 PR 1 + PR 2 close-outs** did NOT include a "Vercel preview green" row in the green-bar tables (verified by `grep -i vercel` over both REGRESSION-REPORT.md files). The omission was a silent skip, equivalent to failing the gate. L-27 captures this — both as "claimed without verification" and the more honest "omitted entirely from the green-bar table, never noticed".

**Conclusion:** prior 5 slices likely ARE genuinely Vercel-green (no contradictory evidence + Max would have flagged otherwise). SLICE 7 is the first slice where the discrepancy materialized — because it's also the first to introduce a hard "module export missing" error pattern. Going forward, L-27 + the new `pnpm typecheck` script + the Vercel-row-required-in-close-out rule prevent recurrence.

If Max wants stronger verification of prior slices, the audit deliverable is per-slice `vercel inspect` against the deploy URL of each close commit — out of scope for this fix sprint, can be a follow-up.

---

## SLICE 7 status

**Code state:** Build-clean as of `520a0855`. 18/18 probes PASS as of `b74q62z2r`. No archetype churn.

**Awaiting:**
1. Max observes Vercel preview build for HEAD (`54651bf3`) succeeds.
2. Max approves SLICE 7 close.

**Per L-21 + L-27:** STOP here. Do NOT proceed to SLICE 8 audit until SLICE 7 is GENUINELY closed (Vercel green observed + Max approval).

---

## Updated SLICE 7 totals (after fix)

| | Prod | Tests | Docs | Combined |
|---|---|---|---|---|
| PR 1 (closed `01a87ac1`) | ~849 | ~1,399 | 797 | ~3,045 |
| PR 2 (closed `24ad606d`) | ~416 | ~1,116 | 156 | ~1,688 |
| Build fix (`520a0855` + `54651bf3`) | +2 | +14 (caseSensitive literals) | +63 (L-27) | +79 |
| **SLICE 7 total** | **~1,267 prod** | **~2,529 tests** | **~1,016 doc** | **~4,812 LOC** |

Code total ~3,796 — 12% over high-end projection (3,400). Same envelope as PR 2 close-out reported, plus ~16 LOC fix delta.

---

## Lessons captured this fix arc

- **L-27**: Vercel preview green requires actual preview verification, not local typecheck assumption. Includes 3 root-cause analysis + the "verified vs inferred" close-out distinction discipline.
- **L-27 follow-up tooling** (`54651bf3`): `pnpm typecheck` script wired at monorepo root. Baseline: 4 pre-existing errors. Future green-bar diffs against this.
- **Process refinement**: close-out reports must EXPLICITLY include every green-bar item from the work-spec, even if "obvious" — silent omission = silent failure.
