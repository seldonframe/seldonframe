# Improve Verb + Trust Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `improve` verb (real-conversation replay → failure clusters → propose-only blueprint patch with before/after scores) and the trust rail that persists eval scores through to a marketplace buyer badge.

**Architecture:** New pure+DI lib `src/lib/agents/improve/` mirroring `src/lib/agents/evals/`; ONE additive migration (`eval_runs`, `agent_improve_proposals`, `marketplace_listings.trust_stats`); candidate replay = the EXISTING money-safe `runDeployedAgentEvals` with a shadow blueprint injected via its `loadAgent` dep; apply = the EXISTING `updateAgentBlueprint` (which already snapshots `agent_versions`). Surfaces: Studio panel + 2 MCP tools + 2 bearer API routes.

**Tech stack:** Next.js 16 App Router, Drizzle/Postgres, node:test + tsx, Anthropic SDK via the existing `getClient`/BYOK gate.

**Spec:** docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md (4 locked decisions at top).

## Global Constraints

- Worktree: icp3-wedge, branch from main ≥ `cd168a46`. Commit per task.
- Verify gate per task (run in `packages/crm`): `node --import tsx --test <touched specs>` → `npx tsc --noEmit` → `pnpm check:use-server`. Report verbatim output.
- Migration is ADDITIVE ONLY: `drizzle/0060_eval_trust_rail.sql` + `drizzle/meta/_journal.json` entry `{ idx: 37, version: "7", when: <current ms>, tag: "0060_eval_trust_rail", breakpoints: true }`. Also run the repo's migration-journal drift check (find it in `packages/crm/package.json` scripts — it exists; the build runs it).
- org-scope EVERY query (`orgId` in every WHERE); routes resolve org from the wst bearer exactly like `/api/v1/build/deploy` does — copy its auth verbatim.
- Propose-only: nothing but `applyImproveProposal` may call `updateAgentBlueprint` from this feature, and it requires proposal status `proposed` + org match.
- No raw customer transcripts persisted into eval artifacts: `eval_runs.resultsSummary` and `agent_improve_proposals.rationale` carry derived text only (scenario titles, criteria, cluster evidence sentences ≤ 200 chars each).
- LLM deps built ONLY via the existing `makeLlm*({ getClient })` pattern + the BYOK gate from `src/lib/agent-templates/eval-actions.ts` (`resolveStudioBuildGate`, `NEEDS_BYOK_MESSAGE`). Grader model stays `claude-haiku-4-5` / `ANTHROPIC_EVAL_MODEL`.
- Defaults env-tunable: `SF_IMPROVE_SAMPLE_SIZE` (default 50), `SF_IMPROVE_MAX_SCENARIOS` (default 24), `SF_IMPROVE_PATCH_MAX_BYTES` (default 8192).
- `skills/mcp-server` changes land in T11 ONLY; version bump to 1.59.0 there (one publish at wave end).
- Research addendum (deep-research wf_542c3413-bc8) may retune the three env defaults + the cluster taxonomy strings before T6 is dispatched; check the spec's addendum section first. Taxonomy seed: `booking_flow | hallucinated_state | pricing | missing_knowledge | tone | tool_misuse | other`.

---

### Task 1: Migration 0060 + schema — eval_runs, agent_improve_proposals, trust_stats

**Files:**
- Create: `packages/crm/src/db/schema/eval-runs.ts`
- Modify: `packages/crm/src/db/schema/marketplace.ts` (listings table: add `trustStats`)
- Modify: `packages/crm/src/db/schema/index.ts` (export the new file — REQUIRED, past outage came from a missing index export)
- Create: `packages/crm/drizzle/0060_eval_trust_rail.sql`
- Modify: `packages/crm/drizzle/meta/_journal.json`
- Test: `packages/crm/tests/unit/evals/eval-runs-schema.spec.ts`

