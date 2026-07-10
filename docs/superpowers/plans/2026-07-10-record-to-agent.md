# Record-to-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ungated `/record` page where an operator screen-records a workflow (multiple recordings = edge cases); Seldon compiles recordings → WorkflowTrace → FlowModel, recaps with a green/yellow/red coverage report + interview chat, and after claim compiles a draft `agent_templates` row (fat `customSkillMd` + Composio bindings + derived eval scenarios).

**Architecture:** Pure lib core (`packages/crm/src/lib/recordings/`, DI-injected LLM, offline-testable) + thin flag-gated API routes + one public page. Mirrors `soul-compiler` (two-call compile), `/try` (ungated funnel), `agent-bundle` (compile target). Spec: `docs/superpowers/specs/2026-07-10-record-to-agent-design.md` — read it first.

**Tech Stack:** Next 16 App Router, Drizzle/Postgres, Zod, `@vercel/blob/client` `handleUpload`, Anthropic SDK (per L-05: default `claude-opus-4-7`, `thinking: {type:"adaptive"}`, no sampling params, `tool_use` for structured output), `node --import tsx --test` specs.

## Global Constraints

- Flag `SF_RECORD_TO_AGENT`: strict-`"1"` = on, anything else = dark. Mirror `packages/crm/src/lib/web-build/policy.ts` exactly.
- All new tests: `packages/crm/tests/unit/recordings/*.spec.ts`, run `cd packages/crm && node --import tsx --test tests/unit/recordings/<file>.spec.ts`.
- Migration is hand-numbered `0067_record_to_agent.sql` + journal entry `idx: 44` in `drizzle/meta/_journal.json`. Additive only.
- jsonb writes to specific subtrees use bound `text[]` paths, never `sql.raw` (L-03/L-04).
- Existing files may ONLY be modified where a task's **Files: Modify** line says so. No kitchen-sink edits.
- Every LLM-calling lib function takes the LLM as a parameter (DI); only `trace-llm.ts` imports the Anthropic SDK.
- Bearer tokens: store `sha256(rawToken + AUTH_SECRET)` hex, raw token only to the client (L-14 pattern). Throw if neither `AUTH_SECRET` nor `NEXTAUTH_SECRET` set.
- Commit after every task: `git add <files> && git commit -m "<type>(record): <what>"`. First commit at the first coherent unit.
- `customSkillMd` hard cap: 8000 chars (`db/schema/agents.ts:67` contract).

## Shared vocabulary (defined in Task 3, consumed everywhere)

```ts
// lib/recordings/trace-schema.ts
export type TranscriptSegment = { atMs: number; text: string };
export type WorkflowStep = {
  index: number; app: string; action: string; intent: string;
  dataIn: string[]; dataOut: string[]; checks: string[]; decision?: string;
};
export type WorkflowTrace = {
  title: string; goal: string; apps: string[]; steps: WorkflowStep[];
  variables: string[]; constants: string[];
  branches: Array<{ condition: string; behavior: string }>;
  openQuestions: string[];
};
export type CoverageTier = "green" | "yellow" | "red";
export type CoverageEntry = { stepIndex: number; tier: CoverageTier; toolkit?: string; reason: string };
export type FlowModel = WorkflowTrace & { recordingsSeen: number; coverage: CoverageEntry[] };
export type TraceLlmRequest = {
  system: string;
  user: Array<{ type: "text"; text: string } | { type: "image"; mediaType: "image/jpeg"; base64: string }>;
  maxTokens: number;
};
export type TraceLlm = (req: TraceLlmRequest) => Promise<unknown>; // parsed JSON (impl uses tool_use forcing)
```

---

### Task 1: Policy flag + limits

**Files:**
- Create: `packages/crm/src/lib/recordings/policy.ts`
- Test: `packages/crm/tests/unit/recordings/policy.spec.ts`

