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

## Research addendum (wf_542c3413-bc8 — 22 adversarially-verified claims, 2026-07-03)

**Design validated by primary sources:**
- The loop shape is the documented industry pattern: LangSmith's production
  workflow is literally "add failing production traces to your dataset, create
  targeted evaluators, validate fixes with offline experiments, redeploy"
  (docs.langchain.com/langsmith/evaluation). Langfuse prescribes the same
  failure-driven sampling.
- Sizing: Anthropic — "20-50 simple tasks drawn from real failures is a great
  start"; LangSmith — 10–20 curated examples. Our sample 50 / max 24 scenarios
  is right-sized (anthropic.com/engineering/demystifying-evals-for-ai-agents).
- Signal-driven sampling (validator-failed + negative signals first, never
  random) matches LangSmith's negative-feedback/errors/LLM-flagged guidance.
  ADDITION: `agentConversations.operatorQuality` negative marks are a
  second-priority sampling signal after validator failures.
- Deterministic-over-judge: Anthropic explicitly ("deterministic graders where
  possible, LLM graders where necessary… closely calibrated with human
  experts"). Naked judges fail objective grading 70% of the time; REFERENCE-
  GUIDED judging cuts that to 15% (MT-Bench, arxiv 2306.05685) — our grader is
  already criteria-anchored; keep pricing/state checks deterministic, always.
- Propose-only + human gate mirrors LangSmith's annotation-queue norm (a human
  sits between production traces and the suite).

**Parameter changes adopted:**
1. **Paired-differences scoring** (arxiv 2411.00640): before/after runs replay
   the SAME scenario set, so report per-scenario flips
   (`paired { improved, regressed, unchanged }`) — a "free" variance reduction
   vs comparing aggregate rates.
2. **Small-N honesty rule:** a 3pp delta needs ~969 questions at 80% power; at
   N≈24 only large effects are real. Display rule: the candidate is called
   "better" ONLY if net flips ≥ 3 AND no critical-validator scenario regressed;
   otherwise "inconclusive — apply on judgment, not on the score."
3. **Cheap-grader verbosity guard** (arxiv 2306.05685: cheap judges are fooled
   by padded answers 91.3% vs 8.7% for frontier): the grader rubric must state
   "longer is not better; judge ONLY against the listed criteria; padding and
   repetition are not evidence of success." Verify score-llm.ts's prompt has
   an equivalent line; add it if absent (one-line, guarded by its existing
   specs).
4. Independent-grader posture (self-preference bias, arxiv 2404.13076) is
   directionally satisfied (Haiku ≠ generator model) but same-family; ACCEPTED
   RISK v1, with human calibration of the grader against operator labels
   queued as an improve-v2 item.

**Explicitly rejected for our stage (evidence-backed):**
- Pairwise judging instead of rubric scoring — the pairwise-beats-rubric claim
  was REFUTED 0-3 in verification; keep absolute criteria-anchored scoring +
  paired flips.
- Embedding+k-means clustering machinery (Clio-scale, 94% reconstruction at
  ~20k transcripts) — at ≤24 failures/run, deterministic validator buckets +
  direct LLM labels win; revisit only at fleet scale.
- Auto-apply of patches at any threshold — no source supports it; every
  documented loop keeps a human gate.
- Large synthetic suites — small, curated, real-failure sets are the
  documented best practice at this stage.
- Significance claims on small-N score deltas (see honesty rule).

Taxonomy note: our 7 symptom/domain modes stay (more patch-actionable for SMB
agents than MAST's 14 system modes or AgentErrorTaxonomy's 5 module modes —
both noted as v2 candidates once volume justifies finer granularity).
Marketplace-trust evidence came back thin (that research angle produced no
surviving claims) — the badge design stands on first-principles anti-gaming:
platform-computed only, never self-reported, absent > faked.
