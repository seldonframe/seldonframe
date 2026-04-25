# SLICE 10 PR 1 — baseline + scope memo

**Date:** 2026-04-25
**Branch:** `claude/slice-10-approval-primitive`
**Base:** main HEAD `0c0edc9d` (Scope 3 merge)
**Audit:** [step-10-request-approval-audit.md](step-10-request-approval-audit.md)
**Gate resolutions:** see audit §9 + Max's gate-resolution prompt

---

## Gate decisions snapshot (final, per Max's resolution)

| Gate | Decision |
|---|---|
| **G-10-1** | operator + client_owner in v1; user_id schema-supported but runtime-rejected with clear error in v1; v1.1 adds runtime support |
| **G-10-2** | Configurable timeout required, no silent default. Discriminated union: `{abort, seconds}` ∣ `{auto_approve, seconds}` ∣ `{wait_indefinitely}` (no seconds — schema-enforced via .strict()) |
| **G-10-3** | Email-first v1 (PR 2 scope); SMS deferred to v1.1; no per-workspace notification preferences in v1 |
| **G-10-4** | Drawer in `/agents/runs` is primary (PR 2); dedicated `/agents/approvals` page is secondary (ship if budget permits, defer to v1.1 otherwise) |
| **G-10-5** | Single approval/rejection only in v1; no bulk operations |
| **G-10-6** | Audit trail visible always: resolved_by, resolved_at, resolution_comment, override_flag |
| **G-10-7** | Approver-bound + org-owner emergency unblock (Interpretation A). Override flagged in audit trail via `override_flag` boolean |
| **G-10-8** | Magic-link email v1: single-use tokens, 24h fixed expiry, HMAC-signed with workspace secret, themed per SLICE 4b customer theme bridge, minimal surface (title/summary/preview/approve/reject/optional comment), token-hash indexed |
| **G-10-9** | New `workflow_approvals` table (Path B) — separate from workflow_waits |

---

## PR 1 scope

