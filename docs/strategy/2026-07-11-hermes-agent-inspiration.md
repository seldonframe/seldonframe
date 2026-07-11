# What Hermes Agent should change about SeldonFrame — and what it shouldn't

**Date:** 2026-07-11 · **Sources:** hermes-agent.nousresearch.com docs (features overview, tools), github.com/NousResearch/hermes-agent · **Status:** strategy reflection, decisions open

## 1. What Hermes actually is (first principles)

Hermes is an MIT-licensed, model-agnostic **personal agent harness** for technical operators: CLI + messaging gateways (Telegram/Discord/Slack/WhatsApp/Signal), 40+ tools (terminal, browser, voice, image, MCP client), skills on the agentskills.io standard, agent-curated persistent memory (MEMORY.md/USER.md + FTS session search + Honcho user modeling), cron scheduling, subagent delegation, checkpoints/rollback, provider routing/fallback/credential pools, plugins. Its headline: **"the self-improving agent — it creates skills from experience, improves them during use."** Business model: research artifact + funnel to Nous Portal (inference + tool gateway).

The structural read: Hermes serves **the human who owns the agent**. SF serves **businesses whose customers talk to agents, through builders**. Hermes maximizes capability breadth on one user's machine; SF sells reliability, multi-tenancy, and monetization. Notably, Hermes docs state **no formal approval workflow exists** for tool actions — capability-maximalist, not reliability-maximalist. That's the open lane SF already occupies (*never-lies*).

**Convergence signal:** a well-funded lab independently arrived at SF's locked architecture — thin harness, fat skills as procedural memory, curated bounded memory, progressive disclosure, MCP as the integration rail. That's validation of §1, not a threat to it.

## 2. The frame: what actually constrains SF

SF's growth is not constrained by capability breadth. It's constrained by (a) **trust** — an SMB owner believing the agent won't lie or go stale — and (b) **distribution** — builders choosing SF. Open-source Hermes-class harnesses make raw capability free (P ≈ 70%+ that the harness layer is fully commoditized within 18 months). Value then migrates to: trust infrastructure (evals/guardrails/read-back), vertical data gravity (Brain + CRM + per-customer memory), payment rails, and marketplace distribution. **Steal what deepens those; skip what's commoditizing anyway.**

## 3. The bets (probability-weighted, in order)

### Bet 1 — The per-agent learning loop (the big steal)
Hermes's "creates skills from experience" is the productized version of what /record started: recording = the agent's **birth** from experience; Hermes says the loop should **never stop**. SF version, grounded in rails that already exist: deployed agents mine their own conversations (validator failures, escalations, repeated questions — the /dream pattern, per-agent) → **proposed diffs** to customSkillMd/FAQ/guardrails → eval-gated (recordings are the eval set; maker ≠ checker) → operator/agency one-click approve. "Your agent got better this week — here's the diff, here's the eval delta."
- Compounds *never-goes-stale* from "rides model gains" into "compounds with YOUR data." Makes marketplace listings appreciating assets.
- Rails: Brain lessons from eval failures ✅, /dream skill ✅, eval runner + EvalRun store ✅, interview-merge (human-gated model editing — shipping this week) ✅. Missing: the per-agent proposal miner + approve surface.
- P(material retention lift): ~65–70%. Effort: medium (3–5 weeks of slices). Risk: hallucinated improvements — mitigated by the eval gate + human approve, the exact never-lies shape.

### Bet 2 — Per-contact memory (Honcho, translated)
Hermes builds a persistent model of its ONE user. SF's agents should build one per **end customer**: Brain-curated contact profiles (preferences, equipment, history, tone) injected into every turn, displayed in the portal ("what your agent remembers about Mrs. Jones"). This is data gravity — the longer an SF agent runs, the more switching costs an operator accrues, and it demos as magic.
- Rails: Brain v2 owned ✅, contacts/CRM owned ✅, per-turn context injection ✅. Missing: the curation loop (bounded, agent-curated, Hermes-style "periodic nudges") + portal surface.
- P(demo wow): ~60%. P(measurable churn effect): ~40% (unproven, but asymmetric upside). Effort: medium.