**Interfaces:**
- Produces: `isRecordToAgentOn(env: { SF_RECORD_TO_AGENT?: string | undefined }): boolean`; consts `RECORDING_SESSIONS_PER_DAY_PER_IP = 3`, `MAX_RECORDINGS_PER_SESSION = 6`, `MAX_RECORDING_SECONDS = 300`, `MAX_FRAMES_PER_RECORDING = 240`, `MAX_FRAME_EDGE_PX = 1280`, `MAX_INTERVIEW_TURNS = 30`.

- [ ] **Step 1: Failing test** — `policy.spec.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecordToAgentOn, MAX_RECORDINGS_PER_SESSION } from "@/lib/recordings/policy";

test("on only when strictly '1'", () => {
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: "1" }), true);
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: "true" }), false);
  assert.equal(isRecordToAgentOn({ SF_RECORD_TO_AGENT: undefined }), false);
  assert.equal(isRecordToAgentOn({}), false);
});
test("limits are sane", () => { assert.equal(MAX_RECORDINGS_PER_SESSION, 6); });
```

- [ ] **Step 2: Run — expect FAIL** (module not found).
- [ ] **Step 3: Implement** — copy the strict-"1" shape from `lib/web-build/policy.ts:10` (`return env.SF_RECORD_TO_AGENT === "1";`) + export the consts with the values above, one doc line each.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(record): policy flag + capture limits`.

### Task 2: Schema + migration 0067

**Files:**
- Create: `packages/crm/src/db/schema/recordings.ts`, `packages/crm/drizzle/0067_record_to_agent.sql`
- Modify: `packages/crm/src/db/schema/index.ts` (add `export * from "./recordings";` matching sibling lines), `packages/crm/drizzle/meta/_journal.json` (append entry `{ "idx": 44, "version": "7", "when": <epoch ms — use a real current timestamp>, "tag": "0067_record_to_agent", "breakpoints": true }`)
- Test: `packages/crm/tests/unit/recordings/schema.spec.ts`

**Interfaces (produces — later tasks import these exact names):**

```ts
export const recordingSessions = pgTable("recording_sessions", { ... });
export const workflowRecordings = pgTable("workflow_recordings", { ... });
export type RecordingSession = typeof recordingSessions.$inferSelect;
export type WorkflowRecording = typeof workflowRecordings.$inferSelect;
```

Columns — `recording_sessions`: `id` uuid pk default gen_random_uuid; `orgId` uuid nullable (FK organizations, set on claim); `status` text notNull default `'recording'` (`recording|recapped|approved|compiled|abandoned`); `tokenHash` text notNull unique; `ipHash` text notNull; `flowModel` jsonb nullable; `openQuestions` jsonb nullable; `interviewLog` jsonb nullable; `derivedScenarios` jsonb nullable; `agentTemplateId` uuid nullable; `createdAt`/`updatedAt` timestamptz defaultNow. Index on `ipHash, createdAt`.
`workflow_recordings`: `id` uuid pk; `sessionId` uuid notNull FK → recording_sessions cascade; `slotIndex` integer notNull; `label` text nullable; `transcript` jsonb nullable; `frameBlobUrls` jsonb nullable; `videoBlobUrl` text nullable; `trace` jsonb nullable; `status` text notNull default `'uploaded'` (`uploaded|traced|failed`); `createdAt` timestamptz defaultNow. Unique index `(sessionId, slotIndex)`.
Mirror column-builder style from `db/schema/agent-templates.ts`. SQL file mirrors a recent sibling (see `0064_agent_taste_sessions.sql`).

- [ ] **Step 1: Failing test** — `schema.spec.ts`: imports both tables, asserts `recordingSessions` has `tokenHash` and `workflowRecordings` has `slotIndex` (use drizzle's table config via `getTableColumns` from `drizzle-orm`), and asserts the migration file exists and journal contains tag `0067_record_to_agent` exactly once (read both files with `node:fs`).
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): recording_sessions + workflow_recordings schema, migration 0067`.

### Task 3: WorkflowTrace/FlowModel Zod schemas

**Files:**
- Create: `packages/crm/src/lib/recordings/trace-schema.ts`
- Test: `packages/crm/tests/unit/recordings/trace-schema.spec.ts`

