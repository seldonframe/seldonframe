# Self-Improving Agent Generator (L5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the L4 "one sentence → an agent" generator into a self-improving loop — it binds the right **tools** from the sentence, a **judge** reviews each generation (maker≠checker), and its lessons compound in **Brain** so the next generation is smarter.

**Architecture:** Three additive layers on the existing `src/lib/agents/generate/` pipeline (`parse-intent` → `agent-bundle` → `run-generate` → `actions`). L5.1 a pure tool-catalog + `bindToolsForIntent` feeding `blueprint.connectors`. L5.2 a DI'd `judgeGeneratedAgent` LLM pass spliced into `runGenerateAgentDraft` (fail-open). L5.3 a `generator-lessons` Brain namespace (reusing L1 `agent-memory`) recorded by the judge + recalled into classify/judge prompts.

**Tech Stack:** Next.js 16 / React 19, Drizzle+Neon, `node --import tsx --test`, the existing Composio catalog (`src/lib/integrations/composio/catalog.ts`), the per-agent connectors (`src/lib/agents/mcp/connectors.ts` + `blueprint.connectors`), Brain v2 loop-memory (`src/lib/agents/memory/`), `getAnthropicClient` (Haiku-tier).

**Conventions:** verify `pnpm -C packages/crm typecheck` (baseline 0 — RE-RUN yourself, gate on **0**), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push per phase. Work in `icp3-wedge`.

**Spec:** `docs/superpowers/specs/2026-06-26-self-improving-generator-design.md`.

