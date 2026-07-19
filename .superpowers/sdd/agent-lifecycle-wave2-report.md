# Agent Lifecycle Slice — Wave 2 (T6–T11) — Maker Report

Branch `feature/record-to-agent`, worktree `.claude/worktrees/record-to-agent`. 5 commits on top of Wave 1's `4ec1d8f8f`:

- `64dff128e` — T6a stage-completion derivation (pure)
- `c3bfb3115` — T6b–T8 ladder shell, Learned + Verified stages
- `e9d90c5d4` — T9 Connected stage
- `2fc7080a4` — T10 Run stage (centerpiece)
- `a50ceedb1` — T11 Sell stage + wire the ladder into the page

## Files changed

- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/stage-derivation.ts` (new)
- `packages/crm/tests/unit/agents/lifecycle/stage-derivation.spec.ts` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/agent-lifecycle.css` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/ladder.tsx` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/learned-stage.tsx` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/verified-stage.tsx` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/connected-toolkits.ts` (new)
- `packages/crm/tests/unit/agents/lifecycle/connected-toolkits.spec.ts` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/connected-stage.tsx` (new)
- `packages/crm/src/lib/agent-templates/lifecycle-connect-actions.ts` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/run-stage-reducer.ts` (new)
- `packages/crm/tests/unit/agents/lifecycle/run-stage-reducer.spec.ts` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/run-stage.tsx` (new)
- `packages/crm/src/lib/agents/lifecycle/deploy-to-self.ts` (new)
- `packages/crm/tests/unit/agents/lifecycle/deploy-to-self.spec.ts` (new)
- `packages/crm/src/lib/agent-templates/deploy-to-self-actions.ts` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/lifecycle/sell-stage.tsx` (new)
- `packages/crm/src/app/(dashboard)/studio/agents/[id]/page.tsx` (modified — flag-gated ladder branch + `export const runtime = "nodejs"`)

## What changed, per task

**T6 — token layer + ladder shell.** `stage-derivation.ts`: pure `deriveLifecycleStages()` — five stages (Learned/Verified/Connected/Run/Sell), Connected is vacuously complete when the template requires no toolkits. `agent-lifecycle.css`: the `--lc-*` token-swap layer, `.sf-lifecycle` bound to SF's existing dashboard tokens (`var(--card)` etc.), `.sf-lifecycle-dark` defined but unconsumed (reserved for `/record`'s future adoption, per spec). `ladder.tsx`: `LifecycleRail` (the numbered pill rail) + `LifecycleStageCard` (per-stage section), both server-safe presentational components — no `"use client"`.

**T7 — Learned stage.** `learned-stage.tsx` (client): renders the Q&A record (`answeredQuestions` pairs), open questions as bullets, and the "keep teaching" input wired to the EXISTING `continueInterviewAction` (Wave 1). Non-recording templates get the compact "built from your description" card with no interview UI, per spec.

