# Agent truth — receipt error notes + honest Live label

**Branch:** `feat/agent-truth` @ `68300a925` · **Approved:** Max 2026-07-16 ("yes do it so the user knows its agent is working for him") · **Flag:** none (additive; fail-soft)

## Why

Max's inbox agent fired 8× this morning; every receipt reads `error · "ran with no actions"` with NO cause — the operator can't tell key-missing from tool-missing from model-error. Separately, the template page shows a big `draft` chip on an agent that is LIVE and running (the chip tracks the marketplace lifecycle, not deployment truth) — a lie-shaped label.

## Ground truth

- Receipts: `lib/agent-receipts/write.ts` (fail-soft writer, merged `8ff2a1394`), called from `lib/deployments/composio-event-dispatch.ts` (push, ok/error/release paths) and `lib/agents/triggers/schedule-agents.ts` (cron) via optional DI hooks in the respective `-deps.ts`. Receipt columns: `summary text`, `tool_calls jsonb [{tool, ok, note?}]` — NO new column needed for error notes.
- The push path's turn result comes from `runStatelessAgentTurn`; on the error path the dispatch has the thrown error / failed turn in scope. Today's writer emits the generic `"ran with no actions"` fallback for empty tool_calls regardless of WHY.
- Live status: `getDeploymentLiveStatus(deploymentId)` in `lib/agent-receipts/store.ts` (org-gated: builderOrgId OR clientOrgId) → `{active, triggerKind, todayCount, lastReceiptAt}` — already rendered as the LIVE banner on the deploy/run area.
- Template header chip: the studio agent page (`app/(dashboard)/studio/agents/[id]/…`) renders the template's marketplace tri-state (`draft | tested | published`) as the title badge — locate the exact badge component at build time (status-badge.tsx per earlier recon).
- Known live failure to validate against: org `33b746de…` has an entered-but-invalid Anthropic key (`integrations.anthropic.configured=true`, agent turns fail) — after this slice, its receipts must say so.

## Design

1. **Error notes in receipts (5a).** Thread the failure REASON into the receipt at both call sites:
   - Push path: on `turn.ok === false` or thrown error, `summary = "error: " + <first line of the turn/thrown error, truncated 140>`; when the turn carries structured tool events, keep them in `tool_calls` as-is. The `"ran with no actions"` fallback remains ONLY for a genuinely ok-but-actionless turn (status ok).
   - Schedule path: same rule from the aggregate's error strings (first failure's message).
   - Never leak secrets into summaries: strip anything matching key-ish shapes (`sk-`, `Bearer `, `postgres://` — reuse/borrow the credential-shape list from L-10) before writing. Explicit test.
   - No schema change; writer contract (fail-soft) unchanged.
2. **Honest Live label (5b).**
   - Template title badge: when the template has ≥1 deployment (reuse `getDeploymentLiveStatus` / a light `countDeploymentsForTemplate(orgId, templateId)` in the same store), render `● Live · N deployment(s)` (dashboard-brand green dot, existing badge styling) INSTEAD of the marketplace tri-state.
   - Marketplace tri-state moves into the Sell card copy: `draft` renders as "Not listed on marketplace"; `published` renders as "Listed". `tested` keeps its meaning wherever it appears today.
   - No deployments → keep current behavior (tri-state chip), so non-deployed templates are unchanged.
   - All queries org-scoped; the badge data loads server-side on the existing page query (no client fetch).

## Build plan (TDD, commit per task, baselines first, delta-judged)

- **Task 1 — receipt error notes.** Unit tests first (DI): push error path with a thrown Error("anthropic 401: invalid x-api-key") → summary `error: anthropic 401: invalid x-api-key`; ok-but-actionless → unchanged `ran with no actions` + status ok; secret-shape scrubbing test (`sk-abc…` never appears in summary); schedule aggregate failure → first failure message. Then implement in the two call sites + (if cleanest) a shared `deriveReceiptSummary(outcome)` helper in lib/agent-receipts.
- **Task 2 — live label.** renderToString tests: template with 1 deployment → badge text `● Live · 1 deployment`, no `draft` text in the header block; 0 deployments → tri-state unchanged; Sell card shows "Not listed on marketplace" for draft. Implement in the studio agent page + status-badge component (match dashboard-brand tokens; L-36: explicit fg+bg, visibility invariant test).
- **Task 3 — regression + report.** Suite delta (use the chunked runner workaround if ENAMETOOLONG persists — check whether Max's fix task landed on scripts/run-unit-tests.js first), tsc delta, use-server gate, build report committed.

Out of scope: marketplace generalization (parallel slice), notifications, /approvals convergence.
