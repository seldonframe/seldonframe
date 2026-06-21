# AI-Assisted Agent Builder (slice 1) — Design

**Date:** 2026-06-21
**Branch:** `feature/telephony-provisioning` (docs ride along; the build branch is decided at plan time)
**Status:** Design — for review, then `writing-plans`.
**Strategy:** `docs/strategy/2026-06-20-agents-platform-strategy.md` §4c (the 6 primitives + generate-from-English) · memory `agent-builder-primitives`.

---

## Goal

**Anybody with an LLM key builds, tests, and is ready to deploy an agent in minutes.** Turn the voice-receptionist-specific builder at `/studio/agents/[id]` into a generic, **AI-assisted** builder where the user **describes the agent in plain English and SeldonFrame drafts the whole thing** — persona, tools, guardrails, FAQ — for them to review, tweak, test, and deploy.

The north-star moment: a non-technical operator types *"Answer my HVAC company's phone, book jobs, and text a quote range — never quote a firm price,"* and 10 seconds later they're looking at a complete, editable, testable agent.

---

## Scope (slice 1) — and what's explicitly deferred

**In:**
1. **Surface as a first-class primitive** — start with **voice + web-chat** (both runtimes already exist). Surface picker on create; the editor adapts copy/fields to the chosen surface.
2. **Generate-from-English** — the centerpiece. A prompt box drafts the blueprint (SKILL.md persona + greeting + tool selection + FAQ stubs) in SeldonFrame's house style. Review/edit, never a black box.
3. **Generalized editor** — the current 5 voice-specific sections become surface-aware, organized as the 6 primitives, with the generate box on top.
4. **Templates** — 2–3 surface presets as starting points (Voice receptionist exists; add Web chat; SMS-responder if cheap).

**Deferred (explicit follow-ons, not this slice):** the MCP connector directory (tools stay the native allowlist for now), Brain v2, email/SMS/DM *runtimes*, per-deployment OAuth/tool-binding, marketplace listing, auto-**running** evals (we generate eval *tasks* as a stub but keep the existing manual eval path).

---

## The 6 primitives (recap; this slice touches 1–3, 5–6)
Surface · **Skill** (SKILL.md) · **Tools** (native allowlist) · Knowledge (FAQ today) · **Guardrails** (prose + native quote-guard) · **Voice/Format**. The generic builder = these six sections; the generator fills them.

---

## Data model

`agent_templates` already stores `type`, `blueprint` (AgentBlueprint jsonb), `status`, `slug`. Minimal change:

- **Generalize `AgentTemplateType`** from `"voice_receptionist"` to a small union: `"voice_receptionist" | "chat_assistant"` (room to grow). Keep it as the *template type* (a surface + default-bundle preset).
- Add a **`surface`** notion. Two clean options (decide in plan): (a) derive surface from `type` (voice_receptionist→voice, chat_assistant→chat) — **zero schema change, recommended for slice 1**; or (b) add an explicit `blueprint.surface` field. Recommendation: **(a)** — `type` *is* the surface preset in v1; revisit when a surface gains multiple templates.
- `buildDefaultTemplateBlueprint(type)` gains a **chat** branch (chat default capabilities + greeting; no TTS voice).

No new table, no migration if we go with (a). `AgentBlueprint` already has every field the generator writes (`customSkillMd`, `greeting`, `capabilities`, `faq`, `voice`, `quoteRanges`, `pricingFacts`).

---

## The generator (centerpiece)

**New server action** `generateAgentDraftAction({ prompt, surface, businessContext? })` → returns a **draft blueprint patch** (not persisted): `{ customSkillMd, greeting, capabilities[], faq[], suggestedGuardrails }`.