**T8 — Verified stage.** `verified-stage.tsx`: explain copy (names the pass threshold from Wave 1's `EVAL_PASS_THRESHOLD`, single source of truth) + a derived-scenarios list (mustDo/mustNot counts, from `recordingSessions.derivedScenarios`) wrapped around the EXISTING `RunEvalsCard` — reused verbatim, not forked.

**T9 — Connected stage.** `connected-toolkits.ts`: pure `requiredToolkitSlugs()` (only `kind:"composio"` bindings contribute; catalog-filtered, deduped) + `countConnectedRequiredToolkits()`. `connected-stage.tsx` (client): per-toolkit status rows + a Connect button. `lifecycle-connect-actions.ts` (new "use server" file): `connectLifecycleToolkitAction` — the SAME `createConnectLink` managed-OAuth flow `/integrations` already uses, but with the callback pointed back at `/studio/agents/<id>#lc-connected` instead of `/integrations`. No Composio key configured → a link to `/integrations`, never a dead Connect button.

**T10 — Run stage (centerpiece).** `run-stage-reducer.ts`: pure `runStageReducer` state machine (`idle → starting → running → succeeded|failed`, plus `start_failed`), exhaustively unit-tested including out-of-order/stale-runId guards. `run-stage.tsx` (client): kicks off `startSupervisedRunAction`, polls `getSupervisedRunAction` every 1.5s while `running`, renders the monospace action log with `…`/`✓`/`✗` glyphs, shows the last completed run on revisit (`initialLastRun` prop, read server-side in `page.tsx`).

**T11 — Sell stage + deploy reorder.** `deploy-to-self.ts`: pure `deployToSelfCore` — reuses `lib/deployments/store.ts`'s `createDeployment`/`updateDeployment` (the SAME rail `createDeploymentAction`/the client-deploy stepper call) with `existingClientOrgId` pinned to the caller's OWN org id, so the deployment's `clientOrgId` resolves to the operator's own workspace. Phone-less triggers (chat/email/sms inbound, pure-outbound events, schedule) activate immediately; a phone-owning trigger (inbound voice/sms, `missed_call`) stays `draft` and is reported honestly (`active:false`) — self-deploy never buys/claims a number. `deploy-to-self-actions.ts`: the thin org-guarded wrapper. `sell-stage.tsx`: For myself → Marketplace (gated by a checklist reading the SAME `lifecycleGate` fields the server-side publish gate checks — `ListOnMarketplace` embedded, moved not forked) → To a client (links to the existing `/deploy` and `/deploy-to-clients` stepper routes, unchanged).

**page.tsx wiring.** `SF_AGENT_LIFECYCLE === "1"` → early-return guard is INVERTED (flag OFF returns the existing JSX verbatim, unchanged since Wave 1/before; flag ON falls through to the new ladder branch) so flag-off is byte-for-byte the pre-existing page with zero extra queries. The ladder branch composes: `lifecycleGate` (real `getLatestEvalRun` + an org-scoped `hasSucceededSupervisedRunForTemplate` — a small local duplicate of `seller-actions.ts`'s own copy, kept local so each call site's org-scope stays explicit rather than exporting a cross-module helper), `listConnections`/toolkit status, the latest `supervised_runs` row, and `listDeployments` (to derive `hasDeploymentOrListing`). Declares `export const runtime = "nodejs"` because the Connected stage's Composio import (`lib/integrations/composio/client.ts`) is Node-runtime-only per that file's own header contract.

## Deviations from the plan

1. **T6's plan-named file path** (`lifecycle/agent-lifecycle.css` colocated under `[id]/lifecycle/`) matches exactly; no deviation there. The stage-rail/stage-card split is `ladder.tsx` exporting BOTH `LifecycleRail` and `LifecycleStageCard` rather than two separate files — kept together since they share the same `LifecycleStage` type and are always used as a pair; this is Minimal Impact, not scope creep.
2. **Connect-action file placement**: the plan implied the Connect button mints `createConnectLink` "server-side" without naming a file. I created a NEW file (`lib/agent-templates/lifecycle-connect-actions.ts`) rather than extending the existing `/integrations` `actions.ts` (whose `returnTo` allowlist only supports `"dashboard"` or the default `/integrations` base) — this avoids touching an out-of-plan file and keeps the callback-URL allowlist logic scoped to this slice.
3. **`hasSucceededSupervisedRunForTemplate` duplicated** in `page.tsx` rather than exported from `seller-actions.ts` or a shared module — each of the three call sites (Wave 1's marketplace gate, Wave 1's `getSupervisedRunAction`, this page) keeps its own org-scoped query rather than sharing a helper that could accidentally be called unscoped. Matches the codebase's existing convention (the SAME duplication pattern already exists between `seller-actions.ts` and `supervised-run-actions.ts` from Wave 1).
4. **`export const runtime = "nodejs"`** added to `page.tsx` — not explicitly named in the plan, but required by `lib/integrations/composio/client.ts`'s own documented contract ("any route/page that (transitively) imports this module MUST `export const runtime = "nodejs"`"), which this page now does (Connected stage data). Necessary correctness fix, not scope creep.
5. **`RunEvalsCard`/`ListOnMarketplace` reused via direct import** from their existing files (`../run-evals`, `../list-on-marketplace`) rather than being moved to a new location — "move, don't fork" is satisfied by reuse-in-place; physically relocating them was unnecessary and would have widened the diff for no behavioral gain.
6. **"render smokes for composition"**: this codebase's test harness is `node:test` only — no React Testing Library / jsdom render harness exists anywhere in the repo (verified: zero matches for `@testing-library` or component `render(` calls in `packages/crm/tests`). Introducing one would itself be a meaningful new-infra task outside this slice's scope. Composition correctness for the client islands is instead covered by: (a) `tsc --noEmit` (zero delta — catches prop-shape/import errors), (b) the pure logic every island is built on (`stage-derivation`, `connected-toolkits`, `run-stage-reducer`, `deploy-to-self`) being exhaustively unit-tested. Flagged as a residual gap, not silently dropped — see Open risks.

## Test results (verbatim tail)

Full named regression set + all new lifecycle specs, one run:

```
ℹ tests 197
ℹ suites 52
ℹ pass 197
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7453.3814
```

Spec files: `agents/lifecycle/{policy,gate,supervised-run,stage-derivation,connected-toolkits,run-stage-reducer,deploy-to-self}.spec.ts`, `recordings/{compile-agent,interview,recorder-machine}.spec.ts`, `agent-templates/{interview-actions,stateless-turn}.spec.ts`, `agents/{stateless-turn-overrides,runtime-booking-binding}.spec.ts`, `marketplace/storefront-pricing.spec.ts`, `migrations/check-migrations-journaled.spec.ts`.

New Wave 2 tests specifically: 8 (stage-derivation) + 5 (connected-toolkits) + 11 (run-stage-reducer) + 10 (deploy-to-self) = 34 new tests, all passing.

`npx tsc --noEmit -p tsconfig.json`: 35 errors, ALL pre-existing (styled-jsx/`ThemeProvider`/implicit-any noise in files this slice never touches — `landing-r1`/`landing-templates`/`build-animation`/etc.). **Zero delta** — confirmed via `git stash` (which reverts the one tracked file this wave modified, `page.tsx`; the new untracked lifecycle files are additive-only and independently error-free) producing the identical 35-error count before and after.

`bash scripts/check-use-server.sh src`: `✓ All 'use server' files export only async functions / types.`

Migration journal check: no new migration in Wave 2 (all schema additions were Wave 1's `0068_agent_lifecycle.sql`); `check-migrations-journaled.spec.ts` still passes (10/10).

## Open risks

- **No render-level UI test for the client islands** (learned-stage, connected-stage, run-stage, sell-stage) — see deviation #6. Recommend a live smoke (flag on) before merge, per the plan's own "Live smoke (post-deploy, flag off/on)" verification step, to confirm the ladder actually renders and the Run stage's poll loop behaves against a real Anthropic key.
- **`ConnectedStage`'s "why" line is generic** (`"Used by <template name>'s workflow."`) rather than the spec's aspirational "step 3 sends the reply from Gmail" per-toolkit provenance — Wave 1's compile pipeline does not currently persist a toolkit→source-step mapping on the blueprint's connector bindings, only the binding itself. Deriving a precise per-step "why" would require a Wave 1-level pipeline change (out of Wave 2's scope: UI only, no new backend derivation). Flagged, not silently downgraded.
- **`hasSucceededSupervisedRunForTemplate` is now duplicated in 3 places** (Wave 1's `seller-actions.ts`, Wave 1's `supervised-run-actions.ts` inline equivalent via `getSupervisedRunAction`, and this wave's `page.tsx`). All three are correct and independently org-scoped, but a future slice may want to consolidate into one exported, always-org-scoped helper if a fourth call site appears.
- **`RequiredToolkitView.logo` is threaded through but never rendered** (no `<img>` in `connected-stage.tsx`) — harmless (typed, unused field), left in place since the spec's handoff reference shows toolkit logos and a follow-up may want them; not wired to keep this wave's diff minimal.
