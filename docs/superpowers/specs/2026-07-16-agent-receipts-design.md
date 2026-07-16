# Agent run receipts + activity upgrade + connected-account pin — design & plan

**Branch:** `feat/agent-receipts` @ `40c564f40` · **Approved:** Max 2026-07-15 ("greenlight 3") · **Flag:** none (additive internal surface; every writer is fail-soft)

## Why (live incident, 2026-07-15)

Max's deployed inbox agent ran 3 times (deployments.customization: `_composioPushRunCount=3`, 3 processed Gmail ids) — and NO queryable record exists of what it did (verified against prod with full SQL access: no receipt row anywhere; activity page shows outbound event-agents only). A never-lies product must show receipts. Second issue: deploy logged SDK warning "Multiple connected accounts found … using the first one. Pass connectedAccountId…" — the Gmail account the agent reads was chosen arbitrarily.

## Ground truth (verified this session)

- Push path: webhook `api/webhooks/composio/route.ts` → event bus → `dispatchComposioEventToDeployments` (lib/deployments/composio-event-dispatch.ts:135-240) → `claimComposioPushRun` (lib/deployments/store.ts:1560, atomic jsonb count+dedupe) → `runStatelessAgentTurn` (composio-event-dispatch-deps.ts:81) → release-claim on failure (dispatch L219-227). At completion the dispatch scope holds: deploymentId, orgId, messageId, and the turn result (tool calls + outcomes).
- Scheduled path: `api/cron/schedule-agents` fires `runEventAgent` for due schedule-trigger deployments every 15 min.
- Activity page `app/(dashboard)/studio/agents/activity/page.tsx`: org-scoped, outbound sends only (`loadEventAgentActivity` over sms/emails/event_agent_scheduled_sends), 1d/7d/30d window.
- "Multiple connected accounts" is SDK-emitted (absent from our src). `ToolkitConnection.connectedAccountId` exists (composio/client.ts:54); per-deployment entity scoping at client.ts:101-104. Nothing persists/passes a chosen account id today.
- **Read-back registry does NOT exist on main** (memory overstated; it's prompt-text only). Receipts v1 therefore records tool-call outcomes, not read-back verdicts. Registry stays roadmap.
- Migrations: never-fail slice took `0072` (journal idx 49) — this slice takes **`0073_agent_run_receipts` (idx 50)**. Hand-written, additive, idempotent.

## Design

1. **Table `agent_run_receipts`** (org-scoped; keep-forever): id uuid pk · org_id FK not null · deployment_id uuid FK → deployments (cascade-null ok) · trigger_kind text (`push | schedule | event`) · source_ref text nullable (gmail message id / cron fire tag) · status text (`ok | error | skipped`) · summary text (one human line: "Forwarded 'New SeldonFrame signup…' to Dresslikeag@gmail.com") · tool_calls jsonb `[{tool, ok, note?}]` · created_at. Indexes: `(org_id, created_at desc)`, `(deployment_id, created_at desc)`.
2. **Writer `lib/agent-receipts/write.ts`** — `writeRunReceipt(input): Promise<void>` — **fail-soft by contract**: any throw is caught + console.warn'd; a receipt failure must NEVER fail or retry the run. Called from (a) composio-event-dispatch completion (ok + error paths incl. the release-claim branch — status `error`), (b) schedule-agents cron per-deployment fire (ok/error), summarizing from the turn result available in scope. Summary derivation: first tool call's human line if present, else turn text truncated 140 chars, else "ran with no actions".
3. **Activity page upgrade** (same file, same conventions): add an "Agent runs" section listing receipts (When · Agent/Deployment · Trigger · Source · Outcome badge · summary; expandable tool_calls), org-scoped, same window toggle; keep the existing outbound table below. Add per-deployment **LIVE banner** data helper `getDeploymentLiveStatus(deploymentId)` → `{active, triggerKind, todayCount, lastReceiptAt}` from deployments + receipts; render the banner on the agent template page's deploy/run area ("● LIVE — watching via push · 3 runs today · last 00:04") — locate the exact slot (the studio agent page Run/Deploy section) and match its styling; if no deployment exists render nothing.
4. **Connected-account pin:** at deploy-to-self (where `maybeUpgradeInboxTrigger` runs), list toolkit connections for the entity; if >1 connected account, persist the CHOSEN id as `customization._composioConnectedAccountId` (choose the first, matching today's behavior — but now RECORDED) and pass it through the composio session/tool-execution path so the SDK stops guessing (investigate the exact SDK param on `client.ts`'s session creation; if the installed SDK exposes none, STOP and report — do not hack). Surface it on the banner when present ("reading <account>"). Existing deployments without the field keep today's behavior.
5. **Deliberate cuts (named):** test-fire button (needs outbound email plumbing — follow-up) · read-back verdict column (no registry exists) · notifications.

## Build plan (TDD, commit per task, baselines first, judge by delta)

- **Task 1 — schema + migration 0073** (mirror 0072's style exactly; journal idx 50, `when` > idx 49's). Schema file db/schema/agent-run-receipts.ts + index.ts export.
- **Task 2 — writer + call sites.** Unit tests (DI db mock): happy write, fail-soft (db throws → resolves void, run continues — test the CALLER wrapping too), summary derivation cases. Wire into composio-event-dispatch (ok/error/release paths) + schedule-agents cron. Regression: existing dispatch tests stay green (the writer must be injected via the existing deps pattern of composio-event-dispatch-deps.ts — read it first).
- **Task 3 — activity section + live banner.** Server queries org-scoped; renderToString tests: receipts section renders rows + outcome badges; empty state; banner shows/hides correctly. Match existing page table styling.
- **Task 4 — connected-account pin.** Investigate SDK param (read composio/client.ts + the installed @composio SDK's session API in node_modules); persist chosen id at deploy; thread through tool execution for deployments that have it; unit test the resolution fn (0 accounts → null, 1 → that id, >1 → first + persisted). STOP-condition per Design §4 if the SDK exposes no selector.
- **Task 5 — full regression** + migration-journal pre-check + build report.

Out of scope: read-back registry · execute-on-approve · /approvals convergence · slice 2/4 surfaces.