**Interfaces:** Produces `WorkflowTraceSchema`, `FlowModelSchema`, `CoverageEntrySchema`, `TranscriptSegmentSchema` (Zod) + ALL types from "Shared vocabulary" above (`z.infer` where possible). Validation edges: every `min(1)` on title/goal/app/action/intent; `steps.min(1)`; `index` int ≥0; `superRefine` on `WorkflowTraceSchema`: (a) step indexes strictly ascending from 0, (b) every `branches[].condition` non-empty, (c) `apps` contains every distinct `steps[].app` (reject with message naming the missing app); `CoverageEntrySchema` enum tier + `toolkit` required-when-green (`superRefine`); `FlowModelSchema = WorkflowTraceSchema.extend({ recordingsSeen: z.number().int().min(1), coverage: z.array(CoverageEntrySchema) })`.

**L-17: this is a 10+ edge cross-ref schema → budget ~650 test LOC, one accept + 1-3 rejects per edge.**

- [ ] **Step 1: Failing tests** — build `validTrace()` fixture helper; then per edge: accepts valid; rejects non-ascending indexes; rejects app missing from `apps`; rejects empty steps; rejects green coverage without toolkit; rejects unknown tier; rejects negative index; accepts optional `decision` absent/present; rejects empty branch condition; FlowModel rejects `recordingsSeen: 0`.
- [ ] **Step 2: FAIL** → **Step 3: implement schemas** → **Step 4: PASS** → **Step 5: Commit** `feat(record): WorkflowTrace + FlowModel zod schemas`.

### Task 4: Trace compiler (two-call, DI LLM)

**Files:**
- Create: `packages/crm/src/lib/recordings/trace-compiler.ts`, `packages/crm/src/lib/recordings/trace-llm.ts`
- Test: `packages/crm/tests/unit/recordings/trace-compiler.spec.ts`

**Interfaces:**
- Consumes: Task 3 schemas/types.
- Produces:

```ts
export type CompileTraceResult = { ok: true; trace: WorkflowTrace } | { ok: false; error: string };
export async function compileTrace(params: {
  frames: Array<{ base64: string }>;            // jpeg, already capped by caller
  transcript: TranscriptSegment[];
  label?: string | null;
  priorAnswers?: string[];                      // interview answers so far
  llm: TraceLlm;
}): Promise<CompileTraceResult>;
// trace-llm.ts — the ONLY Anthropic import:
export function makeAnthropicTraceLlm(params: { apiKey: string }): TraceLlm;
```

Behavior (mirror `soul-compiler/service.ts` + `soul-compiler/anthropic.ts` two-call shape — read both first): call 1 (route) = text-only classification {jobKind, confidence, needsFramesReview: boolean}; call 2 (extract) = frames (interleave `image` blocks with `text` timestamp markers from transcript) → JSON matching `WorkflowTraceSchema`. Parse with `WorkflowTraceSchema.safeParse`; on failure retry ONCE with the Zod error text appended to the prompt; still failing → `{ok:false, error}`. Empty frames AND empty transcript → explicit `{ok:false, error:"nothing to compile"}` (never a silent pass — Optimistic Path rule). `makeAnthropicTraceLlm` uses `tool_use` + `tool_choice` forcing (L-05; no sampling params, model `claude-opus-4-7`).

- [ ] **Step 1: Failing tests** — fake `TraceLlm` (queue of canned responses): happy path returns validated trace; malformed-then-valid exercises the single retry (assert llm called 3x total: route+extract+retry); twice-malformed → `ok:false`; empty inputs → `ok:false` without calling llm; prompt includes priorAnswers text (capture the request in the fake and assert).
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): trace compiler (two-call, DI llm, zod-gated)`.

### Task 5: Merge traces → FlowModel

**Files:**
- Create: `packages/crm/src/lib/recordings/merge-traces.ts`
- Test: `packages/crm/tests/unit/recordings/merge-traces.spec.ts`

**Interfaces:**

```ts
export type MergeResult =
  | { ok: true; model: FlowModel; whatChanged: string[]; openQuestions: string[] }
  | { ok: false; error: string };