## File Structure
- `src/lib/agents/generate/tool-catalog.ts` (new) — the bindable-tool catalog + intent keywords (Composio + Postiz + native). Pure.
- `src/lib/agents/generate/bind-tools.ts` (new) — `bindToolsForIntent` (intent → connectors + warnings). Pure.
- `src/lib/agents/generate/agent-bundle.ts` (modify) — fold bound connectors into the blueprint + warnings.
- `src/lib/agents/generate/judge.ts` (new) — `judgeGeneratedAgent` (DI'd LLM maker≠checker) + `applyJudgeFixes`. 
- `src/lib/agents/generate/judge-llm.ts` (new) — the real `getAnthropicClient` grader (NOT "use server").
- `src/lib/agents/generate/generator-lessons.ts` (new) — record/recall lessons over Brain loop-memory.
- `src/lib/agents/generate/run-generate.ts` (modify) — splice judge + lessons recall/record into the pure orchestrator.
- `src/lib/agents/generate/actions.ts` (modify) — pass the judge + lessons deps in production; a `recordGeneratorEditAction` for post-generate edits.
- Tests under `tests/unit/agents/generate/`.

---

## PHASE L5.1 — Tool-binding from the sentence

### Task 1: The tool catalog (pure, TDD)
**Files:** Create `src/lib/agents/generate/tool-catalog.ts` + `tests/unit/agents/generate/tool-catalog.spec.ts`. INVESTIGATE FIRST: `src/lib/integrations/composio/catalog.ts` (the existing toolkit list/shape), `src/lib/agents/mcp/connectors.ts` + `blueprint.connectors` type (the per-agent connector entry shape — what fields a bound connector needs: kind, toolkit slug, label), and the **Postiz** connector kind (grep `postiz` — it's a bearer-key connector; confirm its kind + how it's bound).

- [ ] **Step 1: Write the failing test**
```ts
import { describe, test } from "node:test"; import assert from "node:assert/strict";
import { TOOL_CATALOG, findToolsByKeywords } from "../../../../src/lib/agents/generate/tool-catalog";
describe("tool-catalog", () => {
  test("each entry has id, connectorKind, keywords, label", () => {
    for (const t of TOOL_CATALOG) {
      assert.ok(t.id && t.connectorKind && t.label && Array.isArray(t.keywords) && t.keywords.length);
    }
  });
  test("catalog includes Postiz (social) + a Google Sheets + Notion entry", () => {
    const ids = TOOL_CATALOG.map((t) => t.id);
    assert.ok(ids.includes("postiz")); assert.ok(ids.includes("googlesheets")); assert.ok(ids.includes("notion"));
  });
  test("findToolsByKeywords matches on any keyword, case-insensitive, dedup", () => {
    const hits = findToolsByKeywords("post a weekly highlight to Instagram and Facebook");
    assert.ok(hits.some((t) => t.id === "postiz"));
    assert.equal(new Set(hits.map((t) => t.id)).size, hits.length); // no dup
  });
});
```
- [ ] **Step 2: Run it, watch it fail** (`MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement** — `export type ToolCatalogEntry = { id: string; connectorKind: string; toolkitSlug?: string; label: string; description: string; keywords: string[] }`. `export const TOOL_CATALOG: ToolCatalogEntry[]` with entries for: `postiz` (kind matching the real Postiz connector; keywords: social, instagram, facebook, linkedin, x, twitter, tiktok, post, schedule post), `googlesheets`/`googlecalendar`/`googledrive`/`gmail` (Composio kind + the real toolkit slug from the composio catalog), `notion`, `slack` — ONLY include toolkits the Composio catalog actually exposes (read it; don't invent slugs). `export function findToolsByKeywords(sentence: string): ToolCatalogEntry[]` — lowercase the sentence, return entries with any keyword present, deduped, never throws.
- [ ] **Step 4: Run tests, pass.** Re-run `pnpm -C packages/crm typecheck` → 0. `check-use-server` clean.
- [ ] **Step 5: Commit** `git add src/lib/agents/generate/tool-catalog.ts tests/unit/agents/generate/tool-catalog.spec.ts && git commit -m "feat(generate): bindable tool catalog (L5.1 T1)"`

### Task 2: `bindToolsForIntent` (pure, TDD)
**Files:** Create `src/lib/agents/generate/bind-tools.ts` + spec. Uses `AgentIntent` (`./parse-intent`) + the catalog (T1) + the `blueprint.connectors` entry shape (from T1's investigation).
- [ ] **Step 1: Failing test**
```ts
import { bindToolsForIntent } from "../../../../src/lib/agents/generate/bind-tools";
test("social-post sentence → a Postiz connector bound + no warning when keyword strong", () => {
  const r = bindToolsForIntent({ skill: "social-poster", trigger: { kind: "schedule", cron: "0 9 * * 1", channel: "digest" }, promptHint: "post a weekly highlight to Instagram" });
  assert.ok(r.connectors.some((c) => c.kind /* === postiz kind */));
  assert.deepEqual(r.warnings, []);
});
test("no tool keywords → empty connectors, no warning", () => {
  const r = bindToolsForIntent({ skill: "review-requester", trigger: { kind:"event", event:"booking.completed", channel:"sms" }, promptHint: "text for a google review" });
  assert.deepEqual(r.connectors, []); assert.deepEqual(r.warnings, []);
});
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — `export function bindToolsForIntent(intent: AgentIntent): { connectors: BlueprintConnector[]; warnings: string[] }`: run `findToolsByKeywords(intent.promptHint ?? "")`, map each hit → a `blueprint.connectors` entry (kind + toolkitSlug + label, matching the real shape), dedup by kind+slug. `warnings`: for a matched tool whose connector isn't yet connected for the workspace we can't know here (pure) → leave warnings empty in the pure layer; the ACTION layer (T3/wire) adds "connect X to enable" by checking the workspace's connected toolkits. Never throws.
- [ ] **Step 4: pass + typecheck 0 + check-use-server.** **Step 5: Commit.**

### Task 3: Fold bound tools into the bundle + surface
**Files:** Modify `src/lib/agents/generate/agent-bundle.ts` (the `assembleAgentBundle` return) + `tests/unit/agents/generate/agent-bundle.spec.ts`.
- [ ] **Step 1: Failing test** — `assembleAgentBundle({ skill:"social-poster", trigger:{kind:"schedule",...}, promptHint:"post weekly to Instagram" })` → `bundle.blueprint.connectors` contains the Postiz connector; a review-requester intent → no connectors. Existing assemble tests stay green.
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — in `assembleAgentBundle`, call `bindToolsForIntent(intent)` and set `blueprint.connectors = [...(base.connectors ?? []), ...bound.connectors]` (dedup); append `bound.warnings` to the bundle's `warnings`. Keep all existing behavior; non-tool agents get no connectors.
- [ ] **Step 4: pass + typecheck 0 + check-use-server + `pnpm build` exit 0.** **Step 5: Commit + Push L5.1.**

---

## PHASE L5.2 — Generation-time judge (maker ≠ checker)

### Task 4: `judgeGeneratedAgent` (DI'd, TDD)
**Files:** Create `src/lib/agents/generate/judge.ts` + spec.
- [ ] **Step 1: Failing test** (DI fake grader — no LLM)
```ts
import { judgeGeneratedAgent, applyJudgeFixes } from "../../../../src/lib/agents/generate/judge";
test("grader flags a wrong trigger → issue surfaced, low-risk fix applied", async () => {
  const bundle = { name:"X", description:"", blueprint:{ trigger:{kind:"inbound",channel:"voice"} }, warnings:[] };
  const grader = async () => ({ ok:false, issues:[{field:"trigger", problem:"sentence says 'after a booking' but trigger is inbound", fix:{ trigger:{kind:"event",event:"booking.completed",channel:"sms"} }}] });
  const r = await judgeGeneratedAgent({ sentence:"text customers after a booking", bundle }, { grader });
  assert.equal(r.ok, false); assert.equal(r.issues.length, 1);
  const fixed = applyJudgeFixes(bundle, r);
  assert.equal(fixed.blueprint.trigger.kind, "event");
});
test("grader throws → fail-open (ok:true, no issues, bundle unchanged)", async () => {
  const r = await judgeGeneratedAgent({ sentence:"x", bundle:{ blueprint:{} } }, { grader: async () => { throw new Error("llm down"); } });
  assert.equal(r.ok, true); assert.deepEqual(r.issues, []);
});
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — `export type JudgeIssue = { field: string; problem: string; fix?: Partial<AgentBlueprint> }`; `export type JudgeResult = { ok: boolean; issues: JudgeIssue[] }`; `export type AgentGrader = (args:{sentence:string; bundle:any}) => Promise<JudgeResult>`. `judgeGeneratedAgent({sentence,bundle},{grader})`: await grader; **fail-open** on throw/malformed → `{ok:true, issues:[]}`. `applyJudgeFixes(bundle, result)`: shallow-merge each `issue.fix` (only present low-risk fields: trigger/verify/guardrails/connectors — NOT the prompt) into `bundle.blueprint`, return a new bundle; issues without a `fix` are left for the user. Never throws.
- [ ] **Step 4: pass + typecheck 0.** **Step 5: Commit.**

### Task 5: Real grader + wire into `run-generate`
**Files:** Create `src/lib/agents/generate/judge-llm.ts` (NOT "use server") + modify `src/lib/agents/generate/run-generate.ts` + extend its spec. INVESTIGATE `getAnthropicClient` (`src/lib/ai/client.ts`) + how `classify-llm.ts` makes its Haiku call (mirror it).
- [ ] **Step 1: Failing test** — extend `run-generate.spec.ts`: `runGenerateAgentDraft` with a fake `judge` dep returning a trigger fix → the created template's blueprint reflects the fix; the returned warnings include the judge's un-fixed issues; no judge dep → today's behavior; a throwing judge → still creates (fail-open).
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — `makeLlmAgentGrader(deps)` in `judge-llm.ts`: a small strict Haiku JSON call ("Review this generated agent against the user's request. Return ONLY JSON {ok, issues:[{field,problem,fix?}]}. Allowed fix fields: trigger, verify, guardrails, connectors.") → parse defensively → `{ok:true,issues:[]}` on any failure. In `runGenerateAgentDraft`: after `assembleAgentBundle`, if `deps.judge` present → `const j = await judgeGeneratedAgent({sentence, bundle}, {grader: deps.judge}); bundle = applyJudgeFixes(bundle, j); warnings.push(...j.issues.filter(i=>!i.fix).map(i=>i.problem))`. Wire `deps.judge = makeLlmAgentGrader(...)` in `actions.ts` production (behind an env/flag default-on; fail-open keeps it safe).
- [ ] **Step 4: pass + typecheck 0 + check-use-server + build exit 0.** **Step 5: Commit + Push L5.2.**

---

## PHASE L5.3 — Brain-connected learning (the compounding loop)

### Task 6: `generator-lessons` over Brain loop-memory (TDD)
**Files:** Create `src/lib/agents/generate/generator-lessons.ts` + spec. Reuse `src/lib/agents/memory/agent-memory.ts` (`recall/recordAgentMemory`, `AgentMemoryStore`) + `brain-memory-store.ts`.
- [ ] **Step 1: Failing test** (DI fake store)
```ts
import { recordGeneratorLesson, recallGeneratorLessons, lessonsToPromptHint } from "../../../../src/lib/agents/generate/generator-lessons";
test("record then recall a lesson for an org; render as a prompt hint", async () => {
  const store = makeFakeStore();
  await recordGeneratorLesson(store, { orgId:"o1", lesson:{ pattern:"after a booking", mistake:"chose inbound", correction:"use event booking.completed" } });
  const ls = await recallGeneratorLessons(store, { orgId:"o1" });
  assert.equal(ls.length, 1);
  assert.match(lessonsToPromptHint(ls), /booking\.completed/);
});
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — key `generator-lessons/<orgId>` (or agentKey `_generator`, subjectKey `lessons`), reuse `record/recallAgentMemory` with `entry.kind="generator_lesson"`, `data:{pattern,mistake,correction}`. `lessonsToPromptHint(lessons)` → a short bulleted "Past corrections to honor:" string for injection. Never throws.
- [ ] **Step 4: pass + typecheck 0.** **Step 5: Commit.**

### Task 7: Record judge findings + post-generate edits; recall into the next generation
**Files:** Modify `run-generate.ts` (record + recall) + `actions.ts` (add `recordGeneratorEditAction({ agentTemplateId, before, after })`) + the editor (`editor-client.tsx`) to fire it when the user saves edits shortly after a `?new=1` generate. Extend specs.
- [ ] **Step 1: Failing test** — `runGenerateAgentDraft` with a `lessonsStore` dep: recalled lessons are passed into BOTH the classify call (via `parseAgentIntent` deps) and the judge prompt; after a judge with an applied fix, a `generator_lesson` is recorded (the fix becomes a lesson). A `recordGeneratorEditAction` test: a post-generate edit that changes the trigger records a lesson `{pattern: sentence-feature, mistake: generated, correction: edited}`.
- [ ] **Step 2: fail.**
- [ ] **Step 3: Implement** — in `runGenerateAgentDraft`: `const lessons = await recallGeneratorLessons(deps.lessonsStore, {orgId})` → pass `lessonsToPromptHint(lessons)` into the classifier (extend `classify-llm` to accept an optional `priorLessons` string) + the judge prompt; after applying judge fixes, `recordGeneratorLesson(...)` for each fix. `recordGeneratorEditAction` ("use server"): assertWritable → getOrgId → diff before/after blueprint trigger/skill/channel → record a lesson. The editor fires it on first save after `?new=1`. All guarded/fail-soft (lessons never break generation).
- [ ] **Step 4: pass + typecheck 0 + check-use-server + build exit 0.** **Step 5: Commit.**

### Task 8: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (report 0) · the generate + memory suites pass · `check-use-server` clean · **`pnpm build` exit 0**. Push. Smoke: describe *"post a weekly Instagram highlight of our 5-star reviews"* → the generated agent has a schedule trigger + a Postiz connector bound + (if Postiz unconnected) a "connect Postiz" warning; describe an after-booking review agent → no bad trigger (the judge fixes it); regenerate after correcting one → the lesson is honored.

---

## Self-Review
- **Spec coverage:** L5.1 tool-binding = T1 catalog + T2 bind + T3 fold-into-bundle ✓ · L5.2 judge = T4 judge/applyFixes + T5 real grader+wire ✓ · L5.3 Brain learning = T6 lessons store + T7 record-judge-findings+post-generate-edits + recall-into-next-gen ✓ · verify T8.
- **Placeholder scan:** each task has exact paths + test code + the contract; INVESTIGATE-flags only on genuinely-codebase-specific shapes (the Composio toolkit slugs, the Postiz connector kind, the `blueprint.connectors` entry shape) — the implementer reads those, not invents them. ✓
- **Type consistency:** `ToolCatalogEntry`, `findToolsByKeywords`, `bindToolsForIntent`→`{connectors,warnings}`, `JudgeIssue`/`JudgeResult`/`AgentGrader`, `judgeGeneratedAgent`/`applyJudgeFixes`, `recordGeneratorLesson`/`recallGeneratorLessons`/`lessonsToPromptHint` — consistent across tasks. ✓
- **Risk:** T1's Postiz/Composio slugs MUST come from reading the catalog (don't invent). T5's judge is an LLM cost — Haiku + fail-open + flag-gated. T7 lessons reuse L1 memory (no new table). All fail-open so generation never breaks.
