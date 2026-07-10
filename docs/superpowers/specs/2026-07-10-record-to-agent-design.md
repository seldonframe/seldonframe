# Record-to-Agent — "Seldon watches you work" (design spec)

**Date:** 2026-07-10 · **Branch:** `feature/record-to-agent` (off `origin/main` @ `9234bc5f7`)
**Status:** design approved in-session by Max (concept + 10x direction); this doc grounds it in verified code seams.
**Flag:** `SF_RECORD_TO_AGENT` (strict-"1" contract, dark by default — same contract as `SF_WEB_UNGATED_BUILD`).

## 1. Goal

An ungated public page where an operator screen-records themselves doing a job (multiple
recordings = edge cases), Seldon compiles the recordings + narration + a chat interview into a
**Workflow Trace → generalized Flow Model**, recaps it for correction/approval, and — after claim —
compiles it into a real SF agent (fat skill + Composio-bound tools + eval scenarios derived from the
recordings). The recordings ARE the eval set. This is both a build surface and the flagship
"how easy is it" landing-page demo, funneling into the existing build→claim→use activation flow.

Doctrine fit: thin harness + fat BLOCK/skill (compiled `customSkillMd`), never-lies (coverage
report is honest about what the agent can/can't do; evals from ground truth), reuse-don't-rebuild
(soul-compiler pattern, /try funnel, generate pipeline, eval harness, claim flow).

## 2. Verified seams this reuses (recon 2026-07-10, claims source-checked)

| Seam | File | Reuse |
|---|---|---|
| Flag contract | `packages/crm/src/lib/web-build/policy.ts` (strict-"1", default off) | New `lib/recordings/policy.ts` mirrors it |
| Ungated funnel | `app/(public)/try/*`, `/api/v1/web/build/stream` (IP rate limit, claim_token, `WEB_UNGATED_ORIGIN`) | Same patterns for `/record`; claim CTA reuses `/signup?callbackUrl=/claim-build...` flow |
| Source→structure compiler | `lib/soul-compiler/service.ts` (`compileSoulService`: two-call route→extract, Zod-validated, `claudeApiKey` param DI) | Trace compiler mirrors this shape exactly |
| Agent output | `lib/agents/generate/agent-bundle.ts` (`AgentBundle`), `db/schema/agents.ts:67` `customSkillMd` (cap 8000 chars), `agent_templates` table (status draft/tested/published, `evalScore`) | Compile target — no new agent runtime |
| Tool binding | `lib/agents/generate/tool-catalog.ts` (`findToolsByKeywords` → `ConnectorBinding` composio/vetted) | Coverage report = trace steps × catalog match |
| Evals | `lib/agents/evals/eval-types.ts` (`EvalScenario{userMessages, successCriteria}`), `run-agent-evals.ts`, `agent_evals` table | Scenarios derived from recordings feed the existing harness |
| Blob uploads | `app/api/v1/workspace/media/upload/route.ts` (`handleUpload`, **session-only** `getOrgId()`), `VIDEO_MAX_BYTES = 50MB` (`lib/media/resolve-url.ts:47`) | Pattern only — anonymous grant path is NEW (see §5.2); existing route untouched |

**Explicitly NOT reused/touched:** SeldonChat copilot (session+workspace-bound; the interview chat
is its own lightweight endpoint), `gc-seldonchat-blobs` (recordings get their own prefix + deferred
TTL cron), `workflow_approvals` (table exists, no UI — approval-queue wiring is out of scope).

## 3. Architecture (pipeline)

```
/record (public, flag-gated)
  └─ start session ──────────► POST /api/v1/recordings/session   (IP rate-limit, bearer session token)
  └─ slot N: getDisplayMedia + mic
       ├─ keyframes (canvas, ≤1fps, ≤240 frames, ≤1280px JPEG)
       ├─ live transcript (Web Speech API, timestamped segments; typed-summary fallback)
       └─ webm (playback artifact, ≤5min/≤50MB, optional)
     upload ───────────────► POST /api/v1/recordings/upload      (bearer token, prefix recordings/{sessionId}/)
  └─ compile slot ─────────► POST /api/v1/recordings/compile-trace
       trace-compiler.ts: frames+transcript → WorkflowTrace (Zod)   [soul-compiler two-call pattern]
       merge: mergeTraces(model, newTrace) → FlowModel + whatChanged + openQuestions
       coverage: steps × tool-catalog → green/yellow/red per step
  └─ interview chat ───────► POST /api/v1/recordings/interview   (stateless turn over FlowModel context)
  └─ recap view: FlowModel steps + branches + coverage badges + confidence/open-questions
  └─ APPROVE → claim CTA (signup, claim_token pattern) ── session attached to org
  └─ post-claim: POST /api/v1/recordings/compile-agent
       FlowModel → customSkillMd (≤8000) + ConnectorBindings (greens) + trigger → AgentBundle
       → agent_templates (status=draft) + EvalScenarios derived per recording → agent_evals ready
```

Key decision — **recap is ungated (the magic moment); agent compile sits behind claim.** This is
the conversion gate, keeps expensive compile spend authenticated, and avoids anonymous
`agent_templates.builderOrgId` gymnastics.

Key decision — **frames + live transcript are the primary artifacts, not video.** Claude API takes
images, not video; client-side keyframe extraction + Web Speech transcription means zero
server-side media processing (no ffmpeg, no whisper dependency, COGS≈0). The webm is kept only for
human playback/holdout reference when ≤50MB. Follow-up (deferred): server-side transcription for
browsers without Web Speech.

## 4. Data model (additive migration, hand-numbered per house rule)

- `recording_sessions`: id, orgId (nullable until claim), status (recording|recapped|approved|compiled|abandoned),
  tokenHash (bearer, HMAC like claim tokens), flowModel jsonb, openQuestions jsonb, interviewLog jsonb,
  agentTemplateId (nullable), createdAt/updatedAt, ipHash (rate limit).
- `workflow_recordings`: id, sessionId FK, slotIndex, label ("happy path", "edge: no phone"),
  transcript jsonb (timestamped segments), frameBlobUrls jsonb, videoBlobUrl (nullable),
  trace jsonb (WorkflowTrace), status (uploaded|traced|failed), createdAt.

## 5. Components

### 5.1 `lib/recordings/` (the fat core — pure lib, DI, offline-testable)
- `policy.ts` — `isRecordToAgentOn(env)`, rate-limit consts (3 sessions/24h/IP, 6 recordings/session, 5min/recording).
- `trace-schema.ts` — `WorkflowTraceSchema` (Zod): title, goal, apps[], steps[{index, app, action,
  intent, dataIn[], dataOut[], checks[], decision?}], variables[], constants[], branches[],
  openQuestions[]. **L-17 note: 10+ cross-ref edges → budget tests at ~3.2x.**
- `trace-compiler.ts` — `compileTrace({frames, transcript, priorAnswers, llm})` two-call
  route→extract, mirrors `compileSoulService` (incl. anonymous-spend check reuse from web-build path).
- `merge-traces.ts` — `mergeIntoFlowModel({model, trace, llm})` → {model', whatChanged[], openQuestions[]}.
- `coverage.ts` — `coverFlowModel(model)` → per-step {tier: green|yellow|red, binding?} via
  `findToolsByKeywords` + app-name matching. Red steps stay in the skill as human-handoff steps (never dropped).
- `compile-agent.ts` — `flowModelToBundle(model)` → {customSkillMd, trigger, connectors, warnings}
  feeding the existing `AgentBundle`/`agent_templates` insert; `deriveEvalScenarios(recordings, model)`
  → `EvalScenario[]` (successCriteria = what the human actually did/checked per recording).

### 5.2 API routes (all flag-gated, `(public)` conventions, SSRF-irrelevant — no user URLs fetched)
- `POST /api/v1/recordings/session` — create session + bearer token (IP rate-limited).
- `POST /api/v1/recordings/upload` — NEW anonymous-grant `handleUpload` route: authorizes by
  session bearer token (NOT `getOrgId()`), pathname forced under `recordings/{sessionId}/`,
  content-types image/jpeg + video/webm only, existing size caps. Existing media route untouched.
- `POST /api/v1/recordings/compile-trace` · `POST /api/v1/recordings/interview` — bearer-token auth.
- `POST /api/v1/recordings/compile-agent` — session auth (post-claim), attaches session→org, inserts
  draft template + eval scenarios.

### 5.3 `/record` page (app/(public)/record/)
- Server component gates on flag (`notFound()` when off) — same as `/try`.
- Client: slots UI (record/re-record/label per slot), recorder state machine —
  **reducer-extracted per L-17 (1.0-1.3x)**: idle→recording→processing→traced per slot; live
  transcript pane; interview chat panel (simple message list, not SeldonChat); recap view (steps +
  branch list + coverage badges + confidence meter = open-question count); approve → claim CTA.
- Dark theme, matches marketing surfaces.

### 5.4 Spike script
- `scripts/spike-trace-compiler.mjs` — run the real compiler on a directory of frames + a
  transcript file; prints the WorkflowTrace. This is the staging-verified gate for the riskiest
  assumption (trace fidelity on real recordings). Runs with a real key post-merge; unit tests use DI-mocked LLM.

## 6. Scope

**In this branch (S1–S5):** migration + policy → trace schema + compiler + merge + coverage →
/record page → interview + recap + approve/claim handoff → compile-agent + eval derivation + spike script.
**Deferred (explicit, per L-22 — each needs its own DoD item when picked up):** browser-extension
DOM-event capture; true holdout evals (currently all recordings inform the model AND generate
scenarios); recordings-prefix blob TTL cron; approval-queue UI on `workflow_approvals`; production
learn-loop (escalations → recording N+1); marketplace publish flow; server-side transcription;
landing-page hero integration (page ships dark; marketing wiring is a follow-up flip).

## 7. Honest-claims plan (L-06)

Unit tests + tsc + verify-build = code-correct. **Staging-verified requires:** (a) spike script run
on ≥1 real recording — trace quality human-graded; (b) live smoke of /record with flag on preview;
(c) one end-to-end session → claim → draft template in a real org. These land at the merge gate as
⏳ items with exact commands; no "it works" claims without them.

## 8. Sizing (L-17 calibrated)

Trace/flow Zod schemas ~10+ edges → ~200 prod / ~650 test; compiler+merge+coverage ~450 prod /
~600 test (DI-mocked); routes ~350 prod / ~400 test; recorder UI ~600 prod (reducer-extracted
machine + composition 0.94x) / ~450 test; compile-agent + eval derivation ~300 prod / ~400 test;
migration + spike + docs ~300. **Total ≈ 2,200 prod + 2,500 test ≈ 4,700 LOC.** Stop-and-reassess
if a slice runs >15% over its line.
