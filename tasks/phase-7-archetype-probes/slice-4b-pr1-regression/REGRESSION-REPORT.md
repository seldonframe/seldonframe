# SLICE 4b PR 1 close-out report — 4 customer patterns + CustomerLogin + BookingWidget migration

**Date:** 2026-04-24
**Scope:** SLICE 4b PR 1 (customer-facing composition patterns + themed login + BookingWidget proof migration + regression).
**Commits:** C1 `1a0b5293` → C2 `1e4df29f` → C3 `3499ab82` → C4 `a768d3db` → C5 `8dd43f80` → C6 `[this commit]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS · 19-in-a-row hash streak extended**

| Archetype | Cost sample | Baseline | Δ | Hash |
|---|---|---|---|---|
| speed-to-lead | ~$0.076 | $0.077 | −0.5% | `735f9299ff111080` |
| win-back | ~$0.084 | $0.084 | 0.0% | `72ea1438d6c4a691` |
| review-requester | ~$0.070 | $0.070 | 0.0% | `4464ec782dfd7bad` |

**19-in-a-row** hash preservation streak:

  PR 3 → 2b.2 → 2c (PR 1/2/3) → SLICE 1-a →
  SLICE 1 PR 1 / PR 2 → SLICE 2 PR 1 / PR 2 → SLICE 3 PR 1 →
  SLICE 4a PR 1 / PR 2 / PR 3 → **SLICE 4b PR 1**

Zero synthesis drift. PR 1 touches UI composition (customer namespace) + a proof migration of an existing client component. Nothing in `lib/agents/*`, `SeldonEvent` union, subscription primitive, or scaffolding core. Hash preservation confirms architectural isolation held, as expected.

### Green bar

- `pnpm test:unit` — **909 pass + 5 todos** (+67 from 842 at SLICE 4a close)
- `tsc --noEmit` — 4 pre-existing errors (carrying `react-day-picker` missing-module from SLICE 4a; no new errors introduced in 4b)
- `pnpm emit:blocks:check` — clean
- `pnpm emit:event-registry:check` — clean (47 events, no drift)

---

## PR 1 summary

| # | Commit | Scope | Prod | Tests | Ratio |
|---|---|---|---|---|---|
| C1 | `1a0b5293` | `<PortalLayout>` pure composition | 100 | 195 | 1.95x |
| C2 | `1e4df29f` | `<CustomerDataView>` pure composition | 160 | 160 | 1.00x |
| C3 | `3499ab82` | `<CustomerActionForm>` single + multi modes + reducer | 280 | 340 | 1.21x |
| C4 | `a768d3db` | `<CustomerLogin>` themed OTC composition | 195 | 170 | 0.87x |
| C5 | `8dd43f80` | BookingWidget proof migration (step 2 → CustomerActionForm) | +15 | 0 | 0.00x |
| C6 | `[this commit]` | 9-probe regression + close-out | 0 | 0 | artifact |
| **Totals** | | | **~750 prod** | **~865 tests** | **1.15x** |

**PR 1 total:** ~1,615 LOC (prod + tests; excludes artifacts).
Audit projection: ~1,800 LOC.
Stop-trigger: 2,340 LOC (30% over projection).
→ **10% under projection, 31% under stop-trigger. Safe.**

---

## §11 calibration — second state-machine data point

SLICE 4a's L-17 refinement anchored:
- Pure composition: **0.94x**
- State-machine components: **1.7x-2.0x**
- Proof migration: **0x test LOC**

PR 1's state-machine data:

| Commit | Category | Expected | Observed |
|---|---|---|---|
| C1 PortalLayout | pure composition | 0.94x | **1.95x** (outlier — theme-propagation × optional-slot matrix) |
| C2 CustomerDataView | pure composition | 0.94x | **1.00x** (inside band) |
| C3 CustomerActionForm | state-machine | 1.8x | **1.21x** (UNDER band — reducer split) |
| C4 CustomerLogin | state-machine | 1.7x | **0.87x** (UNDER band — narrow state space) |
| C5 BookingWidget migration | proof migration | 0.00x | **0.00x** (as expected) |

**State-machine component sub-category findings:**

Both SLICE 4b state-machine components (C3 CustomerActionForm at 1.21x + C4 CustomerLogin at 0.87x) landed UNDER the 1.7x-2.0x projection. Two root causes:

1. **Reducer extraction (C3).** The state-transition logic is pulled out of the component into a pure `customerActionFormReducer` exported function. Direct unit tests against the reducer (10 LOC per transition case) replace the more expensive render-then-assert-state approach (~30 LOC per case). This is a **testing-methodology refinement** worth folding into the L-17 addendum.

2. **Narrow state spaces (C4).** CustomerLogin's 2-stage flow (request → verify) has a much smaller transition matrix than BlockDetailPage's tab state-machine (active / inactive / no-active / URL-href). Fewer transitions = smaller test surface = closer to 0.94x base.

**L-17 refinement candidate** (to propose in PR 2 close alongside SLICE 4b close-out):

> State-machine components split by testing methodology:
> - **Reducer-extracted (~1.0-1.3x):** State transitions live in a pure
>   reducer fn tested via direct invocation; renderToString only asserts
>   per-state initial rendering. Applies when transitions are
>   deterministic-on-state (no side effects, no async).
> - **Render-integrated (~1.7-2.0x):** Transitions drive via props + hooks
>   and can only be exercised through rendering. Applies when client
>   state + server actions + async effects intertwine.
>
> Guidance: prefer reducer extraction when the state logic is
> deterministic — it both reduces test LOC AND improves testability.
> When transitions depend on async side effects, accept the 1.7-2.0x
> multiplier.

This refinement is a CANDIDATE — need a third data point (an actual render-integrated state-machine at 1.7-2.0x in 4b) before proposing it as a settled rule. Currently two data points both support ~1.0x; might revise downward if PR 2's patterns confirm.

**C1 PortalLayout outlier analysis:**

PortalLayout's 1.95x was driven by 13 tests covering the 9-CSS-var theme propagation matrix + 3 optional slots (logo / session+signOut / footer) × on/off. Theme-propagation-heavy patterns naturally exhibit a higher multiplier than the 0.94x baseline because each CSS var is its own assertion. PageShell (4a PR 1) had the same signal at a smaller magnitude.

**Aggregate:** 750 / 865 = **1.15x** across PR 1. Above 0.94x but within the +20% buffer projected at audit time. State-machine observations suggest PR 2 aggregate will land closer to 0.94x (harness LOC are artifacts, not multiplier-inflated).

---

## 4 customer patterns + CustomerLogin + migration — shipped

### `<PortalLayout>` (C1)
- Root wrapper for customer portal routes. Applies PublicThemeProvider (9-var full takeover). Renders header (logo + orgName + session indicator + sign-out) + `<main>` + optional footer. Pure composition.

### `<CustomerDataView>` (C2)
- Themed read-only data display. Cards-first (branded feel); `layout="table"` for power contexts. Schema-driven via deriveColumns (reused from 4a). Empty state with override API.

### `<CustomerActionForm>` (C3)
- Themed form primitive with single + multi modes. Multi-mode progressive disclosure with pure reducer for state transitions. Zod-driven field inference via deriveFields (reused from 4a). Hidden-input carry-through across steps preserves the full answer set on final submit.

### `<CustomerLogin>` (C4)
- Themed OTC portal login. Composition-only — wraps `requestPortalAccessCodeAction` + `verifyPortalAccessCodeAction` (lib/portal/auth, UNCHANGED). Two-stage state machine with `initialStage` prop for test determinism + deep-linking. Dev-code preview surface + explicit error rendering + send-again link.

### BookingWidget migration (C5)
- Step 2 (enter-details form) delegates to `<CustomerActionForm mode="single">` + `BookingDetailsSchema`. Step 1 (DayPicker + slot grid) retained (no pattern fit for interactive slot selection). All 10 invariants preserved (flow, server actions, demo-handling, Stripe redirect, timezone, Change button, price label, success screen, pending state, date+time summary).

---

## Deferred to PR 2

Per audit §7.2:
1. Scaffold → Customer UI bridge (BlockSpec `customer_surfaces` schema extension + 2 renderers + orchestrator wiring + smoke test).
2. Shallow-plus integration harness (3 patterns × theme propagation × magic-link smoke × form submission paths × console hygiene).
3. §4 QA checklist + SLICE 4b close-out report.
4. Final 9-probe regression.
5. Wire the existing portal login route to use the new `<CustomerLogin>` component (replacing the legacy `portal-login-form.tsx`).

---

## Sign-off

SLICE 4b PR 1 code complete + green bar clean (tests + typecheck + emit + 9-probe regression). 19-in-a-row hash streak extended. Four customer patterns shipped + proof migration validates them on the real booking widget.

**State-machine multiplier observation:** 4b state-machine components (C3, C4) landed UNDER the 1.7-2.0x projection because of reducer extraction + narrow state spaces. Candidate L-17 refinement documented above; awaiting PR 2 data before committing.

**Per L-21:** stopping here. Do NOT start PR 2 until Max approves PR 1.

Per rescope discipline: PR 2 picks up scaffold bridge + harness + close-out + login route wiring. Expected ~1,480 LOC per audit §7.2.
