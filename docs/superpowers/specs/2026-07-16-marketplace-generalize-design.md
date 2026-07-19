# Marketplace generalization — recorded agents that fit anybody

**Branch:** `feat/marketplace-generalize` @ `68300a925` · **Approved:** Max 2026-07-16 ("give him the ability to deploy it to marketplace — can modify the rules a bit so it fits for anybody — and deploy to a client") · **Flag:** none new (publish gates keep their existing `SF_AGENT_LIFECYCLE` behavior)

## Why

Max's recorded agent works (soon), but its skill-md is personal: "forward to Dresslikeag@gmail.com", note body "yo max check this out". Listing it on the marketplace or deploying it to a client ships Max's email address inside someone else's agent. The rules need to generalize — personal constants become variables each deployment fills with its own values.

## Ground truth (recon verified by L-16 spot-check, all in this worktree)

- **Placeholder machinery EXISTS — reuse it:** `TOKEN_RE = /\{\s*([\w ]+?)\s*\}/g` (deployment-customization.ts:95); `fillPlaceholders(text, vars)` (:128) fills `{token}`s and cleanly drops unknowns; tokens normalize `{Business Name}` → `business_name`; deploy-time vars come from `DeploymentCustomization.businessInfo` (name/hours/address/phone/email) inside `resolveDeploymentPersona` (:183); the filled prompt is injected at deployment-voice.ts:172-195. Platform `{{double}}` tokens are untouched by design.
- **Publish flow EXISTS:** `ListOnMarketplace` (studio/agents/[id]/list-on-marketplace.tsx:209-756) → `publishOrUpdateAgentListingAction` (lib/marketplace/seller-actions.ts:357); free listings publish immediately; paid needs Stripe Connect; eval+supervised gates behind `SF_AGENT_LIFECYCLE` via `resolvePublishGuard` (:275-308).
- **Client deploy EXISTS, no type gating:** `deployAgentTemplateToClientsAction` (deploy-to-clients-action.ts:70), one agents row per client workspace, idempotent via `sourceTemplateId`.
- **Install paths EXIST:** free fork `forkListingIntoNewWorkspace` (fork-listing.ts:103, instant anonymous workspace); paid `installAgentListingAction`. NO install-time variable-fill UI exists yet — that's the new seam.
- Name collision check: `templateVariables` unused in packages/crm/src; the only `templateVars` is unrelated (page-schema/seed-landing-from-soul.ts). Blueprint field = `templateVariables`; deployment fill = `customization.templateVarValues`.

## Design

1. **Declare variables on the template (blueprint, no migration).** `AgentBlueprint.templateVariables?: Array<{ name: string; description: string; example: string }>` (name = snake_case token matching TOKEN_RE's normalization). Extend `TemplateBlueprintPatchSchema` allow-list with zod validation (name regex `^[a-z0-9_]{2,40}$`, max 12 variables).
2. **"Make it fit anybody" — the generalization pass (Sell card, propose-never-auto-apply).** New server action `proposeTemplateGeneralization(templateId)`: LLM pass over `customSkillMd` returning proposed substitutions `[{ token, currentValue, description, example }]` — personal emails, names, phone numbers, org-specific phrasing. Renders as a review list in the Sell stage (each row: current value → `{token}`, editable token/description, include-checkbox). On operator confirm, a second action applies: rewrites `customSkillMd` replacing each accepted literal with `{token}` (exact-string replace, count-verified — if a literal appears 0 times at apply-time the row errors rather than silently no-ops) and writes `templateVariables`. The operator's own deployment keeps working: applying also back-fills the operator's current deployment `customization.templateVarValues = { token: currentValue }` so HIS live agent's behavior is byte-identical after generalization (never-lies: generalizing must not change the author's agent).
3. **Fill at runtime (one merge point).** In `resolveDeploymentPersona`, merge `customization.templateVarValues` OVER the businessInfo-derived vars before `fillPlaceholders` (template vars win on collision — they're explicit). Type: `templateVarValues?: Record<string, string>` on `DeploymentCustomization`.
4. **Fill UI at the three entry points.** Where a template with non-empty `templateVariables` is deployed:
   - Deploy-for-myself + Deploy-to-client(s): a required-fields form (name/description/example per variable) before the action fires; values → `customization.templateVarValues`. All declared variables REQUIRED (an unfilled variable would silently vanish via fillPlaceholders' drop behavior — dishonest output; block instead).
   - Marketplace fork/install: the forked/installed template CARRIES `templateVariables`; the installer's deploy step hits the same required form (reuse the same component). No new wizard — locate the existing deploy confirm surface and mount there.
5. **Publish nudge:** in `ListOnMarketplace`, when `customSkillMd` still contains ANY of the operator's org email/phone (cheap heuristic: the org's own contact fields as literals) and `templateVariables` is empty, show a non-blocking warning row: "This agent contains your personal details — run 'Make it fit anybody' first." Never hard-block (operator may intend it).

## Deliberate cuts (named)

LLM-assisted auto-fill of variables from the installer's Soul (later — the Soul has business_name etc. already via businessInfo path) · variable types beyond string · per-variable validation rules · retro-generalizing published listings.

## Build plan (TDD, commit per task, baselines + junction setup first, delta-judged)

- **Task 1 — types + fill merge.** `templateVariables` on AgentBlueprint + patch schema (zod tests: regex, cap 12); `templateVarValues` on DeploymentCustomization; merge in `resolveDeploymentPersona` (tests: template var wins over businessInfo on collision; absent → byte-identical current behavior — deep-equal regression on a fixture persona resolve).
- **Task 2 — generalization actions.** `proposeTemplateGeneralization` (DI llm; unit tests with fake LLM: extracts email/name literals, proposes snake_case tokens; malformed LLM output → explicit error, never partial apply) + `applyTemplateGeneralization` (pure core function tested hard: exact-literal replace with occurrence-count verification, 0-count row → error result; writes templateVariables; returns the operator back-fill map). Server action wires org-scoped auth (session orgId must own template — mirror existing seller-actions auth) + back-fills the author's existing deployments' templateVarValues in the same transaction.
- **Task 3 — Sell-card review UI.** Propose → review list → apply flow in list-on-marketplace.tsx area (match its existing form conventions); the personal-details warning row. renderToString tests: rows render with current→token mapping; warning shows/hides; L-36 visibility invariants on new interactive elements.
- **Task 4 — deploy-time fill forms.** Shared `TemplateVariablesForm` component; mounted at deploy-for-myself + deploy-to-clients confirm surfaces (locate at build time; required-field enforcement server-side too — the action rejects missing/blank declared vars with an explicit error, Optimistic Path rule). Fork/install path: verify the forked blueprint carries templateVariables (test on fork-listing), and the installer's deploy uses the same form.
- **Task 5 — regression + report.** Suite delta (chunked runner if needed), tsc delta, use-server gate, generate-and-grade skill if anything under lib/agents/generate/** moved (it should NOT — flag if it did), build report.

Out of scope: agent-truth slice surfaces · notifications · Soul-powered auto-fill.