### Bet 3 — Routines: natural-language scheduling (cheap, rides this week's slice)
Hermes exposes cron as a first-class UX. SF just shipped the schedule-trigger rail and is shipping schedule self-deploy right now. One thin surface on top: operator types "every Friday at 4, text customers with unpaid invoices" → parsed to a schedule trigger + skill binding. Effort: small. P(usage among active operators): high (~70%). Do it soon after the lifecycle slice lands.

### Bet 4 — Skill portability (supply-side hedge)
Hermes bets on agentskills.io. SF should be able to **import** open-standard skills (wrap with SF guardrails + evals → instantly sellable, trust-upgraded) and **export** BLOCK.md (proves *never-taxes* portability). Import is a marketplace supply acquisition channel; export is a sales objection killer. Effort: small–medium. P(marketplace liquidity impact): ~40–50% — a hedge, priced accordingly.

### Bet 5 — Reliability plumbing (quiet, no announcement)
- **Provider fallback per workspace** (Hermes: fallback providers + credential pools): a client agent must never die on one provider outage. BYOK stays plumbing; failover is a *never-lies-adjacent* uptime guarantee.
- **Prompt-caching audit**: Hermes ships always-on prefix caching. SF's voice Tier0 margin already depends on caching (voice-deploy pricing memory). Verify cache_control on every stable agent system prompt.
- **Checkpoint/rollback surfacing**: SF has landing versions + agent versions; make "every change is a version, one click back" a visible operator promise (Hermes made it a headline safety feature).
Effort: small each. These are trust compounders.

## 4. What NOT to copy (and why)

- **Open-sourcing the harness** — SF sells the hosted outcome + marketplace; the harness commoditizing is fine *because* SF's moat is elsewhere. Answer the openness objection with export/portability, not MIT.
- **Terminal / code-exec for deployed agents** — an SMB front office must never have a shell. Hermes's no-approval-workflow capability stance is the anti-SF. Our guardrails ARE the product.
- **300-model routing UI** — BYOK is plumbing, never the pitch (§1b).
- **Subagent delegation in the product runtime** — build-side swarming (we do it) ≠ runtime complexity SMB agents need. Skip.
- **Voice-mode breadth / skins / CLI theming / Home Assistant** — wrong ICP.
- **Batch trajectory generation** — research feature; the SF analog (scaled eval generation) only if auto-evals need it later.

## 5. Threat read

Hermes itself is not a competitor for SF's ICP (technical operator vs SMB-via-builder; DIY harness vs hosted front office with CRM/payments/portal). The real threat is second-order: builders assembling "good enough" client agents on free Hermes-class harnesses. Counter: the things a DIY harness can't offer a builder — multi-tenant client management, whitelabel portal, GMV/payment rails, eval-backed trust badges, marketplace demand. That's exactly the current roadmap; Hermes mostly says **press harder on the learning loop and memory**, which are the two places a hosted, data-owning platform beats a DIY harness structurally.

## 6. Decisions — SETTLED by Max 2026-07-11 (do not re-litigate)

1. **Bets 1–4 all approved — build them.** Bet 1 EXPANDED: the infrastructure must learn from ALL interactions among ALL users — **the 1000th record→agent creation must be better than the 1st.** That makes Bet 1 two layers: (a) **platform layer, cross-tenant** — the compiler itself improves from every compile via DERIVED correction signals (interview deltas, trigger fixes, wrong bindings, eval failures), never raw tenant content crossing org lines; (b) **agent layer, per-tenant** — each deployed agent improves from its own conversations, eval-gated, operator-approved.
2. Bet 2 privacy posture: operator-visible, exportable, deletable (recommended shape, unchallenged).
3. **Bet 4: import-first.** agentskills.io → BLOCK.md wrap w/ guardrails + evals → marketplace supply. Export later. (Format verified 2026-07-11: folder + SKILL.md w/ name/description frontmatter + optional scripts/references/assets; open standard, ~40 adopting clients.)
4. **WhatsApp: post-sprint.** Not now.

Sequence: lifecycle slice merges → **Bet 3** (routines — small, same deploy surfaces, must not collide with lifecycle Wave 2) → **Bet 1** (flagship) → **Bet 2** → **Bet 4 import** threaded as a supply slice. Specs for all four being written 2026-07-11 grounded in scout recon.
