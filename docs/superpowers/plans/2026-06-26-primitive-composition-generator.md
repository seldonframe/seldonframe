# Primitive-Composition Agent Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the template-picker generator with one that **composes from primitives** — the LLM authors the skill + declares trigger/channel/tools as structured output, SF's thin harness wires safety deterministically, so a genuinely new agent type (e.g. a weekly social poster) falls out of one sentence.

**Architecture:** Additive to the existing `src/lib/agents/generate/` pipeline. A new **author** (`authorAgentDraft`, LLM structured-output, fail-soft) produces an `AuthoredAgent`; a new **composer** (`composeBundleFromAuthored`) wires SF's shape-based guardrails/verify/state + binds the declared tools + always appends SF's canonical ground rules. `run-generate` runs the author path first and **falls back to the existing `parseAgentIntent → assembleAgentBundle`** (the patched heuristic) when there's no LLM/it fails — so generation never blocks and the tested template path stays the floor. L5's judge + lessons ride on top. A new `channel:"none"` makes action-only (post/log) agents real.

**Tech Stack:** Next.js 16 / React 19, `node --import tsx --test`, `getAnthropicClient` (Haiku/Sonnet) via the L5 `classify-llm`/`judge-llm` structured-output pattern, the L5 `tool-catalog`/`bind-tools`, Brain loop-memory (`generator-lessons`), `STARTER_TEMPLATES` as few-shot examples.

**Conventions:** verify from **inside `packages/crm`**: `npx tsc --noEmit -p tsconfig.json` (gate on **0** error TS), `node --import tsx --test <spec>`, `bash scripts/check-use-server.sh src`, `pnpm build` at phase boundaries. Commit per task; push per phase through the build+typecheck-0 gate. Work in `icp3-wedge`.

**Spec:** `docs/superpowers/specs/2026-06-26-primitive-composition-generator-design.md`.

