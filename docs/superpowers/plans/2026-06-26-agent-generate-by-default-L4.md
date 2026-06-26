# Agent Loop — L4 Generate-by-Default Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** One English sentence → a complete, safe agent. The builder takes *"text every customer for a Google review the day after their job — never twice, only if the job was completed"* and emits a full `AgentBlueprint`: **trigger + skill + channel + verify rubric + guardrails + state (always on)**. Error-proofing is generated *with* the agent, not bolted on.

**Architecture — the elegant split:** the LLM only **classifies** the sentence into a small structured `AgentIntent` (skill, trigger, channel, a few hints). A **pure deterministic assembler** (`assembleAgentBundle`) then wires every safety primitive from SeldonFrame's own defaults — `defaultRubricForSkill` (L2), `defaultGuardrailsForSkill` (L3), `triggerFromSurface`/the trigger model (P1), state always-on (L1). The LLM never hand-writes guardrails or rubrics (unreliable); it picks the skill, and SF supplies the error-proofing. A server action wires parse→assemble→draft; a builder UI does describe→generate→review→save.

**Spec:** `docs/superpowers/specs/2026-06-25-unified-agent-model-design.md` (Post-P1 → generate-by-default). Builds on P1 (trigger) + L1 (state) + L2 (verify) + L3 (guardrails).

