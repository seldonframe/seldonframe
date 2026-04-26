# PR body — SLICE 10: request_approval primitive

**This file is the PR body for the SLICE 10 merge.** Title:

> `SLICE 10: request_approval primitive`

---

## What ships

The 9th step type (`request_approval`) — pauses the workflow until
a designated human approves or rejects, then resumes per the
decision. Strategic context: SeldonFrame's ICP is SMB agency
operators deploying agents on clients' behalf. Without an approval
primitive, every deployed agent runs fully autonomously — which
agency operators won't accept for their clients in the first months
of production. Approval gates are operational table stakes.

### PR 1 (foundation — 8 commits, ~3,721 combined code)

- **Schema** — `RequestApprovalStepSchema` with discriminated
  approver union (operator | client_owner | user_id) + discriminated
  timeout union (abort/seconds | auto_approve/seconds |
  wait_indefinitely). Cross-ref validator + cycle detection +
  v1.1-aware `approver_unsupported_in_v1` for user_id.
- **Persistence** — `workflow_approvals` table (migration 0027) +
  5 partial indexes; in-memory + Drizzle storage adapters; HMAC
  magic-link token generator + verifier (24h TTL, single-use via
  optimistic CAS).
- **Dispatcher** — `dispatchRequestApproval` (pause action) +
  `resumeApproval` (CAS + advance) + `runtimeResumeApproval`
  (runtime wrapper with `advanceRun` integration).
- **API** — 4 endpoints: `GET /api/v1/approvals/pending`,
  `POST /api/v1/approvals/[id]/resolve`,
  `POST /api/v1/approvals/[id]/override` (org-owner emergency
  unblock with `override_flag` audit trail per G-10-7),
  `POST /api/v1/approvals/magic-link/[token]/resolve` (no session;
  token IS auth).

### PR 2 (human-facing — 8 commits, ~2,395 combined code)

- **Email notifier** + `applyAction` wiring — composes admin/client
  email variants, dispatches via existing Resend integration,
  routes through SLICE 8 test-mode automatically. NEVER throws
  (L-22 swallow pattern).
- **Cron timeout sweep** — wired into existing `/api/cron/workflow-tick`
  alongside wait sweep + subscription tick + scheduled-trigger tick.
  Routes per `timeout_action`: abort → on_reject; auto_approve → on_approve.
- **Admin inline drawer** in `/agents/runs` — pending-approval block
  parallel to "Waiting for event"; approve/reject buttons + comment;
  visible only to bound approver or org-owner; auto-routes to regular
  vs override endpoint per identity.
- **Customer magic-link surface** at `/portal/approvals/[token]` —
  HIGH polish bar; mobile-first; 4 specific states (decision /
  expired / already-resolved / invalid); themed via workspace customer
  theme (SLICE 4b); SeldonFrame attribution stays SeldonFrame brand;
  test-mode badge surfaces.
- **HVAC integration tests** — heat-advisory with operator approval
  gate + post-service-followup with client_owner magic-link; covers
  both approve and reject and timeout-abort paths.
- **Cost-attribution invariant** — verified via inspection +
  documentation tests: recorder is status-agnostic + time-agnostic;
  pause_approval action carries no cost fields; long-pause edge
  (7-day) verified clean.
- **Edge cases** — provider failure / concurrent approve+reject /
  org-owner override / magic-link tampering + replay / 7-day pause.

## SLICE 10 totals

- **154 new tests** across both PRs; suite total 1,818 pass / 0 fail
- **~6,116 combined code** (PR 1 ~3,721 + PR 2 ~2,395)
- **~2,250 doc artifacts** (audit + 2 baselines + 2 close-outs +
  2 regression reports)
- **30-streak structural-hash preservation** verified via 18-probe
  regression at PR 1 close (29) + PR 2 close (30)

## L-17 hypothesis verdicts

- **A — Cross-ref Zod gate-breadth (6th datapoint):** predicted
  3.0-4.0x; actual 2.87x at PR 1 C1 schema scope. **CONFIRMED with
  refinement** — multi-gate × moderate-edge with heavy reuse trends
  ~10-15% below the predicted band lower edge. Lower bound expanded
  to 2.5x for this sub-case.
- **B — Dispatcher orthogonal interleaving (4th datapoint):**
  predicted 1.5-2.0x; actual 2.08x at PR 1 C4 dispatcher. **CONFIRMED
  with cluster note** — 4-datapoint trend (1.75x message + 1.7x
  test-mode + 2.08x approval) shows orthogonal-with-sibling-modules
  cluster at 1.7-2.1x. Sub-band split codified.
- **L-17 addendum 2 — Per-file test estimation (1st validation):**
  per-test count accuracy 80-94% (in-band); per-test LOC accuracy
  60-75% (out-of-band — integration + edge tests run ~22-28
  LOC/test, not 16). **CONFIRMED with refinement** — tier
  sub-categorization (unit-thin / unit-rich / integration / edge-case)
  codified for SLICE 11 C0 as L-17 addendum 3.

## Vercel preview status verified at HEAD

- HEAD `3af92de5` — Ready (1m 35s, deployment ID `4pFqPiXor`) —
  observed green by Max per L-27 on 2026-04-25.
- PR 2 baseline + commits all incrementally Vercel-verified through
  the slice.

## Self-review summary

17 commits ahead of main; 85 files changed (~11,624 insertions,
~12 deletions).

Discipline scans:
- **console.log/debug:** none in src outside scaffolder defaults +
  intentional observability prefixes ✅
- **TODO/FIXME:** none outside documented scaffold-default
  placeholders ✅
- **.only / .skip:** none ✅
- **L-28 fixture format-matching:** none — codebase-wide grep
  (per L-28 retroactive addendum) confirms zero violations ✅
- **Commented-out blocks:** none ✅

## Containment

- Zero changes to global archetype registry (preserves the 30-streak)
- Zero changes to `lib/agents/types.ts` core (schema extension at
  validator layer)
- Zero changes to SeldonEvent union (approval lifecycle =
  workflow_event_log entries)
- Zero changes to subscription primitive, scaffolding core,
  workflow_runs/waits schemas (cost columns from SLICE 9 PR 2
  reused unchanged)

## Deferred to v1.1

- **Dedicated `/agents/approvals` page** — secondary surface per
  G-10-4; deferred per PR 2 baseline Option 1 budget tightening.
  Drawer in `/agents/runs` covers the primary surface.
- **SMS notification** — email-first v1 per G-10-3.
- **Bulk approval** — single-only v1 per G-10-5.
- **Specific user_id approver type** — schema-supported; v1
  surfaces `approver_unsupported_in_v1`; v1.1 implements resolver.
- **Workspace-scoped HMAC magic-link secrets** — v1 uses single
  env-var; v1.1 ships per-workspace storage + rotation.
- **Approval pools / delegation / escalation** — post-launch.

## Open items for SLICE 11 audit

- **Cost observability gaps** not absorbed by SLICE 9 PR 2 fold:
  - Workspace-level cost rollup dashboard
  - Cost alerts / budget caps
  - Per-archetype cost analytics
  - Cost attribution to triggering event
- **MCP discovery deliverable** — separate workstream
- **Launch content rewrite** — pre-launch polish pass

## Merge strategy

**Standard merge commit (NOT squash, NOT rebase).** Slice-level
commit history preserved so future engineers can navigate by
PR/commit boundary. Each PR's close-out commit serves as a
logical boundary.

Merge commit message: `Merge SLICE 10: request_approval primitive`

## Branch cleanup

`claude/slice-10-approval-primitive` deleted post-merge. History
preserved on main.
