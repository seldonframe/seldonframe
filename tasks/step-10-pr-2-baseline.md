# SLICE 10 PR 2 — baseline + scope memo

**Date:** 2026-04-25
**Branch:** `claude/slice-10-approval-primitive` (continued from PR 1)
**Base:** PR 1 close `a0cd2454` (Vercel-verified per L-27;
29-streak ratcheted)
**Audit:** [step-10-request-approval-audit.md](step-10-request-approval-audit.md)
**PR 1 close-out:** [step-10-pr-1-closeout.md](step-10-pr-1-closeout.md)

---

## Scope (per Max's PR 2 implementation prompt)

PR 2 ships the human-facing half of the request_approval primitive:
admin UI + customer surface + email notification + cron timeout
sweep + integration tests + close-out. The dispatcher + persistence
+ API foundation shipped in PR 1.

**Polish bar HIGH** for the customer-facing magic-link surface:
this is the first SeldonFrame surface that clients of agency
operators encounter directly. Spot-check criterion: "would Max
ship this to a real client of a real agency?"

## Mini-commit plan

| # | Mini-commit | Surface |
|---|---|---|
| C0 | L-17 addendum 2 + this baseline doc | Methodology |
| C1 | Email notification integration (template + dispatch + test-mode routing) | `lib/workflow/approvals/notifier.ts` + email template + `applyAction` wiring |
| C2 | Cron timeout sweep caller | `lib/workflow/approvals/cron-sweep.ts` + cron route |
| C3 | Admin inline drawer in `/agents/runs` | `runs-client.tsx` extension + serialization |
| C4 | Dedicated `/agents/approvals` page (CONDITIONAL) | New route under `(dashboard)/agents/approvals/` |
| C5 | Customer magic-link surface (HIGH polish) | `/portal/approvals/[token]` route + theme bridge |
| C6 | Integration tests + cost-attribution invariant | `tests/unit/slice-10-integration.spec.ts` |
| C7 | Edge case integration tests | `tests/unit/slice-10-edge-cases.spec.ts` |
| C8 | Polish pass + 18-probe regression + PR 2 close-out | Artifacts |

## Per-file LOC estimates (L-17 addendum 2 applied)

Using ~15-17 LOC/test (refined from PR 1 actuals; SLICE 10 testing
style is rich-fixture / multi-assertion).

### Production files

| File | Est. prod LOC | Notes |
|---|---|---|
| `lib/workflow/approvals/notifier.ts` | ~120 | Email template render + Resend dispatch + test-mode routing |
| `lib/workflow/approvals/cron-sweep.ts` | ~80 | Iterate findTimedOutPendingApprovals + route to runtimeResumeApproval |
| `app/api/v1/cron/approvals-timeout/route.ts` | ~50 | Vercel cron endpoint wrapping cron-sweep |
| `app/(dashboard)/agents/runs/runs-client.tsx` (extension) | ~80 | Drawer block addition + serialization extension |
| `app/(dashboard)/agents/runs/page.tsx` (extension) | ~30 | Server-side query for pending approvals per run |
| `app/(dashboard)/agents/approvals/page.tsx` (CONDITIONAL) | ~100 | Server page: list + sort + filter |
| `app/(dashboard)/agents/approvals/approvals-client.tsx` (CONDITIONAL) | ~150 | Client: table + drawer reuse + handlers |
| `app/portal/approvals/[token]/page.tsx` | ~140 | Server: token verify + load approval + render decision page |
| `app/portal/approvals/[token]/approval-decision-form.tsx` | ~100 | Client: approve/reject buttons + comment field + states |
| `app/portal/approvals/[token]/approval-states.tsx` | ~80 | Loading / expired / invalid / already-resolved / success states |
| Theme-bridge integration (theming on portal) | ~30 | Compose customer theme + SeldonFrame attribution |
| Email templates (`lib/emails/templates/approval-notification.ts`) | ~80 | Plain + HTML variants |
| **Subtotal — production** | **~1,040** | (~890 if C4 deferred) |

