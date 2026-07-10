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
