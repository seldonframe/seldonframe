# Automations truth — build report (2026-07-16)

Branch `fix/automations-truth` @ `509809bab` → `1ad6cc281`. Spec:
`docs/superpowers/specs/2026-07-16-automations-truth-design.md`.

## Commits

| Task | SHA | Summary |
| --- | --- | --- |
| 1 (generalize error observability) | `6d960dda1` | `console.error` on every non-ok propose result (typed error + resolved model id + scrubbed upstream), honest per-error UI copy |
| 2 (two-doors card) | `62ca412b5` | `TwoDoorsCard` component + tests (page wiring lands in Task 3's commit — see deviation below) |
| 3 (your-agents strip) | `1ad6cc281` | `loadDeployedAgentsForStrip` loader + `YourAgentsStrip` component + wires BOTH the two-doors card and the strip into `automations/page.tsx` |
| 4 (this report) | — | regression sweep + report |

## Test deltas (chunked runner, 40-file batches, `node --import tsx --test`)

- Baseline (509809bab): **7583 pass / 209 fail**.
- After all three tasks: **7600 pass / 209 fail**.
- Delta: **+17 pass, 0 new fail** — the 209 failures are the pre-existing
  DB-bound/environment baseline (unchanged count, confirmed no new file
  names introduced failures via `tsc` cross-check).
- New test files: `generalize-log.spec.ts` (6), `two-doors-card.spec.tsx`
  (5), `your-agents-strip.spec.tsx` (6) = 17, matching the pass delta
  exactly.
- Added 6 tests (`mapProposeGeneralizationError` suite) to
  `generalize-template-panel.spec.tsx`, but that file **cannot execute in
  this environment**: importing it pulls in `generalize-actions.ts` →
  `lib/auth/helpers.ts` → `auth.ts` → `next-auth`, which requires
  `@auth/core` — **not present** in the repo's `node_modules` (verified:
  `ls node_modules/@auth` → no such directory). Confirmed via `git stash` +
  re-run that this file crashes **identically on baseline HEAD**, so it is
  a pre-existing environment gap, not a regression from this change. The
  `mapProposeGeneralizationError` function was verified by direct code
  review (a pure exhaustive switch, 5 distinct return strings) since the
  harness cannot load the module. Flagging this to Max: `@auth/core` is
  missing from installed `node_modules` repo-wide — every test that
  transitively imports `lib/auth/helpers.ts` is silently uncounted.

## `npx tsc --noEmit`

Baseline: 80 pre-existing errors (all `zod` / `@anthropic-ai/sdk` module
resolution + a handful of pre-existing implicit-`any` in unrelated files).
After all three tasks: same 80-line baseline set, **zero new errors** —
confirmed by grepping the post-change output for `automations`,
`two-doors`, `your-agents`, `agent-receipts`, `generalize`: the only hits
(`automations/page.tsx` `soulActions` implicit-any, `generalize-llm.ts`
`@anthropic-ai/sdk`) are byte-identical pre-existing lines, just shifted by
import-line additions (confirmed via `git show HEAD:...`).

## `pnpm check:use-server`

`✓ All 'use server' files export only async functions / types.` — passes
before and after (generalize-actions.ts's new wrapped-LLM logic stays
inside the existing async action; no new "use server" file added).

## Per-task notes

**Task 1** — `lib/agent-templates/generalize-log.ts` (new, pure,
`buildGeneralizeFailureLog`) builds the `console.error` line
`{ templateId, orgId, error, model, upstream? }`. `generalize-actions.ts`
wraps the DI'd LLM call in a closure that captures the thrown upstream
error's `.message` before `proposeTemplateGeneralization`'s try/catch turns
it into the typed `llm_failed`, then logs on every non-ok result (using
`process.env.ANTHROPIC_EVAL_MODEL || DEFAULT_GENERALIZATION_MODEL`, reused
from `generalize-llm.ts` rather than re-derived). `scrubSecretShapes` is
imported from `lib/agent-receipts/write.ts` (reused, not duplicated). The
function's input type has no `customSkillMd` field — structurally
impossible to log skill-md content. UI: extracted
`mapProposeGeneralizationError` (pure, exported) replacing the inline
ternary; error `<p>` tagged `data-generalize-error`.

**Task 2** — Found the card inline in
`app/(dashboard)/automations/page.tsx` (not a separate component file, as
the spec's grep hint assumed). Extracted into
`components/automations/two-doors-card.tsx` — a genuinely new component,
not a rename of an existing one.

**Task 3** — Reused `getDeploymentLiveStatus` (agent-receipts/store.ts) for
the live-dot/trigger-kind derivation — **no second status-deriving
implementation** was written. There was no pre-existing exported "deployment
listing loader" to call directly (`studio/agents/page.tsx`'s deployment
query is inline in that page component, not exported); per the spec's own
fallback ("do NOT write new query logic **if a loader exists**" — none
did for this exact shape), a new loader `loadDeployedAgentsForStrip(orgId)`
was added to `lib/agent-receipts/store.ts` (same file, same org-scope
convention as its sibling `getDeploymentLiveStatus`), joining `deployments`
to `agentTemplates` for the name and then calling the existing
`getDeploymentLiveStatus` per row — reuse at the status layer, new code
only at the listing-query layer. Org-scoped via
`or(builderOrgId = orgId, clientOrgId = orgId)`, mirroring
`getDeploymentLiveStatus`'s own scope check exactly.

## Deviations from the plan

- Task 2's component landed in commit `62ca412b5` without the page-wiring
  (the actual `automations/page.tsx` edit that swaps in `<TwoDoorsCard />`
  happened in the Task 3 commit `1ad6cc281`, since both the card and the
  strip were wired into the same file in one edit pass). Called out here
  rather than hidden — no functional difference, just commit boundaries.
- Task 1's UI test requirement ("panel renders the mapped message,
  renderToString") could not be exercised end-to-end through
  `GeneralizeTemplateCard`'s stateful interaction (no jsdom in this repo,
  per convention, and the card's error state is only reachable via
  `useTransition` + a server action call) — tested the extracted pure
  `mapProposeGeneralizationError` function directly instead, which is the
  same approach used elsewhere in this codebase for logic embedded in
  client components.
- No new "org-scoping test" was added for `loadDeployedAgentsForStrip`
  itself (DB-bound, no DI seam, consistent with the sibling
  `getDeploymentLiveStatus` which also has no dedicated spec file) —
  org-scope correctness rests on the query's `WHERE` clause mirroring the
  already-reviewed `getDeploymentLiveStatus` pattern exactly, plus the
  presentational component's fixture tests.

## Open risks

- The missing `@auth/core` dependency (noted above) silently zeroes out
  every test file that imports `lib/auth/helpers.ts` in this environment —
  worth a separate fix so CI doesn't have a blind spot.
- `loadDeployedAgentsForStrip` issues one extra query per deployment
  (reusing `getDeploymentLiveStatus`) — fine for a per-org compact strip,
  but would need batching if any org accumulates a very large deployment
  count.