### Test files (per-file enumeration)

| Test file | Est. tests | Est. LOC (×16) | Notes |
|---|---|---|---|
| `approvals-notifier.spec.ts` | 8-10 | 130-160 | Render + dispatch + test-mode + failure swallow |
| `approvals-cron-sweep.spec.ts` | 6-8 | 95-130 | Iteration + abort/auto_approve + idempotency + error isolation |
| `approvals-runs-drawer.spec.ts` | 5-7 | 80-115 | Render with pending/resolved + permission gate + serialization |
| `approvals-page.spec.ts` (CONDITIONAL) | 6-8 | 95-130 | List + sort + filter + click-through |
| `approvals-customer-portal.spec.ts` | 12-16 | 190-255 | Token paths × render states × actions |
| `slice-10-integration.spec.ts` | 8-10 | 200-300 | HVAC examples + cost-attribution invariant (heavier setup) |
| `slice-10-edge-cases.spec.ts` | 8-10 | 130-180 | Provider failure + race + override + tampering + replay |
| **Subtotal — tests** | **53-69** | **~920-1,270** | (~825-1,140 if C4 deferred) |

### Combined-code projection

| Path | Combined LOC | Notes |
|---|---|---|
| Full PR 2 (incl. C4 dedicated page) | ~1,960-2,310 | At ~15-17 LOC/test |
| C4 deferred to v1.1 | ~1,715-2,030 | Drops ~245-280 (page + page-tests) |

**Per Max's PR 2 budget:** 1,200-1,500 combined code expected;
1,950 stop-and-reassess trigger.

**Projection vs budget:**
- Without C4: ~1,715-2,030 — **~14-35% over upper, brushes stop trigger**
- With C4: ~1,960-2,310 — **~30-54% over upper, exceeds stop trigger**

**Decision:** the per-file enumeration shows the projection runs
high regardless of C4. Three options:

1. **Defer C4 + tighten remaining scope to land under 1,950
   stop trigger.** This requires per-file scope discipline (e.g.,
   tighter customer portal — fewer state files, inlined where
   reasonable).
2. **Ship C4 + accept the budget overrun, documenting it as a
   second L-17 addendum 2 calibration point.** Risk: PR 2
   becomes the second consecutive over-budget PR.
3. **Split PR 2 into PR 2a (notifier + cron + admin drawer) and
   PR 2b (customer portal + dedicated page + integration tests).**
   Two smaller PRs, more L-27 cycles, but cleaner.

**Recommended: Option 1.** The scope budget is the gate. C4
dedicated page is explicitly conditional in Max's prompt; deferring
it to v1.1 is the documented escape valve. Tighten C5 customer
portal to a single page file + state-as-conditional-render
(eliminate the separate `approval-states.tsx` file; inline state
logic into the main page). Tighten C6/C7 to focused critical-path
tests rather than exhaustive coverage matrices.

**Tightened projection (Option 1):**
- C4 deferred (~-245-280)
- C5 inlined states (~-80 prod / ~-95 test)
- C6/C7 focused (~-100 test)
- New range: **~1,540-1,855** — within the 1,950 stop trigger,
  brushing the 1,500 upper expected band

This is the path. The PR 2 close-out documents whether the
tightening held.

## Polish bar — HIGH (customer magic-link surface)

