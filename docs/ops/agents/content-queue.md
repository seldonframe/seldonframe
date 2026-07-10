# content-queue — commissioned pieces for content-loop

Strategic commissions the weekly content-loop must publish ahead of its researched queue. Entries here bypass the keyword-volume threshold (they're commissioned for strategic reasons, not volume) but MUST still pass every drafting rule and the full quality gate in `content-loop.md`. Max 2 commissioned pieces per run. After publishing one, flip its `status:` to `shipped: <date> <slug>` in the same PR.

---

## 2. Is GEO legit? (the practitioner's answer)

- **status:** queued
- **commissioned:** 2026-07-09 (by Max)
- **slug:** `is-geo-legit`
- **working title:** "Is GEO (Generative Engine Optimization) Legit, or Just SEO Rebranded? A Practitioner's Answer"
- **why:** the exact question dominating r/GrowthHacking and marketing forums right now; skeptics and sellers are both loud, nobody answers from a measured-practice seat. We run a 500+ page GEO estate with instrumentation — we can answer with receipts.
- **the piece:** honest thesis: GEO is ~90% SEO with a citation-shaped scoring function — and the 10% that differs (citability, .md/agent-readable surfaces, verified freshness, experience quotes, entity schema) is real and measurable. What we actually do and why (md twins, llms.txt, sources rows, verified dates, author entity); what the sellers oversell (em-dash scrubbing, "AI detection proofing", magic-prompt hacks); how to measure (cite /charts/ai-recommendation-index as our own public evidence — including that our own brand is currently absent from AI answers, which is what makes the measurement trustworthy); a plain do-this list for a small business or agency.
- **relatedTool:** `/tools/ai-visibility-checker`. Body links: /charts/ai-recommendation-index, faq-schema-for-local-seo guide.
- **never-lies notes:** no invented "AI traffic %" stats — cite only sources verified per the standard rules; our own methodology page is a citable source for our claims about our own practice.

## 3. Sell-agents Wave 2a — how to sell AI agents to local businesses

- **status:** queued
- **commissioned:** 2026-07-10 (by Max, via the marketplace supply-side plan — `docs/strategy/2026-07-10-marketplace-supply-content.md`)
- **slug:** `how-to-sell-ai-agents-to-local-businesses`
- **working title:** "How to Sell AI Agents to Local Businesses (Scripts, Demos, and the One-Booked-Job Close)"
- **cluster:** `sell-agents` · **relatedTool:** `/tools/missed-call-calculator` · **relatedBest:** `/marketplace`
- **target intent:** "sell ai agents to local businesses" / "how to sell ai to small business" / "ai agent sales pitch".
- **the piece:** the tactical companion to the `how-to-make-money-selling-ai-agents` pillar (Wave 1). (1) why local/service businesses are the beachhead (phone-driven demand, provable pain); (2) prospecting: call their number after hours, grade their website, find the missed-call gap — demo ON THEIR business, not a generic deck; (3) the pitch structure: pain → proof → one-booked-job ROI anchor; (4) objection handling ("already have an answering service" / "worried the AI will lie to customers" → the guardrails/read-back answer / "we're too small"); (5) close + onboard in the same week; (6) retention via a monthly proof report. FAQ ≥4.
- **never-lies notes:** no invented close rates or income claims; any missed-call/lead-response stat must verify to a primary source or be stated qualitatively. Dedupe against the pillar — this page is the FIELD manual, the pillar is the business-model map.

## 4. Sell-agents Wave 2b — white label AI agents (category page)

- **status:** queued
- **commissioned:** 2026-07-10 (by Max, via the marketplace supply-side plan)
- **slug:** `white-label-ai-agents`
- **working title:** "White Label AI Agents: How Agencies Resell One Build to Many Clients (2026 Guide)"
- **cluster:** `sell-agents` · **relatedTool:** `/tools/agency-margin-calculator` · **relatedBest:** `/agencies`
- **target intent:** "white label ai agents" / "white label ai agent platform" / "resell ai agents".
- **the piece:** category-intent explainer + honest vendor landscape. (1) what white-labeling an agent actually means (template=product, deployment=tenant-config; branding, domains, client portals); (2) the economics (build once, deploy many; margin math); (3) what to evaluate in a platform (per-client isolation, your branding end-to-end, who owns the client relationship, flat vs per-seat pricing, BYOK); (4) honest vendor list — verify each with WebFetch (Stammer, Synthflow/Vapi white-label programs, GHL SaaS-mode as the incumbent pattern, SeldonFrame disclosed as ours); (5) pitfalls (per-sub-account taxes, lock-in, agents that lie under your brand). FAQ ≥4.
- **never-lies notes:** competitor claims only from their own live pages via WebFetch; no fee/percentage from memory. MUST dedupe against `white-label-ai-front-office-without-agency-pro` (GHL-angle, already live) — this is the platform-agnostic category page; cross-link, don't overlap.

## 1. The one-person-company-OS pillar page

- **status:** shipped: 2026-07-10 one-person-company-os
- **commissioned:** 2026-07-09 (by Max)
- **slug:** `one-person-company-os`
- **working title:** "The One-Person Company OS: How to Run a Real Business With AI Agents (Without Hiring)"
- **why (context for the writer):** a viral carousel/cheatsheet wave ("build a $1B one-person company with AI", "10 MCP agents + a Claude Project business brain") has made "one-person company OS" a rising mental model among solo founders and agency owners. Nobody credible owns the term on the product side. This pillar intercepts that audience the way our GHL pages intercept GHL searchers — aimed at a *concept*, not a competitor.
- **target intent:** "one person company with AI" / "one person business AI agents" / "AI agents to run my business" / "one-person company OS".
- **the piece (pillar-depth, this is our most ambitious guide):**
  1. What the one-person company OS actually is: one human in the decision seat, AI agents on the execution layer, and — the part the viral posts undersell — **the files/memory that make agents useful** (who-you-are, style rules, process docs, logs). The company IS the accumulated context; agents are stateless workers reading it.
  2. The 10 agent roles people are assembling (leads, research, docs, ads, content, sales, product, ops, finance, review) — explain each honestly in one tight block: what it does, what it needs to know, where the human decision point belongs. Use the reader's vocabulary (they arrive thinking in these role names).
  3. The part that makes it work or fail: **gates and loops**, not agents. An agent without a trigger, a definition of done, and a review gate is a chat session. The review/quality gate is the keystone, not one role among ten.
  4. The honest build-it-yourself path: MCP servers per tool, hand-maintained context files, cron/scheduling, gates you design yourself. Real trade-offs (control + $0 software vs a weekend of config that most people never finish, then ongoing maintenance).
  5. The 3-minute path: a SeldonFrame workspace ships the assembled version — the Soul as the business brain/context files, agents pre-wired to CRM + booking + calendar + phone, gates built in. Self-interest disclosed plainly; DIY treated with respect (some readers SHOULD build it themselves — say who).
  6. FAQ (≥4): do I need to code · what do the .md files contain · which agent first (answer: whichever loop touches revenue — leads or content) · can agents really run unattended (honest answer: only behind gates, human at the irreversible edges).
- **relatedTool:** `/tools/claude-project-brief-generator` (the "business brain" starter). Also link in-body: `/automations` (agent starter packs), `/tools/ai-website-generator`, `/tools/website-grader`, `/guides/what-is-speed-to-lead`, the marketplace.
- **never-lies notes:** do NOT cite the viral posts' engagement/citation statistics (unverifiable) — the trend can be described without numbers. Verify any MCP/agent claims against Anthropic's public docs (modelcontextprotocol.io, anthropic.com docs) and cite those. No revenue promises; "$1B one-person company" is the meme's framing, not ours — reference it as an aspiration people talk about, never as an expectation.
- **quality bar:** this is a PILLAR — it should be the best page on the internet for this intent. If the draft reads as a listicle rewrite of the carousel, the gate should kill it and re-draft.