**Conventions:** verify `pnpm -C packages/crm typecheck` (0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### Task T1: `assembleAgentBundle` — pure deterministic assembler (TDD)
**Files:** Create `src/lib/agents/generate/agent-bundle.ts` + `tests/unit/agents/generate/agent-bundle.spec.ts`.
- [ ] Define:
  ```ts
  export type AgentIntent = {
    skill: string;                       // "review-requester" | "speed-to-lead" | "receptionist" | <free>
    trigger: AgentTrigger;               // from agent-trigger.ts (the LLM/heuristic picks kind+event+channel)
    name?: string;
    description?: string;
    promptHint?: string;                 // a sentence of extra instruction to fold into the skill prompt
    businessHints?: { reviewUrl?: string };
  };
  export type AgentBundle = {
    name: string; description: string;
    blueprint: AgentBlueprint;           // trigger + verify + guardrails + (skill prompt) all populated
    warnings: string[];                  // e.g. "no review URL provided — set it before going live"
  };
  export function assembleAgentBundle(intent: AgentIntent, ctx?: { reviewUrl?: string; contactNameSample?: string }): AgentBundle;
  ```
  - Wire `blueprint.trigger = resolveAgentTrigger(intent.trigger)`; `blueprint.verify = intent.verify ?? defaultRubricForSkill(intent.skill, { reviewUrl: ctx?.reviewUrl })`; `blueprint.guardrails = defaultGuardrailsForSkill(intent.skill)`; `blueprint.reviewUrl = ctx?.reviewUrl` when given; fold `promptHint` into the skill's base prompt (reuse the STARTER_TEMPLATES blueprint for the skill as the base when one exists — grep `STARTER_TEMPLATES`). `warnings`: review-requester with no reviewUrl → a warning; unknown skill → a warning + a minimal safe default (inbound chat, generic guardrails). Pure, never throws.
- [ ] Tests: review-requester intent → bundle whose blueprint has the event trigger + a verify rubric + review-requester guardrails (quiet hours), and a warning when no reviewUrl; speed-to-lead intent → lead.created trigger + no-quiet-hours guardrails; an unknown skill → safe inbound default + warning; `promptHint` is folded into the prompt. Verify (test + typecheck + check-use-server). Commit.

### Task T2: `parseAgentIntent` — the classifier seam + heuristic fallback (TDD)
**Files:** Create `src/lib/agents/generate/parse-intent.ts` + spec.
- [ ] Define `parseAgentIntent(sentence: string, deps: { classify?: (sentence: string) => Promise<Partial<AgentIntent>> }): Promise<AgentIntent>`:
  - First run a **pure heuristic** `heuristicIntent(sentence)` (exported, tested): keyword → skill/trigger/channel — e.g. /review/i → `review-requester` + `{kind:"event",event:"booking.completed",channel:"sms"}`; /lead|inquiry|missed call/i → `speed-to-lead` + `lead.created`; /call|answer the phone|receptionist/i → `receptionist` + `{kind:"inbound",channel:"voice"}`; pull an `https?://...` as `businessHints.reviewUrl`; /email/i → channel email. Default → receptionist inbound chat.
  - If `deps.classify` is supplied, call it and MERGE over the heuristic (LLM wins on the fields it returns; heuristic fills gaps). A classify throw → fall back to the heuristic only (never throw).
  - Always return a complete `AgentIntent` (heuristic guarantees all required fields).
- [ ] Tests (pure heuristic + DI fake classify): "ask customers for a google review" → review-requester/event/sms; "instantly text new leads" → speed-to-lead/lead.created; "answer my phone" → receptionist/inbound/voice; a sentence with a URL → reviewUrl captured; classify override wins; classify throw → heuristic result. Verify. Commit.

### Task T3: `generateAgentDraftAction` (server action)
**Files:** `src/lib/agent-templates/actions.ts` (or a new `generate-actions.ts`) + reuse the existing create-template path.
- [ ] `generateAgentDraftAction({ sentence }, _deps?)`: assertWritable → getOrgId → `parseAgentIntent(sentence, { classify: <real LLM classify via getAnthropicClient, structured JSON> })` → `assembleAgentBundle(intent, { reviewUrl })` → create a NEW agent template from the bundle (reuse `createTemplateFromStarter`/`createAgentTemplate` — whatever the existing create path is) → return `{ ok, templateId, warnings }`. The LLM classify is a small, strict JSON call (skill/trigger/channel only — low cost, low risk); on any failure it falls back to the heuristic (the action still succeeds). Org-guard + revalidate like the other template actions. Test the pure orchestration with DI fakes (no real LLM/DB). Verify (incl. build). Commit.

### Task T4: Builder UI — "Describe your agent"
**Files:** the Agents Studio new-agent surface (grep the starter-pack section / `studio/agents`).
- [ ] Add a prominent **"Describe your agent in one sentence"** input at the top of the new-agent flow: a textarea + "Generate" button → calls `generateAgentDraftAction` → on success routes to the new template's editor with the warnings shown as a banner ("Set the review URL before going live"). Keep the starter-pack + manual create as the fallback below. Match existing Studio chrome. Verify (typecheck + check-use-server + build). Commit. **Push.**

### Task T5: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (0) · generate + guardrails + verify + trigger + memory suites green · `check-use-server` clean · **`pnpm build` exit 0**. Push. Smoke: type "text every customer for a Google review the day after their job" → a Review-requester agent is created with the event trigger, the review rubric, review-requester guardrails (quiet hours + 30-day per-contact), state on, and a "set your review URL" warning — all from one sentence.

---

## Self-Review
- **Spec coverage (generate-by-default):** sentence → full bundle with EVERY primitive, the LLM only classifies + SF's deterministic defaults supply error-proofing (T1+T2) · server action (T3) · the one-sentence builder UI (T4). ✓
- **Type consistency:** `AgentIntent`, `AgentBundle`, `assembleAgentBundle`, `heuristicIntent`/`parseAgentIntent`, `generateAgentDraftAction`; reuses `resolveAgentTrigger`/`defaultRubricForSkill`/`defaultGuardrailsForSkill`/`STARTER_TEMPLATES`. ✓
- **Risk flag:** the LLM classify must be a SMALL strict JSON call with a hard heuristic fallback — never block agent creation on the LLM. The assembler is pure + supplies all safety, so even a misclassified skill yields a SAFE (guard-railed, verified) agent. T3's real LLM wiring uses `getAnthropicClient` (BYOK/platform) — keep it cheap + fail-soft.
- **Non-goals:** multi-step/branching agents; editing the generated rubric/guardrails in the UI beyond what the existing editor already exposes (the generate step seeds them; fine-tuning is the editor's job).
