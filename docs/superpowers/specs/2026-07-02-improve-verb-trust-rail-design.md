# Improve Verb + Trust Rail — Design

**Date:** 2026-07-02 · **Status:** approved decisions locked (Max), research addendum pending (deep-research run wf_542c3413-bc8)

## Goal

Ship the 5th verb of the builder ladder — **improve** — and the trust rail it
feeds. `improve(agent)` pulls the agent's recent REAL conversations, replays
them as graded eval scenarios against the current blueprint AND a proposed
patch, clusters the failures, and hands the human a diff with before/after
scores. Scores persist and surface as marketplace-legible trust.

Reliability = marketplace-legible TRUST, not a better LangSmith. The improve
verb's telemetry is the ranking signal everything downstream consumes
(find_blocks, primitives economy, listing badges).

## Locked decisions (Max, 2026-07-02)

1. **Target:** v1 runs on a workspace `agents` row using ONLY that org's own
   conversations. No cross-deployment pooling (tenant contamination).
   Template/marketplace rollup is a read-side denormalization, not pooling.
2. **Trust rail: full.** One additive migration: run-level score persistence,
   `agent_templates.evalScore` finally written, a listings trust column, and
   a buyer-visible badge.
3. **Surfaces: all three.** Studio button + `improve_agent` MCP tool +
   `POST /api/v1/build/improve` — completes build → test → deploy → sell →
   **improve** in one release.
4. **Propose-only, always.** A patch NEVER auto-applies. Apply is an explicit
   human action that creates a new `agent_versions` snapshot.

## What already exists (scout brief, 2026-07-02 — build ON these, duplicate nothing)

- `src/lib/agents/evals/` — LLM customer sim (`sim-llm.ts`), **independent
  cheap grader** (`score-llm.ts`, default `claude-haiku-4-5`, env
  `ANTHROPIC_EVAL_MODEL`), deterministic floor (`score-deterministic.ts`),
  scenario generation from a blueprint (`generate-scenarios.ts`), money-safe
  replay through the REAL `executeTurn` with a connector safety gate
  (`run-deployed-agent-evals.ts`), failures→Brain lessons (`eval-lessons.ts`).
- Conversations: `agentConversations` + `agentTurns` (full tool calls, per-turn
  `validatorsPassed`, cost/latency). Eval/replay runs excluded from tails via
  `channelMeta->>'eval_run'`.
- Versioning: `updateAgentBlueprint` writes a FULL blueprint snapshot per
  version to `agent_versions` — v(n) vs v(n+1) diffable today.
- Dead ends to revive: `agent_templates.evalScore` exists, never written;
  `runAgentEvalsAction` results are ephemeral (no persistence).

## Architecture

New lib `src/lib/agents/improve/` — pure logic + DI deps, mirroring `evals/`.

### 1. `source-conversations.ts` (pure planning + DI reads)
Pull last N (default **50**, env `SF_IMPROVE_SAMPLE_SIZE`) REAL conversations
for the agent: exclude `status:'test'` and `channelMeta.eval_run/replay_of`;
stratify — conversations containing a failed critical validator turn are
always included first, then by outcome mix (booked / message-taken /
abandoned). Output `ConversationSample[]` (ids + transcripts + outcome tags).
PII: raw transcripts are read for scenario derivation but NEVER persisted into
eval artifacts (see Persistence).

### 2. `convo-to-scenario.ts` (LLM, builder's key)
Convert a sample into an `EvalScenario` (existing type): customer goal,
opening message, `successCriteria` derived from what SHOULD have happened.
Deterministic shortcut: a conversation whose turn failed a critical validator
becomes a scenario carrying that validator as an explicit check — no LLM
needed for those.

### 3. `cluster-failures.ts` (LLM-labeled, grader model)
Group failed scenarios into failure modes. Seed taxonomy (research addendum
may refine): `booking_flow`, `hallucinated_state`, `pricing`,
`missing_knowledge`, `tone`, `tool_misuse`, `other`. Output
`FailureCluster[] { mode, count, exampleScenarioIds, evidence }`.

### 4. `propose-patch.ts` (LLM, builder's key)
Blueprint + top clusters + existing Brain lessons → a MINIMAL blueprint patch
(same shallow-merge shape `updateAgentBlueprint` accepts) + per-cluster
rationale. Guardrails: may not touch `connectors`; patch confined to prompt /
faq / services / policy fields; size-capped.

