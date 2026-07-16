# Agent truth — build report

Branch: `feat/agent-truth` (worktree `.claude/worktrees/agent-truth`), based on `c5556dfe1`.
Design: `docs/superpowers/specs/2026-07-16-agent-truth-design.md`.

## Per-task shas

- Task 1a (`ac677a01e`) — `deriveReceiptSummary` gains an `errorMessage` param (priority over toolCalls/replyText, prefixed `"error: "`, scrubbed, truncated to 140); new `scrubSecretShapes()` (L-10 shapes: `postgres(ql)?://`, `sk-`/`sk_`/`wst_`/`ghp_`, `Bearer <token>`).
- Task 1b (`8b823305a`) — schedule cron's throw-path summary (`schedule-agents.ts`) now scrubbed before being written.
- Task 1c (`d30d6d081`) — push dispatcher (`composio-event-dispatch.ts` + `-deps.ts`) threads an `errorMessage` (turn's own diagnostic on `ok:false`, or the caught throw's message) through the `writeReceipt` DI hook into `writeRunReceipt`. Production deps populate "no LLM key configured" / "organization not found" / the turn's own `[runtime error] anthropic 401: invalid x-api-key`-shaped message.
- Task 2 (`f83ea463d`) — `TemplateStatusBadge` gains an optional `deploymentCount` prop: ≥1 renders `● Live · N deployment(s)` instead of the draft/tested/published tri-state (explicit fg+bg, L-36 tested). Wired in the studio agent page's non-lifecycle branch (currently active path, `SF_AGENT_LIFECYCLE` off) from the deployments list already loaded — no new query. New `marketplaceListingCopy()` moves the tri-state's meaning into the Publish/Sell section's own copy ("Not listed on marketplace" / "Listed"; `tested` unchanged).

## Test deltas

Targeted (scoped) unit runs — the full suite hits a pre-existing `ENAMETOOLONG` in `scripts/run-unit-tests.js` (Windows CLI arg-length limit; the fix has NOT landed — confirmed via `git log`/grep, no chunking logic present). Per the task brief I used a local, uncommitted chunked-runner workaround (not part of any commit) to spot-check the broader suite; it surfaced ~360 pre-existing `Cannot find module 'zod'` / `'@anthropic-ai/sdk'` failures that are **environment/module-resolution issues present on `HEAD` before any of my edits** (independently reproduced via `node -e "require.resolve('zod')"` from the plain repo checkout, no worktree involved) — out of scope, unrelated to this slice.

Scoped runs (all touched spec files, run directly via `node --import tsx --test`):

- Before Task 1: `write.spec.ts` + `composio-event-dispatch.spec.ts` + `run-due-scheduled-agents.spec.ts` → 51/51 pass (baseline).
- After all tasks, full touched set (`write.spec.ts`, `status-badge.spec.tsx`, `run-due-scheduled-agents.spec.ts`, `composio-event-dispatch.spec.ts`, `live-banner.spec.tsx`, `live-status.spec.ts`, `receipts-section.spec.tsx`):

```
ℹ tests 104
ℹ suites 18
ℹ pass 104
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`tsc --noEmit -p .` (packages/crm): baseline 361 pre-existing errors (all `Cannot find module 'zod'/'@anthropic-ai/sdk'` + a handful of unrelated implicit-any) → final run also 361, **byte-identical diff** (`diff <(sort baseline) <(sort final)` empty) — zero new errors introduced.

`pnpm check:use-server` (packages/crm): `✓ All 'use server' files export only async functions / types.`

## Deviations from the plan

1. **Schedule path's "aggregate failure (no throw)" branch keeps count-only summaries.** `RunEventAgentResult` (in `run-event-agent.ts`, out of the plan's touched-file list) has no per-failure message text — only counts (`matched/sent/failed/...`). The design's "first failure's message" is fully satisfied for the THROW path (already threaded, now scrubbed) but the failed>0-without-throw path still reports `"matched 3, sent 1, failed 2"` (counts, no root cause) since adding a failure-message field would require touching `run-event-agent.ts`, outside scope. Flagged rather than silently expanded.
2. **Sell-card copy lives in `page.tsx`, not `list-on-marketplace.tsx`.** To stay inside the "studio page/badge components" file list, the `marketplaceListingCopy()` line is rendered directly above `<ListOnMarketplace>` in `page.tsx` rather than editing that component's internals.
3. **Badge change is additive/opt-in.** `TemplateStatusBadge` is used in 4 other places (list table, lifecycle accordion, setup-mode-shell, test page) that don't pass `deploymentCount` — they render byte-for-byte unchanged. Only the `[id]/page.tsx` non-lifecycle branch (the currently active path — `SF_AGENT_LIFECYCLE` is off) was wired to pass it, per Minimal Impact.
4. **`scripts/run-unit-tests.js`'s `ENAMETOOLONG` was NOT fixed** (out of the "Files touched" list) — used a local, uncommitted chunked-runner script for a broad spot-check instead, as instructed.

## Open risks

- The schedule aggregate-failure (no-throw) case still lacks a root-cause string (see deviation 1) — a real fix needs a small `run-event-agent.ts` change (e.g. carry the first failure's reason string) as a follow-up slice.
- The lifecycle-enabled branch (`SF_AGENT_LIFECYCLE=1`, currently off) still shows the old tri-state via `AgentLifecycleAccordion`/`SetupModeShell` — not wired to deployment truth. Low risk while the flag stays off; should be revisited if/when it flips.
- Full-suite `ENAMETOOLONG` blocks CI-identical local runs; the pre-existing `zod`/`@anthropic-ai/sdk` resolution failures (~360) need a real pnpm-install fix, independent of this slice.
