# Starter Pack — Curated, Forkable Agent-Template Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A new builder lands on a **ready, forkable resale menu** in the Studio — the top LLM-agent use-cases as curated starter templates — instead of a blank canvas. One click instantiates a builder-owned `agent_template` they can edit → test → deploy → resell.

**Architecture (from recon):** The `/automations` page already ships the deterministic archetypes (speed-to-lead, review-requester, win-back, missed-call-text-back, etc. — a static registry, untouched). The gap is the **Studio agent-template system** has no curated seeds. So: a static `STARTER_TEMPLATES` registry (mirroring the archetype pattern) of polished agent-template definitions + a `createTemplateFromStarterAction` (reuses `createAgentTemplate` + `saveAgentTemplateBlueprintAction`) + a "Starter pack" section in the Studio. No new entity, no migration.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test`+`tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `…/tsc -p tsconfig.json --noEmit` (0 NEW; ~10 `.next/types` baseline); `bash scripts/check-use-server.sh src`; TDD; commit per task. No migration.

## Reused (from recon)
`AgentTemplateType` (`voice_receptionist`|`chat_assistant`), `DEFAULT_*_CAPABILITIES`, `createAgentTemplateAction` (`agent-templates/actions.ts:40`), `saveAgentTemplateBlueprintAction` (`:79`), `TemplateBlueprintPatchSchema` (`schema.ts`), the Studio agents page (`studio/agents/page.tsx`) + `new-agent-button.tsx`.

---

## Task 1: The starter-template registry (pure, TDD)

**Files:** Create `packages/crm/src/lib/agent-templates/starter-pack.ts`; Test `…/starter-pack.spec.ts`.

- [ ] **Step 1: Failing tests** — `STARTER_TEMPLATES` is a non-empty array; each entry has `{ id, name, category, type, summary, blueprint }`; every `type` ∈ `voice_receptionist|chat_assistant`; every `blueprint` passes `TemplateBlueprintPatchSchema` (greeting/customSkillMd/capabilities valid; capabilities ⊆ the surface's allowed set); `getStarterTemplate(id)` returns/throws.

- [ ] **Step 2: Implement** ~6 curated starters (the top LLM-agent use-cases — the deterministic ones stay on `/automations`):
  1. **AI Phone Receptionist** (voice) — answer/qualify/book/take-message/quote.
  2. **Website Support Chat** (chat) — FAQ + booking + escalate (web embed).
  3. **Lead Qualifier & Intake** (chat) — qualify inbound, capture details, route/book (fills the gap).
  4. **Booking / Reservation Concierge** (chat) — availability + book/reschedule/cancel.
  5. **Quote / Estimate Assistant** (chat) — `get_quote_range` + capture + follow-up.
  6. **Social Content Assistant** (chat) — drafts/schedules posts; `summary` notes "connect Postiz in the editor for real publishing."
  Each `blueprint`: a polished `greeting` + a house-style `customSkillMd` (the SeldonFrame anti-hallucination playbook: never firm price → `get_quote_range`, enforced read-back, `take_message`, deterministic-vs-LLM) + the right `capabilities` + 2-3 `faq` stubs. Keep each blueprint within the schema limits (customSkillMd ≤ 8k).

- [ ] **Step 3: pass. Commit** `feat(studio): curated starter-template registry (top SMB agents)`.

---

## Task 2: `createTemplateFromStarterAction` (TDD)

**Files:** Modify `packages/crm/src/lib/agent-templates/actions.ts`; Test the composition.

- [ ] **Step 1:** `createTemplateFromStarterAction({ starterId })` (`"use server"`): org-guard; `const s = getStarterTemplate(starterId)`; create the template (`createAgentTemplate`-equivalent with `name: s.name, type: s.type`) → returns `{ id }`; then apply `s.blueprint` via the same blueprint-save path. Return `{ ok:true, id }` | `{ ok:false, error }`. DI the create+save for the test.

- [ ] **Step 2: Test** (pure/store layer per repo convention): unknown starterId → error; valid → create called with the right type + the starter blueprint persisted. **Commit** `feat(studio): instantiate an agent template from a starter`.

---

## Task 3: Studio "Starter pack" UI

**Files:** Modify `packages/crm/src/app/(dashboard)/studio/agents/page.tsx` (and/or `new-agent-button.tsx`).

- [ ] **Step 1:** A **"Start from a template"** section (design-system cards) on the Studio agents page — prominent in the empty state, available alongside "describe your agent" / "start blank". Each `STARTER_TEMPLATES` entry → a card (name · category · summary) → **"Use this template"** → `createTemplateFromStarterAction(starterId)` → route to `/studio/agents/${id}`. `useTransition`; inline error. Keep `"use client"`; pass the registry from the server page (it's a static import — fine).

- [ ] **Step 2:** tsc 0 new; `check-use-server` clean; the existing create flows still work. **Commit** `feat(studio): Starter pack section — one-click fork a curated agent`.

---

## Task 4: Verify
- [ ] Suites: `cd packages/crm && node --import tsx --test tests/unit/agent-templates/*.spec.ts` → green.
- [ ] `tsc` 0 new; `check-use-server` clean; **no migration**.
- [ ] **Report:** regression statement (existing template create/edit/deploy + `/automations` archetypes untouched; this is additive), new-test count, and the honest gap — unit-verified; live gate = open the Studio → "Use this template" on a starter → edit → test → deploy. (A public marketplace listing/discovery + per-builder default seeding is deferred — this is the curated in-app library.)

## Self-Review
- Coverage: curated registry (T1) ✓; one-click instantiate (T2) ✓; Studio UI (T3) ✓; fills the web-chat + lead-qualifier gaps (T1 #2/#3) ✓; reuses the template system (no new entity, no migration) ✓.
- Deferred: public marketplace discovery/listing; per-signup default seeding; upgrading the deterministic `/automations` archetypes to agent-powered (separate).