### 5. `improve-run.ts` (DI orchestrator)
```
source → scenarios (converted-real + a slice of generated regression set)
→ BASELINE replay (run-deployed-agent-evals pattern, money-safe)
→ propose patch → CANDIDATE replay on a SHADOW blueprint (never persisted)
→ persist: eval_runs (baseline) + eval_runs (candidate) + one proposal row
→ return { proposal, baseline, candidate, clusters }
```
Never throws through to the caller; every stage fail-soft with a reason.

### Apply (separate, human-gated)
`applyImproveProposalAction(proposalId)` — org-scoped; calls the EXISTING
`updateAgentBlueprint` with the stored patch, `publishNotes:
"improve run <id>"` → new `agent_versions` snapshot; marks proposal
`applied`. Dismiss marks `dismissed`. Nothing else can apply a patch.

## Persistence (one additive migration)

**`eval_runs`** — run-level summaries (the missing rail):
`{ id, orgId, subjectKind: 'agent'|'template', subjectId, kind: 'manual'|
'improve_baseline'|'improve_candidate'|'publish_gate', passRate (int, %),
scenarioCount, graderModel, blueprintVersion, resultsSummary jsonb
(per-scenario pass/fail + failed checks — NO raw transcripts), createdAt }`

**`agent_improve_proposals`**:
`{ id, orgId, agentId, basedOnVersion, patch jsonb, rationale jsonb
(clusters + evidence), baselineRunId, candidateRunId, status:
'proposed'|'applied'|'dismissed', createdAt, resolvedAt }`

**`marketplace_listings.trust_stats` jsonb** (additive column):
`{ evalPassRate, scenarioCount, graderModel, lastRunAt, runsCount,
improveAcceptRate: null }` — denormalized copy-through at publish/refresh
from the source template's latest `eval_runs`; the public catalog read path
stays one query. `improveAcceptRate` stubbed null until volume exists.

**Write-throughs:** a template-subject run also updates
`agent_templates.evalScore` (reviving the dead column); an agent-subject run
surfaces via latest `eval_runs` (no new agents column).

## Surfaces

- **Studio** (`/studio/agents/[id]`): "Improve" button → run progress →
  proposals panel: blueprint field diff, cluster evidence, baseline vs
  candidate scores, Apply / Dismiss.
- **MCP** (`skills/mcp-server`): `improve_agent({ agent_id })` → runs, returns
  clusters + scores + proposal summary; `apply_improvement({ proposal_id })`.
  Two tools — the pair IS the propose-only contract.
- **API:** `POST /api/v1/build/improve { agent_id }` (wst bearer, org-scoped)
  → run + proposal; `POST /api/v1/build/improve/apply { proposal_id }`.
- **Marketplace buyer badge** (`/marketplace/[slug]`): "Platform-verified
  evals: N% across M scenarios · last run <date>" from `trust_stats`.
  Anti-gaming: ONLY platform-executed harness runs write `eval_runs`; sellers
  cannot inject scores. Absent stats → no badge (never fake).
- **`get_workspace_state`:** each agent gains `last_eval_run { passRate, at }`.

## Tenancy + money safety

org-scope on every table and read; replay reuses the existing connector
safety gate (no live side-effects); sim + grader on the builder's BYOK key
(platform fallback per existing eval-actions rules); zero Stripe surface;
propose-only means no silent behavior change on client-facing agents, ever.

## Phasing

- **P1 — persistence rails:** migration + `eval_runs` store + WIRE
  `runAgentEvalsAction` to persist (kills the ephemeral-results gap + revives
  `evalScore`) + Studio score display + `get_workspace_state` signal.
- **P2 — improve core:** `improve/` lib end-to-end with DI fakes (TDD), incl.
  clustering + patch guardrails + shadow-replay.
- **P3 — surfaces:** MCP tools + build routes + Studio panel + apply/dismiss.
- **P4 — trust:** `trust_stats` copy-through + buyer badge + publish-refresh.

Verify gate per phase: touched specs + `npx tsc --noEmit` +
`pnpm check:use-server`. MCP tool additions ride the LAST wave with one
version bump (one publish).

## Explicitly NOT in v1

Cross-deployment convo pooling · auto-apply (any threshold) · per-deployment
blueprint version pinning (needs a deployments schema addition — revisit when
an agency asks) · DSPy-style auto-optimization of prompts (improve v2) ·
listing accept-rate display (stub only) · a general observability UI (we are
not building a LangSmith).

## Research addendum (lands when wf_542c3413-bc8 completes)

Parameters research refines WITHOUT restructuring: sample size + stratification
(§1), grader bias mitigations + minimum-N for meaningful deltas (§2), final
failure taxonomy (§3), badge copy/design + anti-gaming details (§4), per-turn
telemetry attribute set (§5), any rejected-practice warnings (§6).