export async function mergeIntoFlowModel(params: {
  model: FlowModel | null;   // null = first recording
  trace: WorkflowTrace;
  llm: TraceLlm;
}): Promise<MergeResult>;
```

Behavior: `model === null` → deterministic promotion (no LLM call): `{...trace, recordingsSeen: 1, coverage: []}`, `whatChanged: ["Learned the happy path: <title>"]`, `openQuestions = trace.openQuestions`. Otherwise one LLM call: system prompt = merge instructions (diff semantics: new branches, changed steps, values that differ across recordings become `variables`); user = JSON of current model + new trace; response JSON `{model, whatChanged, openQuestions}`; `FlowModelSchema.safeParse` on `model` with `recordingsSeen` forced to `model.recordingsSeen + 1` server-side (never trust the LLM's counter); single retry-on-zod-error like Task 4.

- [ ] **Step 1: Failing tests** — first-recording deterministic (llm fake asserts zero calls); second recording merge happy path; recordingsSeen forced (+1 even when LLM returns 99); zod-fail retry then error.
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): flow-model merge with deterministic first-recording path`.

### Task 6: Coverage report (pure)

**Files:**
- Create: `packages/crm/src/lib/recordings/coverage.ts`
- Test: `packages/crm/tests/unit/recordings/coverage.spec.ts`

**Interfaces:**
- Consumes: `findToolsByKeywords(sentence: string): ToolCatalogEntry[]` from `@/lib/agents/generate/tool-catalog` (read that file first — entries carry toolkit slugs + `kind`).
- Produces: `export function coverFlowModel(model: FlowModel): CoverageEntry[]` (one entry per step, same order).

Tier rules: catalog hit on `"<app> <action>"` → `green` with `toolkit` + reason `"matched <toolkit>"`; no hit but app is a browser/web app mentioned in `apps` with an obviously API-shaped action (send/create/update/book keywords, keyword list in-file) → `yellow`, reason `"likely API-doable — needs approval gate"`; otherwise `red`, reason `"no tool binding — stays with the human"`. Pure function, no I/O.

- [ ] **Step 1: Failing tests** — gmail step → green with toolkit; unknown desktop app ("QuickBooks Desktop") → red; unmatched-but-actiony web step → yellow; output length === steps length and stepIndex aligned.
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): per-step tool coverage (green/yellow/red)`.

### Task 7: Session token + session/recording/upload routes

**Files:**
- Create: `packages/crm/src/lib/recordings/session-token.ts`, `packages/crm/src/lib/recordings/session-store.ts`, `packages/crm/src/app/api/v1/recordings/session/route.ts`, `packages/crm/src/app/api/v1/recordings/recording/route.ts`, `packages/crm/src/app/api/v1/recordings/upload/route.ts`
- Test: `packages/crm/tests/unit/recordings/session-token.spec.ts`, `packages/crm/tests/unit/recordings/session-routes-authz.spec.ts`

**Interfaces:**

```ts
// session-token.ts (pure, mirrors L-14 hashing)
export function mintSessionToken(): { raw: string };                        // 32B random hex
export function hashSessionToken(raw: string, secret: string): string;      // sha256(raw+secret) hex
export function resolveTokenSecret(env: NodeJS.ProcessEnv): string;         // AUTH_SECRET ?? NEXTAUTH_SECRET ?? throw
// session-store.ts (drizzle I/O; every fn takes db as first arg for testability)
export async function createSession(db, args: { ipHash: string; tokenHash: string }): Promise<{ id: string }>;
export async function findSessionByToken(db, rawToken: string, env): Promise<RecordingSession | null>;
export async function countSessionsForIp(db, ipHash: string, sinceMs: number): Promise<number>;
export async function insertRecording(db, args: { sessionId: string; slotIndex: number; label?: string|null; transcript: TranscriptSegment[]; frameBlobUrls: string[]; videoBlobUrl?: string|null }): Promise<{ id: string }>;
```

Routes (all `notFound()`-style 404 when flag off — mirror `/api/v1/web/build/stream`'s gate + IP rate-limit shape; read that route first):
- `POST /api/v1/recordings/session` → rate-limit `RECORDING_SESSIONS_PER_DAY_PER_IP` by ipHash/24h → create row → `{ session_id, token }` (raw token returned once).
- `POST /api/v1/recordings/recording` → bearer auth via `findSessionByToken` → validate body with a local Zod schema (slotIndex 0..MAX_RECORDINGS_PER_SESSION-1, frameBlobUrls length ≤ MAX_FRAMES_PER_RECORDING, **every URL host must be `*.public.blob.vercel-storage.com` AND pathname starts with `recordings/<sessionId>/`** — reject otherwise) → insert → `{ recording_id }`.
- `POST /api/v1/recordings/upload` → `handleUpload` (mirror `app/api/v1/workspace/media/upload/route.ts` but auth = session bearer passed in `clientPayload`, NOT `getOrgId()`): `onBeforeGenerateToken` verifies token, forces `allowedContentTypes: ["image/jpeg","video/webm"]`, `maximumSizeInBytes` = `VIDEO_MAX_BYTES` for webm / `IMAGE_MAX_BYTES` for jpeg (import from `@/lib/media/resolve-url`), pathname prefix `recordings/<sessionId>/`. Existing media route is NOT modified.

- [ ] **Step 1: Failing tests** — token: mint/hash roundtrip, resolveTokenSecret throws when both unset; authz spec (mirror style of `tests/unit/approvals-api-authz.spec.ts`): recording route rejects bad token (401), rejects foreign blob host (400), rejects pathname outside `recordings/<sessionId>/` (400), rejects slotIndex ≥ 6 (400). Use a fake db (in-memory maps implementing only the store fns' query surface — store fns take `db`, so tests pass a stub drizzle or refactor store to accept an interface; keep store thin so the stub is small).
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): recording session + anonymous blob upload grant (bearer-token auth)`.

