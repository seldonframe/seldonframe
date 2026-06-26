# Self-Improving Agent Generator (L5) — Design

**Date:** 2026-06-26
**Status:** Approved (design) — Max chose tool-binding-first + a Brain-connected generation-time judge
**Author:** brainstormed with Max

## Problem
L4 generate-by-default turns one sentence into a wired agent, but the generator is **shallow + static**: (a) it only knows a few skills and binds **no tools**, so a generated agent can text/answer but can't *do* much (post to social, log to Notion, etc.); (b) generation is **one-shot** — no review of what it produced; (c) it **doesn't learn** — the same misclassification recurs forever. The goal Max set: *"any agent from a sentence."* That needs the generator to be a **self-improving loop**, not a classifier.

## First principle (the "Karpathy brain")
The generator IS a loop and should be built like one (Karpathy: *give success criteria, watch it go*; Cherny: *maker ≠ checker*; Kimi swarm: *the skill library compounds — the run that ran yesterday is dumber than today's*; OpenAI/Anthropic agent guides: *compose simple primitives, don't hand-build monoliths*). So:

> **sentence → classify (maker) → assemble (trigger × skill × channel × TOOLS × guardrails × verify) → JUDGE (checker) → record lessons to Brain → next generation recalls them.**

## The three parts

### L5.1 — Tool-binding from the sentence (Max's #1 — biggest capability jump)
- A **tool catalog** the generator can draw from: the existing **Composio toolkits** (`src/lib/integrations/composio/catalog.ts` — Calendar/Drive/Sheets/Docs/Gmail/…) + **Postiz** (the bearer-key social scheduler already integrated in SF — confirm the connector kind; repo github.com/gitroomhq/postiz-app) + native SF tools (booking/CRM/send). Each catalog entry: id, what-it-does, the trigger/intent keywords that imply it, the connector kind to bind.
- The generator/classifier maps the sentence → the right tool(s) and **binds them to `blueprint.connectors`** (the per-agent MCP/Composio connector list already exists — `src/lib/agents/mcp/connectors.ts`). Examples: *"post a weekly highlight to Instagram"* → Postiz + a `schedule` trigger; *"create a Notion task per new lead"* → Notion toolkit + `lead.created`; *"add no-shows to a Google Sheet"* → Sheets + a no-show trigger.
- A pure `bindToolsForIntent(intent, catalog)` → `connectors[]` + `warnings[]` (a needed toolkit not connected → warn "connect X to enable this"). TDD. The deterministic catalog match first; the LLM classifier (L5.3 judge) can suggest tools the keywords miss.

### L5.2 — Generation-time judge (maker ≠ checker) (Max's #2)
- After `assembleAgentBundle`, a **separate strict LLM pass** `judgeGeneratedAgent({ sentence, bundle })` → `{ ok, issues[], fixes? }` checks: does the trigger/skill/channel/tools match the *intent*? on-brand + safe? complete (review-link prompt present for review agents, guardrails sane)? any tool needed but unbound? It can **auto-apply low-risk fixes** (re-bind a missing tool, correct an obviously-wrong trigger) and **surface the rest** to the user before save. DI the LLM; fail-open to the un-judged bundle (never block generation on a judge error). Reuse the L2 `Checker`/maker≠checker pattern + `getAnthropicClient` (Haiku-tier for cost).

### L5.3 — Brain-connected learning (Max's "connect it to Brain so it learns from mistakes")
- The judge's findings **and the user's edits after generation** (what they changed in the editor right after a generate) are recorded to **Brain loop-memory** in a `generator-lessons` namespace (reuse `agent-memory.ts` + the Brain store). Each lesson: `{ pattern: <sentence-feature>, mistake, correction }`.
- **Future generations recall** relevant lessons (`recallAgentMemory` on the sentence's features) and **inject them into the classifier + judge prompts** (the Kimi `constraints.md` pattern). So a misclassification that was corrected once stops recurring — the generator compounds. This is the self-improving loop + the moat (a lessons library built from months of real generations, in SF's owned Brain).

## Phasing
- **L5.1 — tool-binding** (highest leverage; Composio + Postiz catalog → `bindToolsForIntent` → `blueprint.connectors`, surfaced in the generated agent + a "connect X" warning).
- **L5.2 — the judge** (maker≠checker review at generation, auto-fix + surface).
- **L5.3 — Brain learning** (record judge findings + post-generate edits; recall into the next generation).

## Non-goals (for now)
- GMB-based agents (review-responder) — confirmed gated (not in Composio + Google's reviews API is restricted; needs SF's own CASA integration).
- A general no-code workflow builder — these stay single-trigger→action agents that the generator composes.

## Risks / gates
- Tool-binding requires the toolkit catalog to expose intent keywords + the connector-kind to bind; Postiz connector kind must be confirmed.
- The judge is an LLM cost — Haiku-tier, fail-open, and consider gating it behind a flag until quality is proven.
- Brain learning reuses the L1 loop-memory (no new infra) — keyed in a `generator-lessons` namespace, org-scoped.

## Best-practice sources
Karpathy (success-criteria + overnight loops), Boris Cherny (design loops, maker≠checker), the Kimi K2 swarm playbook (skill library compounds, constraints.md), OpenAI "A practical guide to building agents" (the 6-stage), Anthropic "Building Effective Agents" (compose simple patterns).

## Related
Builds on the unified agent model loop (Trigger/State/Verify/Guardrails/generate-by-default), the Composio integration ([[composio-integration]]), and the agent-builder primitives ([[agent-builder-primitives]]).
