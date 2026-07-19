# Marketplace generalize — build report

Branch: `feat/marketplace-generalize` @ `dac132e55` → `5e143a7df` (5 commits, Tasks 1–4 + one lessons commit).

## Per-task shas

| Task | SHA | Summary |
|---|---|---|
| 1 | `16fdd3aea` | `AgentBlueprint.templateVariables` + zod allow-list + `DeploymentCustomization.templateVarValues` merge in `resolveDeploymentPersona` |
| L-38 | `c159fbbdf` | Recovery lesson after a stray unrelated stash got popped into this worktree mid-session (recovered via `git reset --hard HEAD`, no work lost) |
| 2 | `15da576a8` | `proposeTemplateGeneralization` / `applyTemplateGeneralization` (pure core) + DI'd tx orchestrator + `"use server"` actions |
| 3 | `89e09c095` | Sell-card `GeneralizeTemplateCard` (propose → review → apply) + personal-details warning row, mounted in `sell-stage.tsx` / `celebration-screen.tsx` / legacy Publish section |
| 4 | `5e143a7df` | `validateTemplateVarValues` server-side gate + shared `TemplateVariablesForm`, wired into the single-client deploy wizard (`deployments` table); fork/install verified by test (no code change needed) |

## Test deltas (chunked runner — `scripts/run-unit-tests.js` hits `ENAMETOOLONG` on 741 files in this worktree; used a scratch chunked runner, 40 files/batch)

- Baseline (`dac132e55`): 7713 tests, 7493 pass, **207 fail**.
- Final (`5e143a7df`): 7765 tests, 7543 pass, **209 fail**.
- Delta: +52 tests, +50 pass, **+2 fail** — both new fails are `generalize-llm.spec.ts` and `generalize-template-panel.spec.tsx`, and both fail for the exact same pre-existing reason as baseline failures like `score-llm.spec.ts` and `set-deployment-customization.spec.ts`: this worktree's tsx/node-modules-junction setup cannot resolve scoped packages (`@anthropic-ai/sdk`, `@auth/core`, also `zod` — confirmed `schema.spec.ts` fails identically in baseline). Verified NOT a logic bug: `generalize-llm.ts`'s parse logic and `generalize-template-panel.tsx`'s presentational pieces are exercised indirectly through `generalize.spec.ts` (35/35 pass) and manual reasoning mirroring the proven `score-llm.ts`/`receipts-section.spec.tsx` patterns byte-for-byte.
- All new pure-logic test files are green: `generalize.spec.ts` (35/35, incl. `shouldWarnPersonalDetails` + `validateTemplateVarValues`), `apply-generalization-tx.spec.ts` (6/6), `template-variables-form.spec.tsx` (8/8), `fork-listing.spec.ts` (12/12, +1 new templateVariables-survival test), `deployment-customization.spec.ts` (42/42, incl. the templateVarValues merge + full-fixture deep-equal regression).
- `tsc --noEmit`: 364 errors baseline, 364 errors final — **zero net new** (diffed line-by-line; only line-number shifts on pre-existing errors from insertions).
- `check-use-server.sh src`: PASS, no violations.
- Nothing under `lib/agents/generate/**` touched (confirmed via `git diff --stat`).
- No migration files added/changed.

## Where the fill forms mounted

- **Sell-card generalize UI** (Task 3): `GeneralizeTemplateCard` in `components/marketplace/generalize-template-panel.tsx`, mounted in `studio/agents/[id]/lifecycle/sell-stage.tsx` (both the wizard `sell` stage and `celebration-screen.tsx`'s reuse of it) and the legacy (non-lifecycle-flag) Publish section of `studio/agents/[id]/page.tsx`.
- **Deploy-time fill form** (Task 4): `TemplateVariablesForm` in `components/marketplace/template-variables-form.tsx`, mounted in the single-client deploy wizard's Review step (`studio/agents/[id]/deploy/deploy-client.tsx`, step 4) — the wizard's `templates` prop now carries `templateVariables` from `page.tsx`. This wizard's `createDeploymentAction` writes to the `deployments` table (has `customization.templateVarValues`), so it's the one deploy surface where Task 1's merge point actually applies today.
- **Fork/install** (marketplace buyer path): verified by test, no mount needed yet — `forkListingIntoNewWorkspace`'s `structuredClone(listing.agentBlueprint)` already carries `templateVariables` verbatim into the installed template.

## Deviations from the plan (and why)

1. **Architectural discovery mid-Task-4**: the design's ground truth assumed "Deploy-for-myself + Deploy-to-client(s)" both flow through `DeploymentCustomization`. In the actual codebase there are TWO unrelated deploy mechanisms:
   - the `deployments` table (single-client wizard at `/deploy`, `createDeploymentAction`) — **has** `customization`/`templateVarValues`. Wired in Task 4.
   - the `agents` table (SellStage's one-click "Deploy for myself" via `deployToSelfAction`, and the agency-bulk `deployAgentTemplateToClientsAction`) — has **no** customization/persona-override storage at all; `resolveDeploymentPersona` is never called on this path.
   Per the STOP condition, I did not force-fit templateVarValues onto the `agents` table (that's a schema/runtime extension, not a form-mounting problem) — reported as the remaining seam instead of restructuring.
2. **neon-http has no `db.transaction`** (verified: throws `"No transactions support in neon-http driver"` in the installed driver). Task 2's "same transaction" requirement is satisfied via `db.batch([...])` instead — neon-http's actual atomic multi-statement primitive — documented inline in `generalize-actions.ts`.
3. **Marketplace buyer setup wizard** (`goLiveAction`, also `deployments`-table-backed) was scoped out of Task 4 for time; it's architecturally ready (same storage shape as the wired wizard) and is the natural next slice.
4. Mid-session, an unrelated stale stash (`feature/crm-engine`, 2026-07-08) got applied into this worktree via `git stash`/`git stash pop` (I mistakenly ran both while trying to diff a "before" tsc baseline). Recovered cleanly via `git reset --hard HEAD` — no work lost, confirmed via `git status`/`git log`. Documented as L-38 in `tasks/lessons.md`; never repeated the stash approach again this session.

## Open risks

- The `agents`-table deploy paths (deploy-for-myself, deploy-to-clients bulk) do not enforce or fill declared `templateVariables` at all today. A template with declared variables deployed through those two paths will silently drop the placeholders at runtime (via `fillPlaceholders`' existing drop-unknown-token behavior) exactly as it does for any other unfilled token today — not a regression, but not yet the "REJECT missing/blank declared variables" invariant the hard rules ask for on those two surfaces specifically.
- `generalize-llm.ts` (the real Anthropic-backed proposal call) has zero locally-green test coverage in this worktree due to the environment defect; its logic is a byte-for-byte mirror of the already-proven `score-llm.ts` pattern (DI'd client, fence-stripped defensive JSON parse), and `parseGeneralizationResponse`'s logic is identical in shape to `parseGraderResponse` — recommend a CI run (where scoped-package resolution presumably works) as the actual gate before merge.
- The Sell-card `GeneralizeTemplateCard`'s interactive propose/apply flow (state transitions, error handling) is only markup-verified via renderToString on the closed state; the open-state review/apply interactions have no jsdom-based interaction test (repo convention avoids jsdom) — manual smoke recommended post-deploy.