### Task 8: Compile-trace + interview routes

**Files:**
- Create: `packages/crm/src/app/api/v1/recordings/compile-trace/route.ts`, `packages/crm/src/app/api/v1/recordings/interview/route.ts`, `packages/crm/src/lib/recordings/interview.ts`, `packages/crm/src/lib/recordings/fetch-frames.ts`
- Test: `packages/crm/tests/unit/recordings/interview.spec.ts`, `packages/crm/tests/unit/recordings/fetch-frames.spec.ts`

**Interfaces:**

```ts
// fetch-frames.ts
export async function fetchFramesAsBase64(urls: string[], opts?: { fetchImpl?: typeof fetch; maxFrames?: number })
  : Promise<Array<{ base64: string }>>;  // re-validates host+prefix, caps at MAX_FRAMES_PER_RECORDING, throws on any non-200
// interview.ts
export async function interviewTurn(params: {
  model: FlowModel; interviewLog: Array<{ role: "user"|"seldon"; text: string }>;
  message: string; llm: TraceLlm;
}): Promise<{ ok: true; reply: string; openQuestions: string[] } | { ok: false; error: string }>;
```

`compile-trace` route: bearer auth → load recording row (must belong to session, status `uploaded`) → `fetchFramesAsBase64(row.frameBlobUrls)` → `compileTrace` → `mergeIntoFlowModel(session.flowModel, trace)` → `coverFlowModel` → persist (recording: `trace`,`status='traced'`; session: `flowModel` (with coverage), `openQuestions`, `status='recapped'`) → return `{ trace, whatChanged, openQuestions, coverage }`. Any lib `ok:false` → 422 with the error (recording `status='failed'`). LLM spend: reuse the anonymous spend-check used by the web-build path (find the `checkAndIncrementLlmSpend` call in `lib/web-onboarding/run-create-from-url.ts` and mirror it; capped → 429).
`interview` route: bearer auth → cap `MAX_INTERVIEW_TURNS` (429 past cap) → `interviewTurn` → append both turns to `interviewLog` jsonb via `jsonb_set` bound-path write (L-03) → `{ reply, open_questions }`.
Wiring: routes construct `makeAnthropicTraceLlm` from the same env/key resolution the web-build anonymous path uses.

