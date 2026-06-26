# Primitive-Composition Agent Generator — Design

**Date:** 2026-06-26
**Status:** Approved direction (Max chose the full rebuild + ship-the-patch-first). Spec for review before planning.
**Supersedes the foundation of:** L4 generate-by-default (template-picker) — keeps L5.1/L5.2/L5.3 (tool-binding, judge, lessons) on top.

## Problem (diagnosed from real use)
Typing *"Post a weekly Instagram highlight of our 5-star reviews"* produced a **Review Requester**: the generator keyword-matched "reviews", **cloned the review-requester starter wholesale** (script, FAQ, booking.completed/SMS trigger, guardrails), and stapled the sentence on. Root cause is architectural, not a regex: the "generator" is a **template-picker**. It can only emit variations of the 2–3 starters it ships with. A genuinely new species of agent (schedule-fired, social-posting, no customer conversation) has no template → it gets crammed into the nearest box. This violates **thin-harness + fat-skills** (the fat skill is a frozen clone, not authored) and is **fragile to smarter LLMs** (a better model still just picks from 3 templates — the system can't exceed its template list).

> A quick patch shipped first (social/posting sentences route to a schedule agent; "Apps & tools" + Postiz surfaced; outbound-task base). This spec is the real fix.

## Principle: compose from primitives, author the skill
"Any agent from a sentence" = **compose from the six primitives we already own** (Trigger · Channel · Skill · Tools · Guardrails/Verify · Knowledge), with the work split so it's **antifragile**:
- **The LLM authors the creative half** — the actual playbook (fat skill) for *this* agent + a structured declaration of its primitives. This half *gets better as models get smarter*.
- **SF's thin harness wires the safety half** — guardrails, verify rubric, state, kill-switch — deterministically, never the model. This half *stays reliable as models get weirder*.
- **Judge (L5.2) + lessons (L5.3)** validate + compound on top — now reviewing a real authored agent, not a clone.
- **Starters become few-shot EXAMPLES** the author studies for house style — they stop being the ceiling.

## Architecture

### 1. The author (new) — sentence → `AgentDraft` (structured output)
A new `authorAgentDraft(sentence, deps)` asks the LLM (with the starters as few-shot examples + the Apps&tools catalog + `priorLessons` from L5.3) to return a **validated structured object** — it authors prose AND declares primitives:
```ts
type AuthoredAgent = {
  name: string;                 // "Weekly Instagram Highlights"
  summary: string;              // one line
  skillMd: string;              // THE PLAYBOOK — authored for this agent
  trigger: { kind: "inbound"|"event"|"schedule"; event?: KnownEvent; cron?: string; cadenceLabel?: string };
  channel: EventChannel | "none";   // "none" = acts via tools, sends no message
  tools: string[];              // ids from the Apps & tools catalog (e.g. ["postiz"])
  knowledgeHints?: { reviewUrl?: string; businessFacts?: string[] };
};
```
Forced via the tool-call/StructuredOutput pattern (like the judge), Haiku/Sonnet-tier, **fail-soft** → falls back to the heuristic intent (below). The LLM never authors guardrails/verify (unreliable) — only the skill + the primitive declaration.

### 2. The thin harness — `AuthoredAgent` → safe `AgentBundle`
A composer (evolves `assembleAgentBundle`) takes the authored draft and wires SF's deterministic safety by the agent's **shape** (its trigger-kind × channel × tool-set), NOT by a template id:
- `resolveAgentTrigger` clamps the trigger; a `"none"` channel is modeled as **action-only** (see §4).
- `defaultGuardrailsForShape(trigger, channel)` — quiet-hours/caps for customer-messaging agents; lighter brakes for internal/posting agents; kill-switch always.
- `defaultRubricForShape(...)` — channel-aware length + no-unfilled-placeholder + must-include any declared review URL; a posting agent gets a "no fabricated facts/reviews" check.
- `bindToolsForIntent` maps `tools[]` → real `ConnectorBinding[]` (L5.1, Postiz=vetted etc.).
- The authored `skillMd` is the `customSkillMd` (folded once).

### 3. Judge + lessons (expand L5.2/L5.3)
- The **judge** gains a **safety-of-prose lens**: it may FLAG (not rewrite) an authored skill that instructs unsafe behavior (fabricate prices/reviews, skip read-back) — surfaced as a warning; it still auto-fixes only trigger/verify/guardrails/connectors. Voice stays the author's.
- **Lessons** already record judge fixes + post-generate edits; now they also teach the *author* (recalled into the author prompt) — so a mis-authored agent type, once corrected, improves next time.

### 4. `channel: "none"` — action-only agents
A poster/logger doesn't message a customer; it acts via a tool. Model this as a first-class channel value `"none"` (or `action`): the runtime, on the trigger firing, runs the skill + invokes the bound tools and sends NO customer message. Minimal change to `EventChannel` + the event-agent runner's send path (guard: channel "none" → tool-only, no `sendSms/Email`). This is what makes "post to Instagram" actually *post*.

### 5. Heuristic fallback (keep)
`heuristicIntent` (now social-poster-aware from the patch) stays as the **fail-soft path** when no LLM/key — it yields a sane primitive declaration the composer can wire. The author is the smart path; the heuristic is the floor. Generation never blocks.

## Apps & tools catalog (the menu the author + UI share)
One catalog (extends `tool-catalog.ts`): each tool = `{ id, label ("Post to social"), connectorKind, what-it-does, intent-keywords }`. The author picks from it; the editor renders it as "Apps & tools" (Postiz first-class). Single source of truth → no drift between what the generator can wire and what the UI shows.

## Antifragility (best-practice grounding)
Karpathy (*give success criteria, author freely*), Cherny (*maker≠checker*), Kimi swarm (*the skill library compounds*), Anthropic/OpenAI agent guides (*compose simple primitives*). The inversion: **the LLM's authored skill rides model progress; SF's deterministic harness rides reliability.** Templates teach style, never cap capability.

## Phasing
- **P1 — the author + composer:** `authorAgentDraft` (structured output, few-shot from starters, fail-soft to heuristic) + the shape-based composer (`defaultGuardrailsForShape`/`defaultRubricForShape`) + wire into `run-generate`. The generator can now make a genuinely new agent type from a sentence.
- **P2 — `channel:"none"` action-only runtime:** the runner posts via tools without messaging a customer (makes social/logging agents real end-to-end).
- **P3 — judge prose-safety lens + author-fed lessons.**
- **P4 — Apps & tools catalog unification** (author + editor share one menu) + name/label polish + the agents-list clarity.

## Non-goals
- A visual workflow builder (these stay single trigger→skill→tools agents the author composes).
- GMB review-responder (still gated on Google's CASA reviews API).
- Authoring guardrails/verify with the LLM (safety stays deterministic — the whole point).

## Risks / gates
- Structured-output reliability — force via tool-call + validate + **fail-soft to the heuristic** (never block creation).
- `channel:"none"` touches the runner send path — keep it a narrow guard + test the no-message path.
- Author cost — Haiku-first; the heuristic floor means a missing key still works.
- Keep every safety primitive deterministic — a smarter OR dumber model must still yield a safe agent.

## Related
Builds on [[unified-agent-model]] (the loop), [[agent-builder-primitives]] (the six primitives), the L5 self-improving generator (`docs/.../2026-06-26-self-improving-generator-design.md`), and the just-shipped misfire patch.