**Interfaces (Produces):**
```ts
// schema/eval-runs.ts
export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subjectKind: text("subject_kind").notNull(),           // 'agent' | 'template'
  subjectId: uuid("subject_id").notNull(),
  kind: text("kind").notNull(),                          // 'manual'|'improve_baseline'|'improve_candidate'|'publish_gate'
  passRate: integer("pass_rate").notNull(),              // 0-100 (rounded %)
  scenarioCount: integer("scenario_count").notNull(),
  passedCount: integer("passed_count").notNull(),
  graderModel: text("grader_model"),
  blueprintVersion: integer("blueprint_version"),
  resultsSummary: jsonb("results_summary"),              // per-scenario {id,title,passed,failedChecks[]} — NO transcripts
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const agentImproveProposals = pgTable("agent_improve_proposals", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  basedOnVersion: integer("based_on_version").notNull(),
  patch: jsonb("patch").notNull(),                       // Partial<AgentBlueprint>
  rationale: jsonb("rationale").notNull(),               // { clusters: FailureCluster[] }
  baselineRunId: uuid("baseline_run_id").references(() => evalRuns.id),
  candidateRunId: uuid("candidate_run_id").references(() => evalRuns.id),
  status: text("status").notNull().default("proposed"),  // proposed|applied|dismissed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
export type EvalRun = typeof evalRuns.$inferSelect;
export type NewEvalRun = typeof evalRuns.$inferInsert;
export type ImproveProposal = typeof agentImproveProposals.$inferSelect;
```
`marketplace.ts` listings table gains: `trustStats: jsonb("trust_stats"),` (type `ListingTrustStats | null` via `.$type<>`), where
```ts
export type ListingTrustStats = { evalPassRate: number; scenarioCount: number; graderModel: string | null; lastRunAt: string; runsCount: number; improveAcceptRate: number | null };
```

**Steps:**
- [ ] Write `eval-runs-schema.spec.ts`: imports both tables from `@/db/schema` (the INDEX, proving the export), asserts expected column keys exist on each table object, and asserts `marketplaceListings.trustStats` exists. Run → FAIL (module missing).
- [ ] Create schema file, wire index export, add the listings column.
- [ ] Write `drizzle/0060_eval_trust_rail.sql`: two `CREATE TABLE IF NOT EXISTS` matching the schema exactly (uuid pk default gen_random_uuid(), FKs with ON DELETE CASCADE for org/agent, SET NULL not needed), plus `ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "trust_stats" jsonb;` and two indexes: `eval_runs (subject_kind, subject_id, created_at DESC)` and `agent_improve_proposals (agent_id, status)`.
- [ ] Append the journal entry (idx 37). Run the repo's journal drift check.
- [ ] Run spec → PASS. `npx tsc --noEmit` → clean.
- [ ] Commit: `feat(evals): migration 0060 — eval_runs + improve proposals + listings trust_stats (additive)`

### Task 2: Run persistence — pure summarizer + eval-runs store

**Files:**
- Create: `packages/crm/src/lib/agents/evals/eval-runs-store.ts`
- Test: `packages/crm/tests/unit/evals/eval-runs-store.spec.ts`

**Interfaces:**
- Consumes: `RunAgentEvalsResult { results, summary: { passed, total, passRate } }` (run-agent-evals.ts:173), `NewEvalRun` (T1).
- Produces:
```ts
export function summarizeRunForPersistence(input: {
  orgId: string; subjectKind: "agent" | "template"; subjectId: string;
  kind: "manual" | "improve_baseline" | "improve_candidate" | "publish_gate";
  result: RunAgentEvalsResult; graderModel: string | null; blueprintVersion: number | null;
}): NewEvalRun;   // PURE: passRate → rounded 0-100 int; resultsSummary = results.map({scenarioId,title,passed,failedChecks:names only}); NO transcript fields
export async function recordEvalRun(row: NewEvalRun): Promise<{ id: string }>;
export async function getLatestEvalRun(args: { orgId: string; subjectKind: string; subjectId: string }): Promise<EvalRun | null>;
export async function listEvalRunsForSubject(args: { orgId: string; subjectKind: string; subjectId: string; limit?: number }): Promise<EvalRun[]>;
```

**Steps:**
- [ ] TDD `summarizeRunForPersistence` (pure): passRate 0.875→88; empty run → passRate 0/scenarioCount 0; a result carrying any `transcript`/`turns` key on its objects is NOT copied into resultsSummary (assert absent); failedChecks carries check NAMES only.
- [ ] Implement pure fn; db fns are thin org-scoped Drizzle wrappers (every WHERE includes orgId).
- [ ] Specs PASS → tsc → commit: `feat(evals): eval_runs store + pure run summarizer (TDD)`