- [ ] **Step 1: Failing tests** — `fetch-frames`: happy (fake fetchImpl), non-200 throws, foreign host throws, >cap truncates to cap; `interview`: reply produced + openQuestions passthrough from fake llm, malformed llm JSON → `ok:false`.
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): compile-trace + interview endpoints`.

### Task 9: Recorder state machine (pure reducer)

**Files:**
- Create: `packages/crm/src/app/(public)/record/recorder-machine.ts`
- Test: `packages/crm/tests/unit/recordings/recorder-machine.spec.ts`

**Interfaces (L-17: reducer-extracted state machine → 1.0-1.3x):**

```ts
export type SlotStatus = "empty" | "recording" | "uploading" | "compiling" | "traced" | "failed";
export type RecorderSlot = { slotIndex: number; label: string | null; status: SlotStatus; error?: string; whatChanged?: string[] };
export type RecorderState = {
  sessionId: string | null; token: string | null;
  slots: RecorderSlot[];                       // length MAX_RECORDINGS_PER_SESSION
  activeSlot: number | null;
  flowModel: FlowModel | null; coverage: CoverageEntry[]; openQuestions: string[];
  interview: Array<{ role: "user"|"seldon"; text: string }>;
  phase: "landing" | "capturing" | "recap" | "approved";
};
export type RecorderAction =
  | { type: "SESSION_READY"; sessionId: string; token: string }
  | { type: "START_RECORDING"; slotIndex: number }
  | { type: "STOP_RECORDING"; slotIndex: number }               // → uploading
  | { type: "UPLOADED"; slotIndex: number }                      // → compiling
  | { type: "TRACED"; slotIndex: number; flowModel: FlowModel; coverage: CoverageEntry[]; whatChanged: string[]; openQuestions: string[] }
  | { type: "SLOT_FAILED"; slotIndex: number; error: string }
  | { type: "SET_LABEL"; slotIndex: number; label: string }
  | { type: "INTERVIEW_TURN"; user: string; seldon: string; openQuestions: string[] }
  | { type: "GO_RECAP" } | { type: "APPROVED" };
export function initialRecorderState(): RecorderState;
export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState;
```

Transition rules to encode + test: only one slot may be `recording`/`uploading`/`compiling` at a time (START while busy = no-op returning same state); `TRACED` moves phase to `recap` when it's the first traced slot; `SLOT_FAILED` returns slot to `empty` with `error` kept; `APPROVED` only from `recap`; actions on out-of-range slotIndex = no-op.

- [ ] **Step 1: Failing tests** — one test per transition rule above (direct reducer invocation, no rendering), plus full happy-path sequence ending `phase === "recap"`.
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): recorder reducer state machine`.

### Task 10: Capture module + /record page UI

**Files:**
- Create: `packages/crm/src/app/(public)/record/page.tsx`, `packages/crm/src/app/(public)/record/record-client.tsx`, `packages/crm/src/app/(public)/record/capture.ts`
- Test: `packages/crm/tests/unit/recordings/record-page-render.spec.ts`

**Interfaces:**
- Consumes: Task 9 reducer; Task 1 policy; routes from Tasks 7-8; `upload` via `import { upload } from "@vercel/blob/client"` pointed at `/api/v1/recordings/upload` with `clientPayload: JSON.stringify({ token })`.
- `capture.ts` (browser-only side effects, isolated):

```ts
export type CaptureHandle = { stop(): Promise<CaptureResult> };
export type CaptureResult = { frames: Blob[]; transcript: TranscriptSegment[]; video: Blob | null; durationMs: number };
export function startCapture(opts: { maxSeconds: number; maxFrames: number; maxEdgePx: number; onTick?: (elapsedMs: number) => void }): Promise<CaptureHandle>;
```

