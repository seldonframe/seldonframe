# content-queue — commissioned pieces for content-loop

Strategic commissions the weekly content-loop must publish ahead of its researched queue. Entries here bypass the keyword-volume threshold (they're commissioned for strategic reasons, not volume) but MUST still pass every drafting rule and the full quality gate in `content-loop.md`. Max 2 commissioned pieces per run. After publishing one, flip its `status:` to `shipped: <date> <slug>` in the same PR.

---

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