Spot-check criterion (Max's words): "would Max ship this to a real
client of a real agency?"

Polish criteria for `/portal/approvals/[token]`:
- ✅ Mobile-first responsive design
- ✅ Empty / loading / error / success states all polished (not
  bare error messages)
- ✅ Copy reads professional + trustworthy
- ✅ SeldonFrame "Powered by" attribution composes correctly with
  workspace customer theme (theme bridge isolation per SLICE 4b)
- ✅ Error cases (expired / already-resolved / invalid) each have
  specific pages with clear next steps
- ✅ Successful resolution shows confirmation page with summary
- ✅ Brand colors stay SeldonFrame on attribution (NOT recolored
  by workspace theme)

## Watch items (per Max's prompt)

1. **Customer magic-link surface polish quality** — spot-check vs
   "ship to a real client" bar
2. **Cost attribution invariant under pause/resume** — workflow
   pause can be hours/days; LLM cost capture must continue (C6)
3. **Theme composition correctness** — workspace theme on portal
   surface; SeldonFrame attribution stays SeldonFrame brand
4. **Mobile responsiveness** — both admin drawer + customer portal
5. **Per-file test count accuracy** — validates L-17 addendum 2

## Containment

| Surface | Changes? | Notes |
|---|---|---|
| Global archetype registry | ✅ none | 6 archetypes preserved; 29-streak protected |
| `lib/agents/types.ts` core | ✅ none | PR 2 only adds UI + integration |
| Subscription primitive / scaffolding core | ✅ none | Orthogonal |
| `workflow_runs` / `workflow_waits` schemas | ✅ none | Cost columns from SLICE 9 PR 2 reused, not modified |
| `workflow_approvals` schema | ✅ none | Shipped in PR 1 C2; PR 2 only consumes |
| `lib/workflow/approvals/` module from PR 1 | ✅ extended | C1 adds notifier; C2 adds cron-sweep |
| `lib/workflow/runtime.ts` | ✅ extended | C1 wires notifier into applyAction |
| `lib/workflow/step-dispatchers/request-approval.ts` | ✅ none | PR 1 final |
| `app/(dashboard)/agents/runs/` | ✅ extended | C3 adds drawer block |
| New: `lib/emails/templates/approval-notification.ts` | ✅ new | Email template |
| New: `app/api/v1/cron/approvals-timeout/route.ts` | ✅ new | Cron endpoint |
| New: `app/portal/approvals/[token]/` | ✅ new | Customer surface |
| New: `app/(dashboard)/agents/approvals/` | ⚠️ CONDITIONAL | Per Option 1 above, deferred to v1.1 |

## Green bar PR 2

| Check | Source | Expectation |
|---|---|---|
| `pnpm build` | repo root | Full Next.js build succeeds |
| `pnpm typecheck` | repo root | Zero new errors (baseline 0; pre-existing 4 from prior tracking now 0 on main) |
| `pnpm test:unit` | repo root | 1774 baseline → expected ~1,830-1,840 (per per-file estimates) |
| `pnpm emit:event-registry:check` | repo root | No drift |
| `pnpm emit:blocks:check` | repo root | Pre-existing 9-file drift only (LF↔CRLF; non-gating per PR 1 close) |
| 18-probe regression | new dir under `tasks/phase-7-archetype-probes/slice-10-pr2-regression/` | 18/18 PASS — 29-streak holds |
| Vercel preview build | observe at HEAD post-push | 🟡 PENDING USER CONFIRMATION (per L-27) |

## What does NOT ship in PR 2

- **C4 dedicated `/agents/approvals` page** (Option 1: deferred to
  v1.1 fast-follow per the budget tightening). Drawer in
  `/agents/runs` covers the primary surface per G-10-4.
- **HVAC archetype `request_approval` integrations as actual
  archetype edits** — examples shipped as integration test fixtures
  in C6, not as workspace-scoped archetype changes (per audit §11
  + PR 2 scope clarity)
- **Per-workspace HMAC magic-link secrets** — v1 uses single
  env-var; v1.1 ships per-workspace secret table + rotation
- **user_id approver runtime support** — schema accepts it; v1
  surfaces `approver_unsupported_in_v1`; v1.1 adds resolver
- **Approval pools / delegation / escalation** — post-launch per
  audit §13
- **SMS-reply approvals** — post-launch (extends SLICE 7
  message-trigger infra)

## Per L-21 + L-27: STOP at PR 2 close

Standard discipline:
- Green bar verified locally
- Push to origin
- Vercel preview at PR 2 HEAD must be observed green by Max
- Close-out at `tasks/step-10-pr-2-closeout.md` with per-file
  prediction accuracy + L-17 addendum 2 verdict
- Then await Max's SLICE 11 audit kickoff
