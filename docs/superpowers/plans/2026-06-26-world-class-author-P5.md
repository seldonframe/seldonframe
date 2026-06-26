# World-Class Author (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Make the AUTHOR the premium lynchpin of the generator — **Opus + high effort**, the **full Composio catalog** via featured-set + a live resolver, **grounded in the business Soul**. (Decisions, Max-approved: featured-set + live resolver; premium + Soul-grounded one strong pass + the existing judge — NO draft→revise loop.)

**Architecture:** Additive to `src/lib/agents/generate/`. The author (`author-llm.ts`) moves to Opus + a featured tool menu + a `neededCapabilities` escape hatch + a compact Soul block. A new `composio-resolver.ts` (I/O, fail-soft) lists Composio's live toolkits and resolves a plain-English capability → a real toolkit slug → a composio `ConnectorBinding`. `run-generate`/`actions` resolve `neededCapabilities` + fetch the Soul and thread both in. Everything fail-soft: no COMPOSIO key → featured-only; no Soul → generic; no ANTHROPIC key → the heuristic fallback (unchanged).

**Conventions:** verify from inside `packages/crm`: `npx tsc --noEmit -p tsconfig.json` (gate 0), `node --import tsx --test <spec>`, `bash scripts/check-use-server.sh src`, `pnpm build` at phase end. Commit per task; push at the end. Work in `icp3-wedge`.

## Tasks

### P5.1 — Premium author + featured tool menu + capability escape hatch
**Files:** `src/lib/agents/generate/author-llm.ts` + `authored-agent.ts` (add `neededCapabilities`) + specs.
- [ ] **Model → Opus.** `author-llm.ts` model default `process.env.ANTHROPIC_AUTHOR_MODEL?.trim() || "claude-opus-4-8"` (was haiku) + bump `max_tokens` (authoring a full playbook needs room — e.g. 4000). The author is compile-time + amortized → premium is correct.
- [ ] **Featured menu + Postiz multi-platform.** The prompt's tool menu = the curated `TOOL_CATALOG` featured set; mark **Postiz as multi-platform** ("post to Instagram, Facebook, LinkedIn, X, TikTok, …", not just IG) — update its catalog `description`. Add to the author's JSON contract a `neededCapabilities: string[]` field: *"for any capability NOT in the menu above, describe it in plain words (e.g. 'read this business's Google reviews') — we'll resolve it to a real integration."*
- [ ] **`authored-agent.ts`:** add `neededCapabilities?: string[]` to `AuthoredAgent` + normalize (array of non-empty strings, deduped, capped ~5). Keep `tools` as the catalog-id list.
- [ ] **Tests:** model default is `claude-opus-4-8`; the prompt contains the featured labels + the multi-platform Postiz note + the neededCapabilities instruction; `normalizeAuthoredAgent` keeps/cleans `neededCapabilities`. tsc 0 + check-use-server. Commit.

### P5.2 — Composio live toolkit resolver
**Files:** Create `src/lib/agents/generate/composio-resolver.ts` + spec. INVESTIGATE `@composio/core` + `src/lib/integrations/composio/` — how to LIST toolkits (the SDK's `toolkits.list()` / REST `GET /toolkits`, or Rube's tool-search) with the org's Composio key; mirror the existing Composio client setup.
- [ ] `listComposioToolkits(deps?): Promise<{slug,name,description?}[]>` — lists the LIVE Composio catalog (cached in-module per process), **fail-soft → `[]`** when no `COMPOSIO_API_KEY`/error. Read-only (money-safe).
- [ ] `resolveCapabilitiesToToolkits(capabilities: string[], toolkits): {slug,label,capability}[]` — pure matcher: for each capability phrase, keyword/score match against the toolkit name+description, return the best slug (or nothing). Never throws.
- [ ] `bindComposioToolkits(slugs: string[]): ConnectorBinding[]` — build `{kind:"composio", enabledToolkits:[slug], enabledTools:[]}` bindings directly (the long-tail toolkits aren't in TOOL_CATALOG), deduped.
- [ ] **Tests:** with a fake toolkit list incl. a "google_business"/"gmb" entry, `resolveCapabilitiesToToolkits(["read my google reviews"])` → that slug; no match → `[]`; `bindComposioToolkits` → valid composio bindings (validate vs `connectorBindingSchema`); `listComposioToolkits` fail-soft → `[]` with no key. tsc 0 + check-use-server. Commit.

### P5.3 — Soul-grounded author
**Files:** a small `src/lib/agents/generate/author-context.ts` (fetch + compact the org Soul) + wire into the author prompt. INVESTIGATE how the Soul/business context is read for an org (grep `submit_soul`/`read_brain_path`/the Soul store; the generate action runs in the builder's org — fetch ITS business context: services, brand voice, hours).
- [ ] `loadAuthorSoulContext(orgId, deps): Promise<string>` — returns a COMPACT (~600-char) plain-text business summary (name, what they do, services, tone) or `""` if none. Fail-soft, never throws.
- [ ] The author prompt gains a "The business you're authoring for:" block when non-empty — so the skill is specific, not generic. (Note: a marketplace TEMPLATE may be generic; ground when a Soul exists, else stay generic.)
- [ ] **Tests:** a fake Soul store → the compact block; no Soul → `""` + the prompt omits the block. tsc 0. Commit.

### P5.4 — Wire + verify + push
**Files:** `run-generate.ts` + `actions.ts` + specs.
- [ ] `actions.ts`: pass the real `listComposioToolkits` + `loadAuthorSoulContext(orgId)` deps. `run-generate.ts`: after the author returns, **resolve `authored.neededCapabilities`** → `resolveCapabilitiesToToolkits` → `bindComposioToolkits` → merge into `bundle.blueprint.connectors` (dedupe); push a warning for any capability that didn't resolve ("no integration found for: …"). Thread the Soul context into `authorAgentDraft` (so the author sees it). All fail-soft.
- [ ] **Tests:** an author returning `neededCapabilities:["read my google reviews"]` + a fake resolver → the resolved toolkit is bound on the created template; an unresolved capability → a warning; no resolver/Soul deps → today's behavior.
- [ ] **Verify:** the whole generate suite passes · tsc 0 · check-use-server clean · `pnpm build` exit 0. Push. Smoke: describe *"post a weekly Instagram highlight of our 5-star Google reviews"* → an Opus-authored agent, Postiz bound (multi-platform), + (if Composio lists a GMB toolkit) a resolved reviews-reader bound — or a clear "no integration for reading Google reviews yet" warning.

## Self-Review
- Decisions honored: featured+resolver (P5.2/P5.4), premium+Soul one-pass+judge (P5.1/P5.3, judge unchanged from P3). ✓
- Fail-soft everywhere: no COMPOSIO key → featured-only; no Soul → generic; no ANTHROPIC key → heuristic. Premium model is the only cost change + it's amortized. ✓
- The resolver auto-answers GMB: the day Composio lists it, `resolveCapabilitiesToToolkits` finds it — zero pipeline change. ✓