`startCapture`: `getDisplayMedia({video:true})` + `getUserMedia({audio:true})`; MediaRecorder → webm; keyframes via offscreen canvas at 1fps downscaled to `maxEdgePx`, JPEG quality 0.6; Web Speech API (`webkitSpeechRecognition` fallback chain) accumulating timestamped segments, feature-detected — absent → `transcript: []` (UI then shows a "describe what you did" textarea per slot, required when transcript is empty). Auto-stop at `maxSeconds`.
`page.tsx`: server component, `isRecordToAgentOn(process.env)` else `notFound()` — mirror `app/(public)/try/page.tsx`. Dark theme, marketing look (mirror /try styles).
`record-client.tsx`: `useReducer(recorderReducer, ...)`; slots column (record/stop/label/status badge per slot); live transcript pane while recording; right panel = recap (steps list with green/yellow/red badges + reasons, branches, "what changed" toast per new recording, confidence = open-question count) + interview chat (message list + input → interview route); approve button → `APPROVED` → claim CTA linking `/signup?callbackUrl=${encodeURIComponent(`/record?session=<id>&claimed=1`)}` (mirrors the /try claim CTA shape); on return with `claimed=1` and an authed session → "Compile my agent" button → Task 12 route → success panel links `/dashboard`.

- [ ] **Step 1: Failing test** — `record-page-render.spec.ts`: renderToString smoke of `record-client.tsx` initial state (house pattern — find any existing renderToString spec under `tests/unit/` and mirror its harness): renders 6 slots, no crash; recap panel hidden in `landing` phase.
- [ ] **Step 2: FAIL** → **Step 3: implement** (capture.ts has NO unit tests — browser APIs; it stays thin and typed) → **Step 4: PASS** → **Step 5: Commit** `feat(record): /record capture page (slots, live transcript, recap, interview, claim CTA)`.

### Task 11: Compile-agent lib (skill-md + bundle + eval derivation)

**Files:**
- Create: `packages/crm/src/lib/recordings/compile-agent.ts`
- Test: `packages/crm/tests/unit/recordings/compile-agent.spec.ts`

**Interfaces:**
- Consumes: `parseIntent` (read `lib/agents/generate/parse-intent.ts` for exact export) + `assembleAgentBundle(intent, ctx?)` from `lib/agents/generate/agent-bundle.ts:231` + `bindToolsForIntent` semantics (`bind-tools.ts:102`) + harness `EvalScenario` from `lib/agents/evals/eval-types.ts:35` ({id,title,persona,opening,successCriteria,mustDo,mustNotDo}).
- Produces:

```ts
export function flowModelToSkillMd(model: FlowModel): string; // ≤8000 chars, truncation-safe (drop lowest-priority sections first: eval scenarios > edge cases > steps NEVER dropped)
export function deriveEvalScenarios(recordings: Array<{ label: string|null; trace: WorkflowTrace }>): EvalScenario[]; // deterministic, no LLM
export function flowModelToBundle(params: {
  model: FlowModel;
  recordings: Array<{ label: string|null; trace: WorkflowTrace }>;
}): { bundle: AgentBundle; scenarios: EvalScenario[]; warnings: string[] };
```

`flowModelToSkillMd` sections, in order: `# <title>` + goal; `## The workflow` (numbered steps: action + intent + checks inline); `## Rules` (constants + "always verify before acting" per checks); `## Branches / edge cases`; `## What you may NOT do` (red/yellow steps → "hand off to the human: <action>" lines — never silently dropped); `## Eval scenarios` (the derived scenarios, per the `AgentEvalScenario` "within the SKILL.md" convention in `db/schema/agents.ts:367`). **L-15 does not apply — this is `customSkillMd`, not a marketplace BLOCK.md; note this in a comment.**
`deriveEvalScenarios`: one per recording — `id: rec-<slotIndex>`, `title` from label ?? trace.title, `persona` from goal ("a customer/counterparty in: <goal>"), `opening` = first step's dataIn context sentence, `successCriteria` = steps' checks + final dataOut (cap 6), `mustDo` = green-step actions (cap 6), `mustNotDo` = ["invent data not present in the workflow", "skip a required check", ...red-step actions prefixed "attempt: "] (cap 6).
`flowModelToBundle`: `parseIntent(model.goal)` → `assembleAgentBundle(intent)` → override `bundle.blueprint.customSkillMd = flowModelToSkillMd(model)`; union `bundle.blueprint.connectors` with green-coverage bindings (map toolkit → `ConnectorBinding` the same way `bind-tools.ts` `bindingForEntry` does — reuse the exported helper if exported, else replicate its 6-line shape with a comment pointing at it); `warnings` += one line per red step.

