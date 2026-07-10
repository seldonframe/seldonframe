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

## 9. As-built deltas

Interface drift discovered during the build, vs. this design/the implementation plan:

- **`route-guards.ts` extraction (security review, Wave D).** Next's build-time route-export
  validation rejects any non-handler/non-segment-config export from a `route.ts` file ("X is not
  a valid Route export field") — tsc never catches it, only `next build` does. Every pure
  authz/gate helper (`authorizeRecordingSubmission`, `isValidRecordingBlobUrl`,
  `resolveSessionCreateGate`, `resolveUploadGrant`, `isAllowedRecordingPathname`, and this wave's
  `resolveCompileAgentGate`) therefore lives in `lib/recordings/route-guards.ts`, not inline in the
  route files, and the authz specs import from there. This module is also kept free of
  `@vercel/blob` imports so it resolves under the worktree's node_modules junction.
- **jpeg-only anonymous upload grant (security review, Wave D).** `resolveUploadGrant` only ever
  grants `image/jpeg` (keyframes) or `video/webm` — never the workspace media route's wider image
  allowlist (svg/gif/png/webp). Anonymous, unauthenticated visitors write these blobs to a public
  URL; an SVG (script-bearing) upload there would be a stored-XSS surface, so the anonymous path
  is deliberately narrower than the authed dashboard upload route it otherwise mirrors.
- **`compile-trace` response now includes `flow_model`.** The route previously returned
  `{trace, whatChanged, openQuestions, coverage}` and `record-client.tsx`'s `handleStop`
  reconstructed the client-visible FlowModel by hand from the previous state + those fields. The
  response now also carries `flow_model` — the exact, persisted, merged FlowModel the route just
  wrote to `recordingSessions.flow_model` — and `handleStop` uses it directly. Source of truth
  lives in one place (the DB row via the route's response), not reconstructed client-side.
- **React.createElement smoke-test note (Wave D).** `record-page-render.spec.ts`'s renderToString
  harness constructs the client component via `React.createElement` rather than JSX (the test file
  is plain `.ts`, not `.tsx`) — noted here so a future reader isn't surprised by the harness shape;
  no behavior difference from a JSX-authored smoke test.
- **Task 11 (`compile-agent.ts`) — `parseIntent` is `heuristicIntent`.** The plan's prose named a
  `parseIntent` import; the real export in `lib/agents/generate/parse-intent.ts` is
  `heuristicIntent` (sync, pure, always-complete) plus the async, LLM-DI'd `parseAgentIntent`.
  `flowModelToBundle` calls `heuristicIntent(model.goal)` directly — this whole module stays
  synchronous, deterministic, and LLM-free by design (per the plan's own framing of
  `deriveEvalScenarios` as "deterministic, no LLM"; the same now applies to the bundle assembly).
- **Task 11 — connector binding bypasses `bindToolsForIntent`/`bindingForEntry`.** `bindingForEntry`
  (`bind-tools.ts:64`) isn't exported, and `bindToolIds` indexes the catalog by its `id` field —
  which for a Composio entry like `googlesheets` differs from the `toolkitSlug` (`googledrive`)
  that `coverage.ts` actually stores on a green `CoverageEntry.toolkit`. `compile-agent.ts` instead
  has its own tiny `bindingForToolkit(toolkit)` that builds a `ConnectorBinding` directly from the
  coverage entry's already-resolved toolkit string (`"postiz"` → vetted, anything else → composio),
  with a comment pointing back at `bindingForEntry` as the shape it mirrors.
- **Post-review fix (B-1) — `GET /api/v1/recordings/session` + `REHYDRATED`.** The final
  cross-wave review found the post-claim compile step UI-unreachable: the `/signup` return
  dispatched only `SESSION_READY`, which resets `phase` to `"capturing"` with `flowModel: null`,
  so the recap panel and "Compile my agent" button (gated on `phase` "recap"/"approved") could
  never render, and there was no way to re-fetch persisted session state. Fixed by adding a
  bearer-authed `GET` handler to `session/route.ts` (flag-gated 404 like its `POST`, authz via the
  new `resolveSessionFetchGate` + shared `extractBearerToken` in `route-guards.ts`) returning
  `{session_id, status, flow_model, open_questions, slots}` (slots from the new
  `listRecordingsForSession` store fn), a new `REHYDRATED` action on the recorder reducer that maps
  session status → phase (`recapped`→`recap`, `approved`/`compiled`→`approved`, else `capturing`)
  and slot rows → `SlotStatus` (`traced`→`traced`, `failed`→`failed` with a re-record error,
  `uploaded`→`empty` since there's no in-flight process left to resume), and a `record-client.tsx`
  mount effect that calls the GET for ANY stored `{sessionId, token}` pair (not just the claimed
  return — this also incidentally fixes N-1's silent-orphan case, since a stale/mismatched pair now
  gets validated against the server instead of assumed) and falls back to minting a fresh session
  on 401/404.
- **Task 12 — `resolveCompileAgentGate`'s `approve` semantics.** The plan only said `approve: true`
  "transitions recapped→approved first". The gate additionally treats a `recapped` session
  submitted WITHOUT `approve: true` as a 409 conflict (not a silent pass-through) — a recapped
  session is not yet compilable without the explicit approval this route performs, and an
  `approved` session proceeds regardless of the `approve` flag (idempotent retry).
- **Live-test fix 1 — authed users compile in place, no `/signup` hop.** Live logs showed an
  already-signed-in visitor clicking the recap's claim CTA got 307'd by `/signup` straight to
  `/dashboard` (dropping `callbackUrl`), so `compile-agent` never ran. `record/page.tsx` now
  resolves `auth()` server-side (mirroring `claim-build/page.tsx`'s check; yields `null` for an
  anonymous visitor rather than throwing) and passes a new `isAuthed: boolean` prop into
  `RecordClient`. The recap panel renders a "Compile my agent" button (same `handleCompileAgent`
  flow via a new `handleCompileNow` that dispatches `APPROVED` then calls it) instead of the
  `/signup` link when `isAuthed` is true; the reducer and its `claimed` semantics are untouched —
  only which CTA is shown changes.
- **Live-test fix 2 — post-compile success links the compiled agent, not `/dashboard`.** The
  compile-success panel previously linked `/dashboard`, stranding the operator one more click away
  from what they just built. It now links `/studio/agents/${template_id}` (the existing template
  editor route, deep-linked by the id `compile-agent` already returns) with copy "Open your agent"
  plus an honest "it's a draft — run its evals and test it before publishing" line.
- **Live-test fix 3 — coverage matches on `step.app` before falling back to action text.**
  `coverStep` fed `"<app> <action>"` into `findToolsByKeywords` as one string, so a Gmail step
  whose action text mentioned "X drafts / tweets" spuriously matched the `postiz` catalog entry
  bound to the action text. `coverStep` now tries `findToolsByKeywords(step.app)` alone first; only
  when the app alone yields no match does it fall back to the previous `"<app> <action>"` search.
- No other interface (types, exported function signatures, route paths, DB columns) drifted from
  the plan.