### Task 3: Wire persistence into the existing eval action + read surfaces

**Files:**
- Modify: `packages/crm/src/lib/agent-templates/eval-actions.ts` (persist after run: `subjectKind:'template'`, `kind:'manual'`; then `db.update(agentTemplates).set({ evalScore: row.passRate })` org-scoped)
- Modify: `packages/crm/src/app/api/v1/workspace-state/route.ts` (each agent gains `last_eval_run: { pass_rate, at } | null` via `getLatestEvalRun` subjectKind 'agent' — cheap: batch by agent ids, fail-soft null)
- Test: `packages/crm/tests/unit/evals/eval-persist-wiring.spec.ts`

**Interfaces:** Consumes T2 exports; changes NO existing return shapes (additive fields only).

**Steps:**
- [ ] Extract the persistable core of `runAgentEvalsAction` result-handling into a small exported pure helper if needed for testability; spec asserts: given a fake run result, the action-layer helper produces one `recordEvalRun` call + one evalScore update value (DI fakes — no Postgres).
- [ ] Wire both call sites; failures to persist are logged + swallowed (an eval run must never fail because persistence hiccuped).
- [ ] Specs PASS → tsc → use-server check (eval-actions is "use server": only async exports) → commit: `feat(evals): persist runs + revive agent_templates.evalScore + workspace-state signal`

### Task 4: improve lib — conversation sourcing

**Files:**
- Create: `packages/crm/src/lib/agents/improve/source-conversations.ts`
- Test: `packages/crm/tests/unit/improve/source-conversations.spec.ts`

**Interfaces (Produces):**
```ts
export type ConversationSample = {
  conversationId: string; outcome: "booked" | "message" | "abandoned" | "other";
  hadCriticalValidatorFailure: boolean; failedValidatorNames: string[];
  turns: Array<{ role: "user" | "assistant"; content: string }>;
};
export function planConversationSample(args: {           // PURE
  candidates: Array<Pick<ConversationSample, "conversationId" | "outcome" | "hadCriticalValidatorFailure">>;
  sampleSize: number;
}): string[];  // ids: ALL validator-failed first (newest-first), then round-robin across outcome buckets to sampleSize
export async function loadRealConversationsForAgent(args: { agentId: string; orgId: string; limit: number }): Promise<ConversationSample[]>;
```
- `loadRealConversationsForAgent`: newest `agentConversations` WHERE org+agent, `status != 'test'`, `channelMeta->>'eval_run' IS DISTINCT FROM 'true'`, `channelMeta->>'replay_of' IS NULL`; joins `agentTurns` (role/content + `validatorsPassed` → failure flags); outcome derived: any tool call `book_appointment` succeeded → booked; `take_message` → message; else turnCount ≤ 2 → abandoned; else other.

**Steps:**
- [ ] TDD `planConversationSample`: validator-failed always included first; stratification round-robins buckets; sampleSize respected; short-supply returns all.
- [ ] Implement; db loader follows the tail_conversations exclusion filters verbatim (src/app/api/v1/agents/route.ts:410 shows the exact SQL conditions — copy them).
- [ ] Specs PASS → tsc → commit: `feat(improve): real-conversation sourcing + stratified sampling (TDD)`

### Task 5: improve lib — conversation → EvalScenario

**Files:**
- Create: `packages/crm/src/lib/agents/improve/convo-to-scenario.ts`
- Test: `packages/crm/tests/unit/improve/convo-to-scenario.spec.ts`

**Interfaces:**
- Consumes: `ConversationSample` (T4), `EvalScenario { id,title,persona,opening,successCriteria,mustDo,mustNotDo }` (eval-types.ts:35).
- Produces:
```ts
export function scenarioFromValidatorFailure(sample: ConversationSample): EvalScenario | null; // PURE — null unless hadCriticalValidatorFailure
export function makeLlmConvoScenarioConverter(deps: { getClient: GetClient }): (sample: ConversationSample) => Promise<EvalScenario | null>; // fail-soft null
```
- Deterministic branch: id `real-<conversationId>`, opening = first user turn, `mustNotDo` = the failed validator names mapped to plain-English prohibitions (fixed map for the 6 validators in validators.ts:366), successCriteria = ["Completes the customer's request without repeating the original failure"].
- LLM branch: prompt + JSON-parse conventions copied from `generate-scenarios.ts` (same parse/fail-soft posture); derives goal/persona from the transcript; NEVER copies customer PII into the scenario (prompt instructs: replace names/phones/emails with placeholders; a post-parse regex strips remaining email/phone patterns).