**In:** schema + persistence + dispatcher + API. **No UI. No notification sending** (email rendering deferred to PR 2 with the rest of the human-facing surface). Magic-link generation + verification IS in PR 1 (it's a persistence + API concern); actual email dispatch of magic-link tokens lands in PR 2.

| # | Mini-commit | Estimated combined code |
|---|---|---|
| C0 | L-17 addendum + this baseline doc | n/a (artifact) |
| C1 | Schema extension — `RequestApprovalStepSchema` + cross-ref validator | ~430 (150 prod + 280 test) |
| C2 | `workflow_approvals` table + migration 0027 + drizzle schema | ~205 (180 prod + 25 migration; ~150 test) → ~355 |
| C3 | Persistence helpers (CRUD + magic-link token + idempotency + override) | ~400 (180 prod + 220 test) |
| C4 | Runtime dispatcher (`dispatchRequestApproval` + resume + race conditions + 3 timeout actions) | ~470 (200 prod + 270 test) |
| C5 | API endpoints (resolve / override / magic-link resolve / list pending) | ~350 (180 prod + 170 test) |
| C6 | 18-probe regression + PR 1 close-out | n/a (artifact) |
| **Total estimated combined code** | | **~2,005** |

Per Max's PR 1 budget: 1,800-2,200 combined; stop-and-reassess at ~2,860 (30% over upper). Projection lands mid-band; comfortable margin.

## Methodology — L-17 addendum applied

Per the L-17 combined-code framing addendum committed in this same C0 commit:
- All projections + budget guards measure prod + test combined.
- Documentation (audit, baseline, close-out) tracked separately.
- Multipliers continue to express test/prod ratios; combined = prod × (1 + multiplier).

---

## L-17 hypothesis tracking — 2 active validations in PR 1

### Hypothesis A: Cross-ref Zod gate-breadth multiplier — 6th datapoint

`RequestApprovalStepSchema` ships with **multi-gate breadth** (timeout discriminator × approver discriminator × cross-ref step references × magic-link enforcement at runtime, not parse time). Estimated edge count: 6-8.

Per the SLICE 7 PR 2 hypothesis (gate-breadth scaling, 5-datapoint support):
```
expected_ratio = base(edges) × gate_breadth(gates)
```

**For SLICE 10 PR 1 schema:** moderate edge count (~6-8) × multi-gate breadth.

**Predicted:** 3.0-4.0x test/prod ratio on the schema + cross-ref validator scope (C1).

**Verdict thresholds:**
- ≥4.5x → outlier above; gate-breadth scaling steeper than predicted
- ≤2.5x → outlier below; multi-gate hypothesis weakened
- 2.5-4.5x → in-band; hypothesis confirmed at 6th datapoint

### Hypothesis B: Dispatcher orthogonal interleaving multiplier — 4th datapoint

`dispatchRequestApproval` is **orthogonal** to existing dispatchers (no shared mutable state; pause action symmetric to existing pause_event). Per the SLICE 7 PR 1 hypothesis (orthogonal: 1.5-2.0x; interleaved: 3.0-4.0x):

**Predicted:** 1.5-2.0x test/prod ratio on the dispatcher scope (C4).

Prior orthogonal datapoints:
- SLICE 7 message dispatcher: 1.75x (orthogonal)
- SLICE 8 test-mode resolvers: 1.7x (orthogonal)
- SLICE 9 (no dispatcher work)

**Verdict thresholds:**
- >2.2x → outlier above; orthogonal hypothesis weakened
- <1.4x → outlier below; orthogonal multiplier looser than thought
- 1.4-2.2x → in-band; hypothesis confirmed at 4th datapoint (3rd consecutive orthogonal)

---

## Watch items (PR 1)

1. **L-17 cross-ref Zod multiplier (gate-breadth hypothesis)** — see Hypothesis A above.
2. **L-17 dispatcher orthogonal interleaving (4th datapoint)** — see Hypothesis B above.
3. **Idempotency under concurrent resolution** — concurrent approve+reject; approval-after-timeout; override-while-pending. DB constraint enforces single-resolution.
4. **Magic-link security** — HMAC signing, single-use enforcement, expiration, no user enumeration via token errors.
5. **Cost attribution continuity** — workflow_run cost tracking continues across approval pause/resume per SLICE 9 PR 2 C4 invariant. Verified by integration test in PR 2 (full LLM-generated context + delay + post-approval LLM call). PR 1 verifies the storage layer doesn't break the invariant by inspection.

---

## Containment

| Surface | Changes? | Notes |
|---|---|---|
| Global archetype registry | ✅ none | 6 archetypes preserved; 28-streak protected |
| `lib/agents/types.ts` core | ✅ none | Schema extension lives at validator layer |
| SeldonEvent union | ✅ none | Approval events go to workflow_event_log, not SeldonEvent |
| Subscription primitive | ✅ none | Orthogonal |
| Scaffolding core | ✅ none | Orthogonal |
| `workflow_runs` schema | ✅ none | Cost columns from SLICE 9 PR 2 unchanged; verified to work across pause boundary |
| `workflow_waits` schema | ✅ none | New `workflow_approvals` is separate table per G-10-9 |
| Workspace-scoped HVAC archetypes | ✅ none | Integration archetypes deferred per audit §11 |
| Schedule + branch + message-trigger + test-mode primitives | ✅ none | Orthogonal |
| New: `workflow_approvals` table | ✅ new | Migration 0027 |
| New: `RequestApprovalStepSchema` | ✅ new | 9th step type (validator layer) |
| New: `dispatchRequestApproval` | ✅ new | New step dispatcher |
| New: `lib/workflow/approvals/` (storage + token + helpers) | ✅ new | Self-contained module |
| New: 4 API endpoints under `/api/v1/approvals/` | ✅ new | RESTful resolve/override/magic-link/list |

---

## Green bar PR 1 (per L-27)

| Check | Source | Expectation |
|---|---|---|
| `pnpm build` | repo root | Full Next.js build succeeds |
| `pnpm typecheck` | repo root | 4 pre-existing baseline errors only; zero new |
| `pnpm test:unit` | repo root | 1664 baseline → expected 1800+; 0 fail |
| `pnpm emit:blocks:check` | repo root | No drift |
| `pnpm emit:event-registry:check` | repo root | No drift |
| 18-probe regression | new dir under `tasks/phase-7-archetype-probes/slice-10-pr1-regression/` | 18/18 PASS — 28-streak holds |
| Vercel preview build | observe at HEAD post-push | 🟡 PENDING USER CONFIRMATION (per L-27) |

---

## What does NOT ship in PR 1 (PR 2 scope)

- Admin UI: drawer block in `/agents/runs` + dedicated `/agents/approvals` page
- Customer-facing magic-link approval surface (`/approvals/[token]` route + theme-bridged page)
- Email rendering for approval notifications (`approval-notification` email template)
- Email dispatch wiring (the `notifyApprover` call inside `applyAction`)
- Integration tests covering full pause→notify→approve→resume + cost attribution invariant
- 18-probe regression for PR 2 (separate from PR 1's regression)
- HVAC archetype integration examples (per audit §11; deferred to post-PR 2 mini-commit OR operator-authored)

---

## Per L-21 + L-27: STOP at PR 1 close

Standard Scope 3 discipline holds:
- Green bar verified locally
- Push to origin
- Vercel preview build at PR 1 HEAD must be observed green by Max via direct external observation
- Close-out doc filed at `tasks/step-10-pr-1-closeout.md` with L-17 hypothesis measurements + verdict
- Then await Max approval before PR 2 audit-implementation kickoff