- [ ] **Step 1: Failing tests** — skill-md: contains all sections, ≤8000 for a 40-step model (fixture generator), red steps appear under "may NOT do", never drops a step on truncation (assert step count preserved while eval-scenarios section drops first); scenarios: one per recording, caps respected, deterministic (same input → same output); bundle: customSkillMd overridden, green toolkit present in connectors, red steps in warnings.
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): flow-model → skill-md + bundle + derived eval scenarios`.

### Task 12: Compile-agent route (post-claim) + spike script

**Files:**
- Create: `packages/crm/src/app/api/v1/recordings/compile-agent/route.ts`, `scripts/spike-trace-compiler.mjs`
- Test: `packages/crm/tests/unit/recordings/compile-agent-route-authz.spec.ts`

**Interfaces:** `POST /api/v1/recordings/compile-agent` body `{ session_id, token }`. Auth = BOTH the session bearer token AND an authenticated operator (`getOrgId()` from `@/lib/auth/helpers` — same import as the media upload route). Flow: session must be `status='approved'` (the approve action from the page sets it via the interview route? NO — add `approve: true` handling to this route: body `{ approve?: boolean }` transitions recapped→approved first, keeping one route) → `flowModelToBundle` → insert into `agent_templates` mirroring the insert in `app/api/v1/agents/generate/route.ts` (read it; reuse its helper if it has one, `builderOrgId` = caller org, `status: 'draft'`) → update session `{orgId, agentTemplateId, derivedScenarios, status:'compiled'}` → `{ ok: true, template_id, name, warnings, red_steps }`.
`spike-trace-compiler.mjs`: args `--frames <dir of jpg> --transcript <json file> [--label <s>]`; reads `ANTHROPIC_API_KEY` env (throw if unset); runs `makeAnthropicTraceLlm` + `compileTrace` via tsx import; prints the WorkflowTrace JSON + a human summary (steps/branches/openQuestions counts). Header comment: PowerShell + bash usage lines (L-09).

- [ ] **Step 1: Failing tests** — authz spec: 404 when flag off; 401 without operator session even with valid bearer; 401 with operator session but wrong bearer; 409 when session not recapped/approved. (Fake db + fake `getOrgId` via the same stub seam Task 7 used.)
- [ ] **Step 2: FAIL** → **Step 3: implement** → **Step 4: PASS** → **Step 5: Commit** `feat(record): compile-agent endpoint + trace-compiler spike script`.

### Task 13: Close-out — regression sweep + docs touch

**Files:**
- Modify: `docs/superpowers/specs/2026-07-10-record-to-agent-design.md` (append "## As-built deltas" section listing any interface drift from this plan — empty section if none)
- Test: full suite

- [ ] **Step 1:** `cd packages/crm && node --import tsx --test tests/unit/recordings/*.spec.ts` — all PASS.
- [ ] **Step 2:** `npx tsc --noEmit -p packages/crm` (use the junction method from the worktree-typecheck memory if node_modules is missing in the worktree) — clean vs main-delta (judge by delta, not absolute; pre-existing failures are not yours).
- [ ] **Step 3:** grep-verify no existing file was modified beyond the plan's Modify lines: `git diff --stat origin/main` reviewed against this plan.
- [ ] **Step 4:** Commit `docs(record): as-built deltas` and STOP — verify-build + review run from the controller, not the implementer.

## Deferred (explicit, L-22 — NOT in this branch)

Browser-extension capture · true holdout evals · recordings blob TTL cron · approval-queue UI · production learn-loop · marketplace publish · server-side transcription · landing-page hero wiring. Each becomes its own DoD item when picked up.