- **House-style system prompt** — the meta-prompt encodes SeldonFrame's hard-won playbook so every draft is world-class by default: the voice-R1 anti-hallucination rules (never state a firm price → `get_quote_range`; enforced read-back of booking details; `take_message` safe-exit; the deterministic-vs-LLM boundary — the LLM narrates only constrained tool returns). This is the defensible core: a novice's sentence → an expert's agent.
- **Tool selection** — the model picks from the **native capability allowlist** (the 8 today) given the intent; output validated against the allowlist (drop anything not in it).
- **Output contract** — the model returns structured JSON validated by a zod schema; on parse failure, one retry, then a graceful "couldn't generate, here's a blank template" fallback. The blueprint patch reuses the **existing** `TemplateBlueprintPatchSchema` allowlist (extended with the surface-appropriate fields).
- **LLM key** — reuse the existing key resolution (builder BYOK via `builder_llm_keys` / `organizations.integrations.anthropic`, the same path the chatbot + `stateless-turn` use). If no key configured → the action returns `needs_key` and the UI shows the one-time "add your LLM key" step (this is the "anybody with an LLM key" gate, made friendly).
- **DI for testability** — the LLM call is behind an injected `complete(prompt)` dep so unit tests run with a fake (assert the prompt-build + the parse/validate/allowlist-filter pure logic; never a live call in unit tests — matches the repo's voice harness).
- **Pure logic, TDD'd:** building the house-style prompt from (intent + surface), parsing/validating the model JSON, filtering tools to the allowlist, and mapping the result to a `TemplateBlueprintPatch`.

Optional within the same call (cheap, keep if it doesn't bloat): a few **eval task** stubs derived from the intent ("a caller asks to book next Tuesday → expect `book_appointment`"). Stored for the existing eval surface; **running** them stays the current manual path this slice.

---

## UI / UX (the heart of this slice — "super easy")

**Design principle: AI-first, progressive disclosure, never a blank page.**

### 1. Create — "Describe your agent"
The new-agent entry (`new-agent-button.tsx` → a create screen) leads with **one big prompt box**:
> *"What should your agent do?"* — placeholder: *"Answer my plumbing company's phone, book jobs, and text customers a quote range…"*

Below it: a **surface chooser** (Voice · Web chat — two cards with icons) and a quiet secondary link *"or start from a template."* Primary CTA: **Generate**. That's the whole create screen — one sentence + one choice.

### 2. Generate → the builder fills itself
On Generate: spinner with honest microcopy (*"Writing your agent…"*), then route to the editor **pre-filled** with the drafted greeting, persona script, checked tools, FAQ. A subtle banner: *"Draft generated — review and tweak below, then Test."* This is the magic moment: the user watches a complete agent appear from their sentence.

### 3. Editor — generalized, surface-aware, 6 sections
Refactor `editor-client.tsx` so copy is **surface-aware** (no hardcoded "receptionist/call"):
- A persistent **"✨ Regenerate / refine with a prompt"** affordance at the top (e.g., *"make it more formal"*, *"also handle rescheduling"*) → re-runs the generator and merges.
- **Skill** (the persona script / SKILL.md) — the heart, big editor.
- **Greeting / opening** — surface-aware label (voice: "what it says when it answers"; chat: "first message").
- **Tools** — the capability checkboxes (unchanged data; generator pre-checks them).
- **Knowledge (FAQ)** — unchanged.
- **Guardrails** — surfaced explicitly (the quote-guard ranges + a short "never do" list), pre-filled by the generator.
- **Voice/Format** — TTS voice (voice surface only; hidden for chat).
- Advanced fields collapsed by default (progressive disclosure).

### 4. Header actions (exist): **Test** (sandbox) → **Deploy**
Unchanged flow; the header already has Test + Deploy. The story becomes: **Describe → Generate → tweak → Test → Deploy** — 5 visible steps, the first two of which do the hard work for the user.

### Accessibility/feel
Optimistic UI, clear errors (`needs_key` → friendly key prompt with a link to Settings; generation failure → "try rephrasing"), keyboard-submittable prompt, mobile-reasonable. Reuse existing Studio components + `crm-button-*` classes; no new design system.

---

## Reuse (do NOT rebuild)
Test sandbox (`/studio/agents/[id]/test`, `stateless-turn`) · the agent runtime + tool bridge · `agent_templates` CRUD (`lib/agent-templates/{store,actions,schema}.ts`) · `TemplateBlueprintPatchSchema` · the LLM key resolution · the native capability allowlist · `VOICE_OPTIONS` · the existing Deploy flow.

---

## Testing strategy
- **TDD pure logic:** house-style prompt builder; model-JSON parse/validate; tool→allowlist filter; `→ TemplateBlueprintPatch` mapping; chat-vs-voice default-blueprint branches; surface-aware copy selection.
- **Generator action** tested with a **fake `complete()`** (canned JSON) — assert it persists nothing, validates, filters tools, maps correctly, and handles parse-failure + `needs_key`.
- **No live LLM in unit tests.** Manual verification: describe → generate → review → Test (sandbox chat/call) for both a voice and a chat agent.
- Full-branch tsc via the local binary; `check-use-server`.

---

## Risks & mitigations
- **Generator returns junk / invalid JSON** → strict zod parse + one retry + blank-template fallback; tools filtered to the allowlist; the user always reviews before saving.
- **House style drifts from the real voice-R1 playbook** → source the meta-prompt rules from the same place the voice agent's guardrails live (single source of truth), not a hand-copied list.
- **Scope creep into MCP/Brain/new surfaces** → hard-deferred above; slice 1 is generate + generalize + 2 surfaces on existing runtimes.
- **No LLM key** → friendly `needs_key` path (the BYOK one-time step), not a crash.

---

## Definition of done (slice 1)
A user opens "new agent," types one English sentence, picks Voice or Web chat, hits Generate, and lands in a pre-filled, surface-aware editor with a sensible persona + tools + FAQ + guardrails; they tweak, Test it in the sandbox, and it's ready to Deploy — all without writing a prompt from scratch.