**Steps:**
- [ ] TDD deterministic branch (3 cases: critical failure → scenario with mustNotDo naming the validator; no failure → null; PII in opening turn is passed through opening ONLY — assert successCriteria/mustNotDo contain none).
- [ ] TDD the post-parse PII scrub as its own exported pure `scrubScenarioPii(s: EvalScenario)` (email + E.164/US phone regexes → "<redacted>").
- [ ] Implement both; LLM converter unit-tested with a fake client returning canned JSON.
- [ ] Specs PASS → tsc → commit: `feat(improve): convo→scenario (deterministic validator branch + LLM branch + PII scrub)`

### Task 6: improve lib — failure clustering

**Files:**
- Create: `packages/crm/src/lib/agents/improve/cluster-failures.ts`
- Test: `packages/crm/tests/unit/improve/cluster-failures.spec.ts`

**Interfaces:**
```ts
export const FAILURE_MODES = ["booking_flow","hallucinated_state","pricing","missing_knowledge","tone","tool_misuse","other"] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];
export type FailureCluster = { mode: FailureMode; count: number; exampleScenarioIds: string[]; evidence: string[] }; // evidence strings ≤200 chars
export function bucketByValidator(failed: Array<{ scenarioId: string; failedChecks: string[] }>): { bucketed: FailureCluster[]; remainder: string[] }; // PURE: quotesOnlyFromSoulPricing→pricing, noHallucinatedStateChange→hallucinated_state, else remainder
export function makeLlmFailureClusterer(deps: { getClient: GetClient }): (args: { failed: Array<{ scenarioId: string; title: string; failedChecks: string[] }> }) => Promise<FailureCluster[]>; // labels remainder into FAILURE_MODES; fail-soft → single "other" cluster
```
(Check the spec's research addendum before implementing — the taxonomy may gain/rename modes; the type stays a const array so it's a one-line change.)

