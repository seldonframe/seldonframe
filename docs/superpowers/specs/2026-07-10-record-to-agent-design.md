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
- **Live-test round 3, fix wave 5, FIX 1 — interview optimistic UI.** `recorder-machine.ts`'s
  single `INTERVIEW_TURN` action (appended both the user and Seldon turns together, only once the
  reply arrived) is replaced by `INTERVIEW_USER_SENT { user }` (appends the user turn immediately)
  and `INTERVIEW_REPLY { seldon, openQuestions }` (appends the Seldon turn once the round-trip
  completes). `record-client.tsx` dispatches `INTERVIEW_USER_SENT` and clears the input before the
  `fetch`, tracks an `interviewPending` flag that disables the input/Send button and renders a
  muted "Seldon is updating the flow…" line, and on failure renders an inline retry line
  (`handleInterviewRetry`, keyed off a `lastInterviewMessage` ref) that resends the SAME text
  without re-appending the user's already-visible turn.
- **Live-test round 3, fix wave 5, FIX 2 — from-recording bundles stop inheriting receptionist
  starter primitives.** `flowModelToBundle` no longer leaves `heuristicIntent`'s starter fallback
  (`ai-phone-receptionist` for any unrecognized goal) fully intact: it now overrides
  `blueprint.trigger` with a new pure `inferTriggerFromModel(model)` (keyword heuristic over the
  goal + every step's app/action/intent — email app mention → inbound email, a recurring-cadence
  phrase → daily 9am schedule/email, sms/text-message wording → inbound sms, else inbound chat —
  first match wins, same shape as `heuristicIntent`'s own priority-ordered keyword tables),
  `blueprint.greeting` with a goal-derived one-liner naming the compiled workflow, `blueprint.faq`
  to `[]`, and `blueprint.capabilities` via a new `filterCapabilitiesForModel` that keeps only
  `escalate_to_human` plus any starter capability whose name is a substring of some step's
  `app`/`action` text (in practice this always strips the receptionist starter's booking tools —
  `look_up_availability`/`book_appointment`/`take_message`/`get_quote_range`/etc — since a recorded
  workflow's step text never literally contains those tool-id strings).
  `quoteRanges`/`pricingFacts`/`missedCallTextBack`/`reviewUrl` are all cleared to `undefined` —
  none of them apply to a from-recording workflow agent.
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
- **Live-test fix 4 (wave 3) — compiled identity comes from the FlowModel, not the starter it fell
  through to.** `flowModelToBundle` classified `model.goal` via `heuristicIntent` and let
  `assembleAgentBundle`'s starter blueprint name/description win outright — a goal like "Forward
  SeldonFrame Weekly Emails to Personal Gmail" matches no parse-intent keyword and silently
  produced an agent template named "AI Phone Receptionist". Fixed by overriding
  `bundle.name = model.title` / `bundle.description = model.goal` right after
  `assembleAgentBundle` in `compile-agent.ts`; archetype/trigger stay starter-derived (trigger
  inference from the recording is a named follow-up, not this fix).
- **Live-test fix 5 (wave 3) — `interviewTurn` now merges answers into the FlowModel.** The route
  told the operator "I'll update the flow" but `interviewTurn` only ever returned
  `{reply, openQuestions}` — a never-lies violation, since no answer ever reached what
  `compile-agent` compiled. `interviewTurn` now returns
  `{ok: true, reply, model: FlowModel, openQuestions} | {ok: false, error}`; the LLM's `model` is
  Zod-gated with a single retry-on-validation-error (mirroring `merge-traces.ts`'s pattern exactly,
  the retry firing only on a bad `model` — a bad/missing `reply` still fails immediately, no
  retry, same as before this fix), `recordingsSeen` is always force-preserved from the input model,
  and coverage is always recomputed post-merge via `coverFlowModel` rather than trusted from the
  LLM. `POST /api/v1/recordings/interview` persists the updated model to
  `recordingSessions.flow_model` (full-column update, same convention as `compile-trace`) and
  returns it as `flow_model`; a new `MODEL_UPDATED` reducer action swaps
  `flowModel`/`coverage`/`openQuestions` without touching `slots`/`phase`, dispatched from
  `record-client.tsx` whenever the interview response carries a `flow_model`.
- **Mobile-P2 — server-side transcription (Whisper), typed summary stays the fallback.** New
  `lib/recordings/transcribe.ts` (`transcribeVideoUrl`, never throws) re-validates the video blob
  URL against the exact `recordings/<sessionId>/` prefix (mirrors `fetch-frames.ts`'s defense in
  depth), enforces the 25MB OpenAI audio-API cap via `Content-Length` before ever reading the body,
  and POSTs to `https://api.openai.com/v1/audio/transcriptions` (`whisper-1`, `verbose_json`, same
  `OPENAI_API_KEY` env var the voice receptionist uses). `compile-trace/route.ts` calls it only when
  `recording.videoBlobUrl` is set, `OPENAI_API_KEY` is configured, AND the stored transcript is
  "effectively empty" per the new `isTranscriptEffectivelyEmpty` predicate (0 segments, or exactly 1
  segment under 30 chars — the shape the typed-summary fallback always writes); on success the
  richer transcript is persisted to the recording row and fed into `compileTrace` in place of the
  original; on `ok:false` the route proceeds with whatever transcript already existed — fail-soft by
  construction, never blocks compile.
- **Live-test fix 6 (wave 3) — "Born from your recording" provenance panel.** A new
  `findSessionByTemplateId(db, templateId)` store fn (`session-store.ts`) looks up the
  `recording_sessions` row whose `agent_template_id` matches the open template (set by
  `compile-agent` on approval). `studio/agents/[id]/page.tsx` renders a panel — goal, step/
  coverage-tier counts, operator-clarification count (`interviewLog.length / 2`), remaining open
  questions — only when a session matches; renders nothing for every ordinary (non-recorded)
  template, so there's zero visual/behavioral change to the existing editor for those.
- **Live-test fix 7 (wave 4) — authed bypass + env-overridable anonymous cap.**
  `resolveSessionCreateGate` gained a 4th, optional `options: { isAuthed?: boolean }` param
  (backward-compatible — every existing 3-arg call site/test is untouched): when `isAuthed` is
  true, the anonymous per-IP count check (`countExisting`) is skipped entirely, so a founder (or
  any signed-in operator) testing their own flow never trips the cap meant to bound anonymous
  abuse; the flag check still applies unconditionally regardless of auth. `POST
  /api/v1/recordings/session` now resolves `auth()` server-side (same null-safe idiom as
  `record/page.tsx`) and passes `isAuthed`. The anonymous cap itself is now env-overridable via a
  new `resolveRecordingSessionsPerDay(env)` in `policy.ts` (`SF_RECORD_SESSIONS_PER_DAY`), mirroring
  `resolveWebBuildRateLimit`'s exact contract — falls back to the compiled
  `RECORDING_SESSIONS_PER_DAY_PER_IP` (3) on absent/invalid/non-positive values.
- **Live-test fix 8 (wave 4) — "Start fresh" affordance.** A restored session (localStorage or the
  post-claim return) had no way back to a clean slate. `record-client.tsx` now renders a quiet
  "Start fresh" text button above the recording slots whenever `state.sessionId` is non-null
  (absent on the initial landing-phase render, per the updated render smoke test); it
  confirm-guards via `window.confirm` only when `state.flowModel` is non-null (a bare fresh session
  with no recap yet needs no confirmation), then calls the existing `clearStoredSession()` and
  `window.location.assign("/record")` for a clean remount that mints a brand-new session
  server-side.
- No other interface (types, exported function signatures, route paths, DB columns) drifted from
  the plan.
