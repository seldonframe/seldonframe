# Bet 1 — The Learning Loop (cross-tenant compiler learning + per-agent improvement)

**Date:** 2026-07-11 · **Status:** spec (Max approved the bet + the cross-tenant expansion 2026-07-11; build after lifecycle slice + Bet 3) · **Strategy:** docs/strategy/2026-07-11-hermes-agent-inspiration.md · **Prime directive:** *the 1000th record→agent creation is better than the 1st.*

## 0. Shape

Two layers, strictly separated by data boundary:

- **Layer A — platform learning (cross-tenant):** the record→agent COMPILER improves from every compile everywhere. Crosses org lines, therefore consumes ONLY derived correction taxonomy — never raw recordings, transcripts, or customer content.
- **Layer B — agent learning (per-tenant):** each deployed agent improves from its OWN conversations. Org-scoped end to end, eval-gated, operator-approved. (The Hermes "skills from experience" loop, SF-shaped.)

## 1. Verified seams (scout recon 2026-07-11)

| Seam | Location | Fact |
|---|---|---|
| Compiler prompts | `lib/recordings/trace-compiler.ts` | `ROUTE_SYSTEM_PROMPT` (~L19) + `EXTRACT_SYSTEM_PROMPT` (~L25) module constants; user-content builders already accept `priorAnswers?: string[]` (~L62) + a VALIDATION_ERROR retry loop (~L135) — the lesson-corpus injection point. No prompt versioning yet. |
| Cross-org store | `db/schema/brain-notes.ts:50–106` | `brainNotes` has `scope: "workspace"\|"global"` with `orgId NULL` for global; unique `(path)` index for global scope; Bayesian confidence `(wins+1)/(uses+2)`; metadata `type/tags/source/vertical`. **The platform-lessons store already exists.** |
| Correction signals today | `db/schema/recordings.ts:38–56` | `openQuestions`, `interviewLog`, `flowModel`, `answeredQuestions` (lifecycle Wave 1) persisted. NOT captured: inferred-vs-edited trigger trail, merge diffs, tool-binding corrections. |
| Distillation pattern | `.claude/skills/dream/` + `docs/superpowers/specs/2026-07-06-dream-loop-design.md` | mine → cluster (haiku) → classify root cause → propose staged diff w/ HUMAN gate → measure pass-rate delta. Reuse the shape wholesale. |
| Regression net | `.claude/skills/generate-and-grade/` (main) | grade harness for generator changes; recorded traces become frozen fixtures for compiler changes. |
| Telemetry fence | `lib/analytics/llm-capture.ts` | PostHog `$ai_generation` captures tokens/latency/surface/org — NO prompt bodies (privacy fence to preserve). |

## 2. Layer A — compiler learning

### A1. Signal capture (additive, ships first)
New table `compiler_signals` (org_id kept for provenance/deletion; **content is taxonomy, not text**):
`id, org_id, session_id, template_id, kind, payload jsonb, created_at`, where `kind ∈ {trigger_corrected, binding_corrected, interview_correction, question_asked, eval_first_run, compile_outcome}` and payload is enum/structured fields only, e.g. `{from: "inbound-email", to: "schedule"}`, `{app: "gmail", boundTool: "POSTIZ_...", correctedTool: "GMAIL_..."}`, `{questionCategory: "missing-recipient"}`. Free-text fields pass a tested scrubber (emails/phones/names/URLs stripped; max 120 chars normalized phrase) before write.
Emitters:
- Compile: store `inferredTrigger` + inferred bindings ON the template row (additive columns or blueprint metadata) so later edits can diff.
- Template editor save: diff trigger/bindings vs inferred → emit `trigger_corrected`/`binding_corrected`.
- Interview/continue-interview: emit `interview_correction` with a field-level delta taxonomy (which FlowModel fields changed: steps added/edge fixed/variable added) — computed by structural diff, no content.
- Eval runs: `eval_first_run` with passRate.