## File Structure
- `src/lib/agents/generate/authored-agent.ts` (new) — `AuthoredAgent` types + `authorAgentDraft` seam (DI'd author fn, fail-soft → null). Pure.
- `src/lib/agents/generate/author-llm.ts` (new) — the real structured-output author (`getAnthropicClient`, NOT "use server"). 
- `src/lib/agents/generate/shape-defaults.ts` (new) — `defaultGuardrailsForShape` / `defaultRubricForShape` / `SF_GROUND_RULES`. Pure.
- `src/lib/agents/generate/compose-authored.ts` (new) — `composeBundleFromAuthored`. Pure.
- `src/lib/agents/triggers/agent-trigger.ts` (modify) — `EventChannel` gains `"none"`.
- `src/lib/agents/triggers/run-event-agent.ts` (modify) — `channel:"none"` → tool-only send path.
- `src/lib/agents/generate/run-generate.ts` + `actions.ts` (modify) — author-first path + fallback + wire the real author.
- `src/lib/agents/generate/judge-llm.ts` (modify, P3) — prose-safety lens.
- `src/lib/agents/generate/tool-catalog.ts` + the editor (modify, P4) — one shared Apps & tools catalog.
- Tests under `tests/unit/agents/generate/` + `tests/unit/agents/triggers/`.

---

## PHASE P1 — The author + the composer

### Task 1: `AuthoredAgent` types + the `authorAgentDraft` seam (pure, TDD)
**Files:** Create `src/lib/agents/generate/authored-agent.ts` + `tests/unit/agents/generate/authored-agent.spec.ts`. INVESTIGATE: `agent-trigger.ts` (`AgentTrigger`, `EventChannel`, `KNOWN_EVENTS`) + `tool-catalog.ts` (`TOOL_CATALOG` ids).
- [ ] **Step 1: failing test**
```ts
import { authorAgentDraft, normalizeAuthoredAgent } from "../../../../src/lib/agents/generate/authored-agent";
test("a valid author dep result is normalized + returned", async () => {
  const draft = await authorAgentDraft("post weekly to instagram", { author: async () => ({
    name:"Weekly IG", summary:"posts weekly", skillMd:"Each Monday, post...", 
    trigger:{kind:"schedule", cron:"0 9 * * 1"}, channel:"none", tools:["postiz"] }) });
  assert.equal(draft?.name, "Weekly IG"); assert.equal(draft?.channel, "none");
  assert.deepEqual(draft?.tools, ["postiz"]);
});
test("no author dep → null (caller falls back to heuristic)", async () => {
  assert.equal(await authorAgentDraft("x", {}), null);
});
test("author throws or returns garbage → null (fail-soft)", async () => {
  assert.equal(await authorAgentDraft("x", { author: async () => { throw new Error("down"); } }), null);
  assert.equal(await authorAgentDraft("x", { author: async () => ({}) }), null); // missing required fields
});
test("normalizeAuthoredAgent clamps: unknown tool ids dropped, bad trigger → resolveAgentTrigger, channel default", () => {
  const a = normalizeAuthoredAgent({ name:"", summary:"", skillMd:"do it", trigger:{kind:"nonsense"}, channel:"weird", tools:["postiz","made_up"] });
  assert.ok(a); assert.deepEqual(a!.tools, ["postiz"]); // unknown dropped
  assert.ok(["inbound","event","schedule"].includes(a!.trigger.kind));
});
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — `export type AuthoredTrigger = { kind:"inbound"|"event"|"schedule"; event?:string; cron?:string; cadenceLabel?:string }`; `export type AuthoredAgent = { name:string; summary:string; skillMd:string; trigger:AgentTrigger; channel: EventChannel|"none"; tools:string[]; knowledgeHints?:{reviewUrl?:string} }`; `export type AgentAuthor = (sentence:string, priorLessons?:string) => Promise<unknown>`. `normalizeAuthoredAgent(raw): AuthoredAgent|null` — require non-empty `skillMd` (the playbook) else null; clamp trigger via `resolveAgentTrigger`; channel must be a valid `EventChannel` or `"none"` (else default by trigger kind: schedule→"none", event→"sms", inbound→"chat"); `tools` filtered to known `TOOL_CATALOG` ids (drop unknown, dedupe); name falls back to a humanized slug if blank. `authorAgentDraft(sentence, deps:{author?:AgentAuthor; priorLessons?:string})`: no author → null; else `await deps.author(...)` → `normalizeAuthoredAgent`; **fail-soft** (throw/garbage → null). Never throws.
- [ ] **Step 4: pass + tsc 0 + check-use-server.** **Step 5: commit** `feat(generate): AuthoredAgent types + authorAgentDraft seam (rebuild P1 T1)`.

### Task 2: the real structured-output author (`author-llm.ts`)
**Files:** Create `src/lib/agents/generate/author-llm.ts` (NOT "use server") + spec. INVESTIGATE `classify-llm.ts` + `judge-llm.ts` (the `getAnthropicClient` call, model-at-call-time, fence-strip, defensive parse, fail-soft) — MIRROR them. Use `STARTER_TEMPLATES` (name/summary/blueprint.customSkillMd) as few-shot examples + `TOOL_CATALOG` (id+label+what) as the tool menu.
- [ ] **Step 1: failing test** — `makeLlmAgentAuthor({ getClient })` returns an `AgentAuthor`; with a fake client returning a valid AuthoredAgent JSON → resolves that object; malformed JSON / null client → returns something `normalizeAuthoredAgent` maps to null (i.e. the author is allowed to return raw; the seam normalizes). Assert the system prompt includes the tool catalog labels + at least one starter example + (when passed) the `priorLessons` string.
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — `makeLlmAgentAuthor(deps?): AgentAuthor`: a strict prompt — *"You design an automated agent for a local business from one sentence. Return ONLY JSON {name, summary, skillMd, trigger:{kind,event?,cron?,cadenceLabel?}, channel, tools:[...]}. skillMd is the agent's full playbook in the SeldonFrame house style (see examples). channel is sms|email|digest|voice|chat or 'none' if it only acts via tools and sends no message. tools are from this menu: <catalog>. Examples: <2-3 starters>. Past corrections to honor: <priorLessons>."* Model at call time (`ANTHROPIC_AUTHOR_MODEL || "claude-haiku-4-5"` — or Sonnet if you judge authoring needs it; default Haiku). Defensive parse → return the parsed object (the seam's `normalizeAuthoredAgent` validates). Any failure → return `{}` (→ null downstream). Mirror classify-llm's client/parse exactly.
- [ ] **Step 4: pass + tsc 0 + check-use-server (author-llm NOT "use server").** **Step 5: commit.**

### Task 3: shape-based safety defaults + canonical ground rules (`shape-defaults.ts`, pure, TDD)
**Files:** Create `src/lib/agents/generate/shape-defaults.ts` + spec. INVESTIGATE `default-rubrics.ts` (`defaultRubricForSkill`, the channel-aware cap sms 320/email 5000) + `agent-guardrails.ts` (`defaultGuardrailsForSkill`, the `Guardrails` shape) — generalize them from skill-keyed to shape-keyed.
- [ ] **Step 1: failing test**
```ts
import { defaultGuardrailsForShape, defaultRubricForShape, SF_GROUND_RULES } from "../../../../src/lib/agents/generate/shape-defaults";
test("a customer-messaging schedule/sms agent gets quiet hours + caps; an action-only (channel none) agent gets caps but NO quiet hours / length cap", () => {
  const g1 = defaultGuardrailsForShape({ kind:"schedule", channel:"sms" });
  assert.ok(g1.quietHours); // messages a person
  const g2 = defaultGuardrailsForShape({ kind:"schedule", channel:"none" });
  assert.equal(g2.quietHours, undefined); // posts, doesn't message
});
test("rubric for channel none skips the SMS length cap; email keeps the long cap", () => {
  assert.equal(defaultRubricForShape({ kind:"schedule", channel:"none" }).checks.some(c=>c.kind==="max_length"), false);
});
test("SF_GROUND_RULES is a non-empty canonical safety block", () => { assert.ok(SF_GROUND_RULES.includes("Never invent")); });
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — `defaultGuardrailsForShape(trigger:{kind,channel})`: kill-switch always; a **customer-messaging** shape (channel sms/email + outbound/scheduled/event) → quiet hours 21–8 + per-contact 30-day + a daily cap (mirror review-requester defaults); a **time-critical** lead shape → no quiet hours; an **action-only** (`channel:"none"`) or inbound shape → daily cap only, no quiet hours / per-contact. `defaultRubricForShape(...)`: no-unfilled-`{` always; `max_length` only for sms/email (channel-aware cap from default-rubrics); a `must_not_fabricate`-style note for action-only. `SF_GROUND_RULES`: the canonical never-invent-facts / honest-range / read-back-before-booking / escalate block (lift the shared prose from the starters' ground-rules section) — the composer always appends this so safety never depends on the LLM authoring it.
- [ ] **Step 4: pass + tsc 0.** **Step 5: commit.**

### Task 4: `composeBundleFromAuthored` (pure, TDD)
**Files:** Create `src/lib/agents/generate/compose-authored.ts` + spec. Uses `AuthoredAgent` (T1), `shape-defaults` (T3), `bindToolsForIntent`/the catalog (L5.1), `AgentBundle` (agent-bundle.ts).
- [ ] **Step 1: failing test**
```ts
import { composeBundleFromAuthored } from "../../../../src/lib/agents/generate/compose-authored";
test("authored social poster → bundle with authored skill + SF ground rules appended + schedule trigger + Postiz bound + no quiet hours", () => {
  const b = composeBundleFromAuthored({ name:"Weekly IG", summary:"x", skillMd:"Each Monday post our best review to Instagram.", trigger:{kind:"schedule",cron:"0 9 * * 1",channel:"none"}, channel:"none", tools:["postiz"] });
  assert.equal(b.name, "Weekly IG");
  assert.match(b.blueprint.customSkillMd!, /Each Monday/);          // authored prose
  assert.match(b.blueprint.customSkillMd!, /Never invent/);          // SF ground rules appended
  assert.ok(b.blueprint.connectors?.some(c=>c.id==="postiz"));       // tool bound
  assert.equal(b.blueprint.guardrails?.quietHours, undefined);       // action-only
});
test("authored review-style email agent → email length cap + reviewUrl wired from knowledgeHints", () => { /* … */ });
```
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — `composeBundleFromAuthored(authored, ctx?): AgentBundle`: `blueprint.trigger = resolveAgentTrigger(authored.trigger)`; `blueprint.customSkillMd = authored.skillMd.trim() + "\n\n" + SF_GROUND_RULES` (always append — the thin-harness safety floor); `blueprint.guardrails = defaultGuardrailsForShape(...)`; `blueprint.verify = defaultRubricForShape(..., {reviewUrl})`; bind `authored.tools` → `ConnectorBinding[]` (map each catalog id to its binding, reuse the L5.1 binder/catalog); `reviewUrl` from `ctx ?? authored.knowledgeHints`; channel `"none"` recorded on the trigger. `name`/`description` from authored. Warnings: a tool the sentence implies but the workspace hasn't connected (action layer), "review before publishing" if skillMd is very short. Pure; never throws.
- [ ] **Step 4: pass + tsc 0 + check-use-server.** **Step 5: commit.**

### Task 5: wire the author-first path into `run-generate` + `actions` (+ build, push P1)
**Files:** Modify `run-generate.ts` + `actions.ts` + extend `generate-action.spec.ts`. INVESTIGATE the current `runGenerateAgentDraft` (the assemble + judge + lessons flow from L5).
- [ ] **Step 1: failing test** — `runGenerateAgentDraft` with an `author` dep returning an AuthoredAgent → the created template uses the **composed** bundle (authored skillMd present); with NO author dep → falls back to the existing `parseAgentIntent → assembleAgentBundle` path (today's behavior, a baseline assertion); an author that fails-soft (→null) → also falls back; the **judge + lessons still run** on the composed bundle (a fake judge fix is applied; a lesson recorded).
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — add `author?: AgentAuthor` to deps. New flow: `const authored = await authorAgentDraft(sentence, { author: deps.author, priorLessons }); let bundle = authored ? composeBundleFromAuthored(authored, ctx) : assembleAgentBundle(await parseAgentIntent(sentence, { classify: deps.classify, priorLessons }), ctx);` then the **existing** judge + lessons steps unchanged. `actions.ts`: wire `author: process.env.SF_GENERATOR_AUTHOR === "off" ? undefined : makeLlmAgentAuthor()` (default-ON, fail-soft to the heuristic path, so a missing key still generates).
- [ ] **Step 4: pass + tsc 0 + check-use-server + `pnpm build` exit 0.** **Step 5: commit + push P1.** Smoke: *"Post a weekly Instagram highlight of our 5-star reviews"* → an authored agent named for the ask, schedule trigger, channel none, Postiz bound, an authored playbook (NOT the review template) + SF ground rules.

---

## PHASE P2 — `channel:"none"` action-only runtime

### Task 6: action-only channel + tool-only send path
**Files:** Modify `agent-trigger.ts` (`EventChannel` + `resolveAgentTrigger`) + `run-event-agent.ts` + specs. INVESTIGATE `run-event-agent.ts` — the send path (`sendSmsFromApi`/`sendEmailFromApi`) + where the channel decides the surface.
- [ ] **Step 1: failing test** — `resolveAgentTrigger({kind:"schedule", channel:"none"})` keeps `channel:"none"` (valid now); `runEventAgent` for a channel-`"none"` agent runs the skill + invokes bound tools and **does NOT call sendSms/sendEmail** (assert via DI fakes: the tool runner is called, the messaging seam is not); guardrails/verify still gate; a memory record is written. A normal sms/email agent path is unchanged.
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — add `"none"` to `EventChannel`; `resolveAgentTrigger` accepts it (don't clamp it away). In `run-event-agent`, branch on `trigger.channel === "none"`: skip the customer-message compose/send; instead run the agent's bound tools (the connector/tool-invoke seam — reuse the runtime tool merge from the connectors work) with the skill as context; record the run. Keep throttle/guardrails/verify ordering (verify a tool-only run against its rubric — which has no length cap). If the full tool-invocation runtime is heavier than this phase warrants, ship the **send-suppression** (channel none → no customer message + a `posted`/`action` memory record + a clear "connect <tool> to post" warning when unbound) and note the live tool-fire as a P2.1 follow-up — but never silently send a customer message for an action-only agent.
- [ ] **Step 4: pass + tsc 0 + check-use-server + build exit 0.** **Step 5: commit + push P2.**

---

## PHASE P3 — Judge prose-safety lens + author-fed lessons

### Task 7: judge reviews authored prose + lessons teach the author
**Files:** Modify `judge-llm.ts` (the grader prompt) + `run-generate.ts` (pass `priorLessons` into the author — already threaded for classify in L5.3; extend to the author) + specs.
- [ ] **Step 1: failing test** — a judge grader that receives an authored bundle whose `skillMd` instructs unsafe behavior (e.g. "quote a firm price") returns an issue with `field:"skill"` + NO `fix` (flag-only) → it surfaces in warnings and the prose is NOT rewritten (allowlist still excludes prose). The author receives `priorLessons` (assert the author dep is called with the recalled hint string).
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — extend the judge system prompt to also check the authored `skillMd` for safety violations (fabricated prices/facts/reviews, skipping read-back, over-promising) and emit `field:"skill"` issues **without a fix** (the existing `applyJudgeFixes` allowlist already excludes prose, so these stay flag-only → warnings). In `run-generate`, thread the recalled `lessonsToPromptHint` into `authorAgentDraft` (so the author, not just the classifier, learns). No new allowlist field.
- [ ] **Step 4: pass + tsc 0 + check-use-server + build exit 0.** **Step 5: commit + push P3.**

---

## PHASE P4 — One Apps & tools catalog + clarity

### Task 8: shared catalog + name/list clarity + verify/push
**Files:** Modify `tool-catalog.ts` (ensure each entry has the operator-facing `label` + `whatItDoes` the author prompt AND the editor render from) + the editor "Apps & tools" section to render from that same catalog (no hardcoded chip list) + the agents-list to show the authored name + trigger chip. INVESTIGATE the editor chip list (from the patch) + the agents-list row.
- [ ] **Step 1: failing test** — a pure test: `toolCatalogForUi()` returns the same ids the author menu uses (one source of truth); the author-prompt catalog string and the UI list are both derived from `TOOL_CATALOG` (assert they reference the same ids). (Editor render is light — a render/snapshot or a pure selector test.)
- [ ] **Step 2: fail.**
- [ ] **Step 3: implement** — make `TOOL_CATALOG` the single source: a `toolCatalogForUi()` selector the editor maps over (replacing the patch's hardcoded chips), and the author-llm builds its menu string from the same array. Ensure the agents list shows the authored `name` + a trigger chip (`triggerLabel`). Drop any remaining "Composio" user-facing string.
- [ ] **Step 4: pass + tsc 0 + check-use-server + `pnpm build` exit 0.** **Step 5: commit + push P4.** Final smoke (report to Max, don't self-run live): describe 3 different agents (a weekly IG poster, an after-booking review SMS, a new-lead responder) → three genuinely different authored agents, each with the right trigger/channel/tools/name, each safe.

---

## Self-Review
- **Spec coverage:** §1 author = T1(seam)+T2(LLM) ✓ · §2 thin-harness composer = T3(shape safety)+T4(compose) ✓ · §3 judge/lessons = T7 ✓ · §4 channel:"none" = T6 ✓ · §5 heuristic fallback = T5 (author-first, assemble fallback) ✓ · Apps&tools catalog = T8 ✓.
- **Placeholder scan:** each task has exact paths + test code + contracts; INVESTIGATE-flags only on real codebase shapes (the send path in run-event-agent, the Guardrails/Rubric shapes, the editor chip list). T6 explicitly bounds scope (send-suppression minimum, live-tool-fire as P2.1) rather than hand-waving "wire the runtime". ✓
- **Type consistency:** `AuthoredAgent`/`AuthoredTrigger`/`AgentAuthor`, `authorAgentDraft`/`normalizeAuthoredAgent`, `makeLlmAgentAuthor`, `defaultGuardrailsForShape`/`defaultRubricForShape`/`SF_GROUND_RULES`, `composeBundleFromAuthored` — consistent across tasks; `EventChannel|"none"` used uniformly. ✓
- **Risk:** the author is additive + fail-soft to the patched heuristic path (T5) → zero regression if the LLM/key is absent. Safety stays deterministic (T3 ground rules always appended, shape-based guardrails, judge can't rewrite prose). T6's `channel:"none"` is the one runtime change — bounded to send-suppression minimum so it can't mis-send.