**Steps:**
- [ ] TDD `bucketByValidator` (mapping table + remainder pass-through + evidence truncation to 200 chars).
- [ ] Implement both; LLM clusterer uses the grader model (`makeLlmEvalGrader`'s model resolution pattern), fake-client tested, rejects out-of-taxonomy labels → "other".
- [ ] Specs PASS → tsc → commit: `feat(improve): failure clustering — validator buckets + LLM labeling (TDD)`

### Task 7: improve lib — patch proposer + guardrails

**Files:**
- Create: `packages/crm/src/lib/agents/improve/propose-patch.ts`
- Test: `packages/crm/tests/unit/improve/propose-patch.spec.ts`

**Interfaces:**
```ts
export type PatchValidation = { ok: true; patch: Partial<AgentBlueprint> } | { ok: false; reason: string };
export function validateProposedPatch(args: { patch: unknown; currentBlueprint: AgentBlueprint; maxBytes: number }): PatchValidation;
export function makeLlmPatchProposer(deps: { getClient: GetClient }): (args: { blueprint: AgentBlueprint; clusters: FailureCluster[]; lessons: string[] }) => Promise<{ patch: Partial<AgentBlueprint>; rationale: string } | null>;
```
Guardrail rules (PURE, field-name-agnostic so blueprint evolution can't rot it): patch keys must be a SUBSET of `Object.keys(currentBlueprint)` (no new top-level keys); `connectors` and `trigger` keys are ALWAYS rejected; `JSON.stringify(patch).length <= maxBytes`; non-object/array/null patch → reject.

**Steps:**
- [ ] TDD `validateProposedPatch`: subset rule, connectors/trigger rejection, size cap, junk-input rejection, happy path returns the typed patch.
- [ ] Implement; proposer prompt receives clusters + Brain lessons and is instructed to output the MINIMAL JSON patch; parse fail-soft → null.
- [ ] Specs PASS → tsc → commit: `feat(improve): patch proposer + pure guardrails (deny connectors/trigger, subset-only, size-capped)`

### Task 8: improve lib — the run orchestrator

**Files:**
- Create: `packages/crm/src/lib/agents/improve/improve-run.ts`
- Test: `packages/crm/tests/unit/improve/improve-run.spec.ts`

**Interfaces:**
- Consumes: everything T4–T7 + `runDeployedAgentEvals` (run-deployed-agent-evals.ts:250 — `{agentId,orgId}, deps` → `{ok:true}&RunAgentEvalsResult | {ok:false,guard}`) + T2 persistence.
- Produces:
```ts
export type ImproveRunDeps = {
  loadConversations: typeof loadRealConversationsForAgent;
  toScenario: (s: ConversationSample) => Promise<EvalScenario | null>;   // deterministic-first composition done by caller assembly
  runEvals: (args: { agentId: string; orgId: string; scenarios: EvalScenario[]; shadowBlueprint?: AgentBlueprint }) => Promise<{ ok: true; result: RunAgentEvalsResult } | { ok: false; guard: string }>;
  clusterFailures: (args: { failed: Array<{ scenarioId: string; title: string; failedChecks: string[] }> }) => Promise<FailureCluster[]>;
  proposePatch: (args: { blueprint: AgentBlueprint; clusters: FailureCluster[]; lessons: string[] }) => Promise<{ patch: Partial<AgentBlueprint>; rationale: string } | null>;
  loadAgent: (args: { agentId: string; orgId: string }) => Promise<{ blueprint: AgentBlueprint; currentVersion: number } | null>;
  loadLessons: (agentId: string) => Promise<string[]>;
  persistRun: (row: NewEvalRun) => Promise<{ id: string }>;
  persistProposal: (row: Omit<typeof agentImproveProposals.$inferInsert, "id" | "createdAt">) => Promise<{ id: string }>;
  env: { sampleSize: number; maxScenarios: number; patchMaxBytes: number };
};
export type ImproveRunResult =
  | { ok: true; proposalId: string | null; baseline: { passRate: number; total: number }; candidate: { passRate: number; total: number } | null;
      /** Research addendum §1: per-scenario flips between baseline and candidate on the IDENTICAL scenario set (paired differences — arxiv 2411.00640). null when no candidate ran. */
      paired: { improved: number; regressed: number; unchanged: number; criticalRegressed: boolean } | null;
      /** Research addendum §2 small-N honesty: "better" ONLY when improved-regressed >= 3 AND !criticalRegressed; else "inconclusive". */
      verdict: "better" | "inconclusive" | "worse" | null;
      clusters: FailureCluster[]; note?: string }
  | { ok: false; reason: "agent_not_found" | "no_conversations" | "no_scenarios" | string };
export async function runImproveForAgent(args: { agentId: string; orgId: string }, deps: ImproveRunDeps): Promise<ImproveRunResult>;
```
- Flow: load agent → source (env.sampleSize) → scenarios (deterministic first, LLM for the rest, cap env.maxScenarios; 0 scenarios → guard out) → BASELINE runEvals → persist baseline run (`improve_baseline`, blueprintVersion=currentVersion) → cluster failed → baseline perfect (passRate === 1) → return ok with note "nothing to improve", NO proposal → proposePatch → validateProposedPatch → CANDIDATE runEvals with `shadowBlueprint` = `{...blueprint, ...patch}` → persist candidate run (`improve_candidate`) → persist proposal (status proposed) → return. Every stage try/caught to a typed reason; NOTHING is ever applied here.
- The real-deps assembly (T9) implements `runEvals` by calling `runDeployedAgentEvals` with a `loadAgent` dep that returns the shadow blueprint when provided — the runner itself is untouched.

**Steps:**
- [ ] TDD with full fakes (the big spec, ~12 cases): happy path persists 2 runs + 1 proposal with correct kinds/versions; perfect baseline → no proposal, note set; proposer null → ok with proposalId null + note; guardrail rejection → same; runEvals guard (`agent_has_connectors_unsafe`) → ok:false with that reason; no conversations → `no_conversations`; scenario cap enforced; deterministic scenarios precede LLM ones; persistence failure → ok:false not throw; candidate never runs when patch invalid; PAIRED: per-scenario flip counts computed by scenario id across the two runs (2 improved 1 regressed 5 unchanged fixture) and `verdict` follows the honesty rule (net<3 → "inconclusive"; any critical-validator scenario regressing → never "better"; net<=-3 → "worse").
- [ ] Implement.
- [ ] Specs PASS → tsc → commit: `feat(improve): DI orchestrator — baseline/shadow-candidate replay + propose-only persistence (TDD)`

### Task 9: server actions — run / apply / dismiss + real deps assembly

**Files:**
- Create: `packages/crm/src/lib/agents/improve/actions.ts` ("use server")
- Create: `packages/crm/src/lib/agents/improve/deps.ts` (NOT "use server" — the assembly)
- Test: `packages/crm/tests/unit/improve/apply-proposal.spec.ts`

**Interfaces:**
- `deps.ts` exports `buildImproveDeps({ orgId, agentId })` → `ImproveRunDeps`: BYOK gate + `getClient` exactly per eval-actions.ts; `runEvals` wraps `runDeployedAgentEvals` assembling its `DeployedEvalDeps` the same way run-deployed-agent-evals' existing production caller does, EXCEPT `loadAgent` returns `{ ...agent, blueprint: shadowBlueprint ?? agent.blueprint }`; scenarios injected via its generator seam (pass-through generator returning our scenario list).
- `actions.ts` exports (all org-scoped via the session org helper the sibling actions use):
```ts
export async function runImproveAction(agentId: string): Promise<ImproveRunResult | { ok: false; reason: string }>;
export async function applyImproveProposalAction(proposalId: string): Promise<{ ok: true; version: number } | { ok: false; error: string }>;
export async function dismissImproveProposalAction(proposalId: string): Promise<{ ok: boolean }>;
```
- Apply: load proposal WHERE id+orgId+status='proposed' → re-run `validateProposedPatch` against the CURRENT blueprint (it may have moved since proposal) → `updateAgentBlueprint({ agentId, orgId, patch, publishNotes: "improve run <proposalId>" })` → set status applied + resolvedAt. Version drift (basedOnVersion ≠ currentVersion) does NOT block but is recorded in the return as `note: "applied over vN"`.

**Steps:**
- [ ] TDD apply/dismiss over DI fakes: wrong org → not found; status applied → rejected; re-validation failure → rejected without calling updateAgentBlueprint; happy path calls it with publishNotes and marks applied; dismiss only flips status.
- [ ] Implement actions + deps assembly.
- [ ] Specs PASS → tsc → `pnpm check:use-server` (actions.ts exports only async fns) → commit: `feat(improve): run/apply/dismiss server actions + real deps assembly (propose-only enforced)`

### Task 10: bearer API routes — /api/v1/build/improve (+ /apply)

**Files:**
- Create: `packages/crm/src/app/api/v1/build/improve/route.ts`
- Create: `packages/crm/src/app/api/v1/build/improve/apply/route.ts`
- Test: `packages/crm/tests/unit/improve/improve-route-auth.spec.ts` (if the deploy route has a wire-level spec pattern, mirror it; otherwise auth-guard unit over extracted handler)

**Interfaces:** POST `{ agent_id }` / `{ proposal_id }`; auth + org resolution copied VERBATIM from `packages/crm/src/app/api/v1/build/deploy/route.ts` (wst bearer → org). `export const maxDuration = 300;` on the improve route (two replay passes). Responses: the `ImproveRunResult` / apply result as JSON, 401 without valid bearer, 400 on missing ids.

**Steps:**
- [ ] Mirror the deploy route's guard + body parsing; call `runImproveForAgent(args, buildImproveDeps(...))` / apply action's core (routes use the org from the BEARER, not the session — factor the action cores so both surfaces share them without "use server" conflicts).
- [ ] Spec: 401 no/garbage bearer; 400 missing agent_id (with a fake-resolved org). PASS → tsc → use-server → commit: `feat(build): improve + apply bearer routes (deploy-route auth parity, maxDuration 300)`

### Task 11: MCP tools — improve_agent + apply_improvement (v1.59.0)

**Files:**
- Modify: `skills/mcp-server/src/tools.js` (2 new tools calling the T10 routes via the existing `api()` helper with the stored workspace bearer)
- Modify: `skills/mcp-server/src/welcome.js` (verb ladder line: build → test → deploy → sell → **improve**; 3-sentence tool guidance in the tools glossary)
- Modify: `skills/mcp-server/package.json` (1.58.1 → 1.59.0)

**Steps:**
- [ ] `improve_agent({ agent_id })` description: "Replays the agent's recent REAL conversations as graded evals, clusters failures, and PROPOSES a blueprint patch with before/after scores. NEVER applies anything — review the proposal, then call apply_improvement." `apply_improvement({ proposal_id })` description mirrors propose-only.
- [ ] `node --check` both files. Commit: `feat(mcp): v1.59.0 — improve_agent + apply_improvement (propose-only pair)`
- [ ] (Wave end: Max publishes ONCE.)

### Task 12: Studio — Improve panel on /studio/agents/[id]

**Files:**
- Create: `packages/crm/src/app/(dashboard)/studio/agents/[id]/improve-panel.tsx` (client island, pattern-matched to `run-evals.tsx`)
- Create: `packages/crm/src/lib/agents/improve/diff-blueprint.ts` (+ test `tests/unit/improve/diff-blueprint.spec.ts`)
- Modify: the agent detail page to render the panel + list proposals

**Interfaces:** `diffBlueprintFields(before: AgentBlueprint, after: Partial<AgentBlueprint>): Array<{ field: string; before: string; after: string }>` — PURE, string-serializes values, only fields present in the patch.

**Steps:**
- [ ] TDD `diffBlueprintFields` (changed field, unchanged omitted, array field serialization).
- [ ] Panel: "Improve" button → `runImproveAction` → renders clusters (mode + count + evidence), the PAIRED flip counts ("3 scenarios improved · 1 regressed · 20 unchanged") with the verdict chip — "better" green ONLY per the honesty rule; "inconclusive" renders as neutral with the literal copy "Small sample — apply on judgment, not on the score." — then field diff, Apply / Dismiss wired to T9. Loading + error states per run-evals.tsx conventions. Never render an aggregate percentage as the headline (small-N honesty).
- [ ] tsc → use-server → commit: `feat(studio): improve panel — clusters, score delta, field diff, apply/dismiss`

### Task 13: trust_stats copy-through + buyer badge

**Files:**
- Create: `packages/crm/src/lib/marketplace/trust-stats.ts` (+ test `tests/unit/marketplace/trust-stats.spec.ts`)
- Modify: the seller publish/edit action (`src/lib/marketplace/` listing publish path) — after publish/refresh of a `kind:'agent'` listing, copy-through
- Modify: `packages/crm/src/lib/marketplace/load-storefront.ts` (surface `trustStats` on `StorefrontAgent`)
- Modify: `packages/crm/src/app/(public)/marketplace/[slug]/page.tsx` (badge block)

**Interfaces:**
```ts
export function buildTrustStats(args: { latest: EvalRun | null; runsCount: number }): ListingTrustStats | null; // PURE — null when no runs (never fake a badge)
```
Copy-through: on publish, `getLatestEvalRun({ subjectKind:'template', subjectId })` + count → `buildTrustStats` → update the listing row's `trust_stats`. Badge renders ONLY when `trustStats` present: "Platform-verified evals · {evalPassRate}% across {scenarioCount} scenarios · last run {date}" styled like the existing credibility block (inline-style page — match its tokens).

**Steps:**
- [ ] TDD `buildTrustStats` (null on no runs; correct mapping; improveAcceptRate stays null).
- [ ] Wire copy-through (fail-soft: a trust-stats failure never blocks publishing) + storefront field + badge.
- [ ] Specs PASS → tsc → use-server → commit: `feat(marketplace): platform-verified eval badge — trust_stats copy-through (never fake, fail-soft)`

### Task 14: Final verify + wave merge

**Steps:**
- [ ] Full gate in packages/crm: `node --import tsx --test tests/unit/evals/ tests/unit/improve/ tests/unit/marketplace/trust-stats.spec.ts` + the marketplace + chatgpt-app suites (regression: listing schema changed) → `npx tsc --noEmit` → `pnpm check:use-server`.
- [ ] `scripts/review-package <BASE> HEAD` → final whole-branch review (opus, fresh context) — this wave touches a migration + money-adjacent marketplace surface.
- [ ] Fast-forward push to main per the one-wave protocol (fetch, verify base, `git push origin HEAD:main`). Post-deploy: journal applied (migration count), `improve` route 401 curl, one live Studio improve run on a Seldon Studio agent.
- [ ] Max queue (ONE batch): publish @seldonframe/mcp 1.59.0.