### A2. Lessons corpus + injection
- Aggregation job distills signals → global brain notes: `scope='global', path='record-compiler/<taxonomy-key>.md'`, `source='compiler-signal'`, confidence via the existing Bayesian fields (use = injected into a compile; win = that compile needed fewer corrections).
- `buildRouteUserContent`/`buildExtractUserContent` gain `compilerLessons?: string[]` — top-N global lessons ranked by confidence × tag match (app/vertical), hard token cap (~1,500). Prompt gets a version stamp (`COMPILER_PROMPT_VERSION` const) logged per compile so lesson efficacy is attributable.

### A3. The gate — frozen trace regression set (maker ≠ checker)
- `packages/crm/fixtures/compiler-regression/` — recorded WorkflowTraces + expected FlowModel structural properties (start: Max's Gmail-forwarding trace + synthetic per-archetype traces). A compiler change (prompt, lesson corpus revision, heuristic table) must compile ALL fixtures with structural assertions green (step count ranges, trigger kind, binding apps — assert PROPERTIES, not full-hash; L-26 canonical structural-hash where exact match is wanted).
- Lesson-corpus updates are BATCHED revisions (weekly), each gated by the regression run + the dream-style human-approval doc. No continuous silent prompt drift.

### A4. Distillation loop (dream pattern, weekly)
Scheduled job (reuse cron rail): mine last week's `compiler_signals` → cluster by kind+taxonomy → propose (a) lesson-note revisions (auto-appliable after regression gate), (b) heuristic-table code changes (keyword lists à la inbox-watch — PR via the build loop, human-merged), (c) new open-question categories. Output = staged proposal doc + measured delta the following week (corrections-per-compile KPI).

### A5. Privacy posture (Max sign-off needed on wording, not architecture)
Cross-tenant learning consumes: correction taxonomies, structural deltas, app/toolkit names, scrubbed ≤120-char phrases. Never: recordings, keyframes, transcripts, customer PII, FlowModel content verbatim. Org deletion cascades `compiler_signals`. ToS/privacy-page line required before flag-on: "SeldonFrame improves its agent compiler from anonymized correction patterns." Flag: `SF_COMPILER_LEARNING` strict-"1".

## 3. Layer B — per-agent learning (org-scoped)

- **Mine (per agent, weekly via cron rail):** own `agentTurns` validator failures, escalations, guardrail trips, repeated unanswered questions, reflection events. Org-scoped queries only.
- **Propose:** `agent_improvement_proposals` table (org-scoped): `{agentId, kind: skill_diff|faq_add|guardrail_add, diff, evidence (own-convo refs), status}`. Generation prompt sees ONLY that org's data + GLOBAL lessons (global→tenant flow is fine; tenant→tenant never).
- **Eval-gate:** run the agent's eval set with the proposal applied in shadow → attach pass-rate delta. Regressing proposals are auto-discarded (logged).
- **Approve:** Agent Home Learned stage card — "Seldon learned N things this week" — diff + evidence + eval delta, one-click approve = apply + version bump (rollback-able). Agency bulk-approve view later.
- Never-lies: a proposal card claims only what the eval delta shows; applying re-runs evals and shows the read-back.

## 4. KPIs (the loop must prove itself)
- **Layer A:** corrections-per-compile (trigger edits + binding edits + interview merges before first deploy) — trending DOWN across cohorts = the 1000th compile is measurably better. Baseline captured from day one of A1.
- **Layer B:** eval pass rate + validator failure rate per agent, pre/post approved proposals; % proposals approved.

## 5. Build phases
1. **A1 signals + inferred-trigger/bindings persistence** (small; can ride any record follow-up slice) — starts the data flywheel immediately, everything else feeds on it.
2. **A3 frozen regression fixtures** (small; prerequisite for touching prompts).
3. **A2 corpus + injection + version stamp** (medium).
4. **A4 weekly distillation** (medium; reuses dream + cron).
5. **B mine→propose→gate→approve** (the flagship surface; medium-large; lands on the lifecycle Learned stage).

## 6. Non-goals
Fine-tuning/model training on tenant data (out; this is context-layer learning only) · auto-apply without eval gate · tenant→tenant content sharing · real-time (per-compile) prompt mutation — batched weekly revisions only.
