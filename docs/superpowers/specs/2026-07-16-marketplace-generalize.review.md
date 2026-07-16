# Marketplace generalize — independent review (2026-07-16)

Reviewer: independent, fresh context. Scope: `git diff 68300a925..HEAD` (7 commits).

## Verdict: FIX FIRST

The pure core (generalize.ts), the atomic tx orchestration, the runtime merge
point, and the single-client deploy wizard are correct and well-tested. But the
spec's central never-lies invariant is only enforced on ONE of the FOUR deploy
entry points. The other three silently drop declared variables — the exact
dishonest-output-on-a-happy-path the spec set out to prevent.

## Spec compliance

MET
- Task 1 types + `templateVarValues` merge in `resolveDeploymentPersona` (template
  var wins on collision; absent → byte-identical; regression fixture green).
- Task 2 propose/apply pure core: exact-literal, occurrence-count-verified,
  all-or-nothing, duplicate-token guard, author back-fill map. Count is
  re-verified against the CURRENT customSkillMd at apply time (loadOwnedTemplate
  reloads), so a propose→edit→apply race is caught. Org-scoped actions correct.
- Atomicity: `db.batch([...])` → `client.transaction(builtQueries)` in the
  installed neon-http driver (session.js:117-132) — a single atomic transaction.
  Blueprint rewrite + all back-fills land together. Claim VERIFIED in node_modules.
- Task 3 Sell-card generalize UI + non-blocking warning row.
- Single-client deploy wizard (`/deploy`): TemplateVariablesForm gated client-side
  (templateVariablesComplete) AND server-side (validateTemplateVarValues) — correct.
- LLM DI hygiene: malformed/thrown/null → explicit typed error, never a silent
  empty proposal list. Well tested.

MISSING (spec item 4 — "the three entry points")
- "Deploy for myself" (deployToSelfAction) — NO fill form, NO validation.
- "Deploy to clients" bulk (deployAgentTemplateToClientsAction) — NO fill/validation.
- Marketplace fork/install buyer path — NO templateVarValues handling anywhere in
  lib/marketplace (grep clean). Spec item 4 explicitly required this surface.

## Blocking issues

1. **Three of four deploy surfaces drop declared variables — dishonest output on
   a happy path, including the AUTHOR's own agent.**
   The SellStage card (`sell-stage.tsx`) exposes "Deploy for myself" and "Deploy
   to clients" one click below the "Make it fit anybody" button. After an operator
   generalizes (declaring variables that rewrite their personal literals in
   customSkillMd into `{tokens}`):
   - "Deploy for myself" → `deployToSelfAction` creates a deployments-table row with
     NO templateVarValues. At runtime `resolveDeploymentPersona` drops every token →
     the author's OWN personal details silently vanish from their own live agent.
     This is precisely the never-lies "author byte-identical" invariant (design §2)
     inverted.
   - "Deploy to clients" → `deployAgentTemplateToClientsAction` writes agents-table
     rows via `createAgent`; that path never calls `resolveDeploymentPersona`, so the
     tokens are never filled — the generalized persona ships broken/raw or lost to
     the client.
   - Marketplace fork/install carries `templateVariables` on the blueprint but has no
     fill form, same drop.
   Spec item 4 required all three to reject or fill; CLAUDE.md 3.1 Optimistic Path
   requires an explicit error, not a silent pass. The maker acknowledged this in the
   build report "Open risks" but did NOT gate it. Minimum fix: those actions must
   reject a template with non-empty `templateVariables` with an explicit typed error
   (mirroring validateTemplateVarValues), WITH tests, before merge — or mount the
   fill form. A note in a build report is not a gate.

## Non-blocking issues

1. **Overlapping / substring literals produce a declared variable with no
   placeholder.** applyTemplateGeneralization count-checks all rows against the
   ORIGINAL text (both pass), then rewrites sequentially. If one literal is a
   substring of another (e.g. "max@x.com" and "max@x.com."), the first rewrite
   consumes the shared text and the second row's split/join silently no-ops — yet
   its token is still declared in templateVariables + backfillValues. Result: a
   required deploy-form field whose value fills nothing. Rare (needs the LLM to
   propose overlapping literals) but untested. Fix: sort rows by descending
   currentValue length, or re-verify each occurrence during the sequential rewrite
   and error if a row hits 0 at its turn.

2. **No end-to-end author byte-identical test.** Priority-4 invariant (resolve
   persona BEFORE generalization == resolve AFTER apply+back-fill) is proven only by
   construction — the pieces are individually tested but nothing chains
   applyTemplateGeneralization's rewritten customSkillMd + backfillValues through
   resolveDeploymentPersona and asserts equality with the pre-rewrite resolve. Add
   one round-trip test; it's the feature's core promise.

3. **generalize-llm.ts + generalize-template-panel open-state have no locally-green
   coverage** (worktree scoped-package-resolution defect per build report). Parse
   logic mirrors the proven score-llm pattern, but a real CI run is the actual gate —
   confirm green in CI before merge.
