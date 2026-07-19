# Marketplace supply-side content engine — plan of record (2026-07-10)

Goal: make seldonframe.com rank (SEO) and get cited (GEO) for **builder/seller intent** —
"sell AI agents", "AI agent marketplace", "start an AI automation agency" — so the marketplace
fills with OFFER-side supply (builders creating and listing agents), feeding /marketplace and
/marketplace/build. Approved by Max 2026-07-10. Wave 1 ships on `feat/seo-supply-wave-1`.

## The three insights this plan is built on

1. **Supply-side is a different keyword universe.** Everything shipped so far (vs/alternatives/
   pricing/best/tools/guides) targets SMB owners *buying*. Builders/agencies *earning* barely
   overlap with that in search. This is a new cluster (`sell-agents`) with its own pillar, not an
   extension of the demand engine.
2. **The marketplace listings themselves are the biggest supply-side SEO asset** (the Zapier
   app-directory model). Every `/marketplace/[slug]` page is a landing page: keyword-chosen slug,
   Product/Offer/FAQPage JSON-LD, eval pass rate rendered as the trust signal ("marketplace-legible
   trust", literally). Articles exist to feed link equity INTO listings and /marketplace/build.
3. **Chicken-and-egg honesty.** No earnings/case-study content before builders actually earn.
   Sequence: seed marketplace with SF-native agents → run the Seldon Studio proof sprint →
   then cluster G (proof) unlocks. never-lies applies to marketing: every number real or hedged.

## Best practices (the rules every supply-side piece follows)

1. **Hub-and-spoke:** pillar = `/guides/how-to-make-money-selling-ai-agents` → cluster articles →
   marketplace listings → `/marketplace/build`. Follow-up (separate slice): a dedicated `/sell`
   product hub targeting the head term.
2. **Reuse the /guides engine** — registry + md twin + spec gate + sitemap/llms.txt auto-derive +
   IndexNow. No new CMS, no new route group.
3. **One CTA:** the ungated paste→build→claim flow; "list it on the marketplace" as step 2.
   NOT the demo-call CTA (that's for SMB buyers).
4. **GEO:** crisp quotable definition up top, FAQ block, comparison tables, dated stats,
   answer-shaped H2s. Publish 2-3 stats pages (cluster F) — the citation magnets.
5. **Programmatic only where real supply exists:** agent-type × vertical pages ONLY when a real
   forkable template backs them (thin-doorway risk under Google's scaled-content policy).
6. **E-E-A-T via build-in-public:** bylines, real screenshots, real eval pass rates, disclosure
   ("we build this product") in every SF mention.
7. **Cross-link demand → supply:** agency-relevant demand pages (GHL cluster, vendasta/stammer
   alternatives) get a "Running an agency? Sell this to your clients →" block.
8. **Distribution:** every pillar gets the youtube-video-kit + x-post-engine treatment; builders
   live on X/YT/HN/Reddit — those threads are also what LLMs cite.
9. **Measure published-listings-per-week**, not sessions: GSC cluster queries + PostHog funnel
   article → /build → claim → publish-to-marketplace.
10. **Refresh:** money/earnings pages quarterly; definitional pages semi-annually (copy the
    seo-price-refresh scheduled-task pattern).

## never-lies drafting rules (inherited from content-loop.md, restated)

Every stat cited from a WebFetch-verified https source or dropped; no fabricated income claims —
the anti-guru sobriety IS the differentiation on these keywords; SF facts limited to the canonical
list ($29/mo flat · unlimited workspaces · first workspace free · no trial · BYOK · GMV 5→3→2%
only when SF is the channel · surfaces: voice/web-chat/SMS/email/DM/MCP · marketplace publish +
rent-via-MCP + white-label).

## The queue (waves; slugs final unless noted)

### Wave 1 — SHIPPED this branch (cluster `sell-agents`)
| slug | target keyword | relatedTool |
|---|---|---|
| how-to-make-money-selling-ai-agents (PILLAR) | how to make money selling ai agents | /tools/agency-margin-calculator |
| how-much-to-charge-for-an-ai-agent | how much to charge for an ai agent | /tools/agency-margin-calculator |
| ai-agent-business-ideas | ai agent business ideas | /tools/missed-call-calculator |
| how-to-start-an-ai-automation-agency | how to start an ai automation agency | /tools/agency-margin-calculator |
| best-ai-agent-marketplaces | ai agent marketplace | /tools/agency-margin-calculator |
| what-is-an-mcp-marketplace | mcp marketplace | /tools/claude-project-brief-generator |

Dedupe notes: `how-to-price-an-ai-receptionist-service` (main) targets the receptionist-service
pricing intent — the Wave-1 pricing piece targets the broader "charge for an AI agent" intent and
should cross-reference it. `white-label-ai-front-office-without-agency-pro` and
`run-client-ai-on-your-own-keys` (main) are adjacent supply-side pieces; future drafts must dedupe
against them.

### Wave 2 — commissioned to the weekly content-loop (2 per run; entries in content-queue.md)
1. `how-to-sell-ai-agents-to-local-businesses` — kw "sell ai agents to local businesses";
   /tools/missed-call-calculator. The pillar's tactical companion: outreach scripts, demo-on-their-
   business, objection handling, the one-booked-job close.
2. `white-label-ai-agents` — kw "white label ai agents"; /tools/agency-margin-calculator.
   Dedupe vs the GHL-angle white-label piece: this one is platform-agnostic category intent
   (what white-labeling means for agents, models, what to look for, honest vendor list incl. us).

### Wave 3 — build-and-sell per agent type (gate: marketplace seeded w/ matching template + live demo)
- how-to-build-and-sell-an-ai-receptionist · kw "sell ai receptionist" · /tools/ai-receptionist-cost-calculator
- how-to-build-a-missed-call-text-back-agent-to-resell · /tools/missed-call-calculator
- how-to-build-and-sell-a-speed-to-lead-agent · /tools/speed-to-lead-calculator
- how-to-build-a-review-request-agent · /tools/google-review-link-generator
- how-to-build-and-sell-an-ai-booking-agent · /tools/booking-friction-grader
- how-to-build-a-website-chatbot-for-clients · /tools/website-grader
- how-to-build-an-ai-lead-qualifier · /tools/speed-to-lead-calculator
- how-to-build-an-after-hours-answering-agent · /tools/ai-receptionist-cost-calculator
Each: pain → build walkthrough (link the live template) → pricing → pitch → operate.

### Wave 4 — agency depth
- ai-agency-pricing-models (retainer vs per-agent vs GMV/outcome) · /tools/agency-margin-calculator
- how-to-get-ai-agency-clients (first 5, scripts) · /tools/agency-margin-calculator
- productized-ai-services (packaging) · /tools/agency-margin-calculator
- how-to-run-client-portals-for-ai-agents · /tools/agency-margin-calculator
- from-gohighlevel-agency-to-ai-agency (supply twin of the GHL intercept) · /tools/gohighlevel-cost-calculator
- what-to-deliver-in-a-299-ai-front-office · /tools/agency-margin-calculator

### Wave 5 — seller-intent comparisons
- gpt-store-alternative-for-developers · kw "gpt store alternative"
- where-to-sell-ai-agents (channels ranked) 
- selling-ai-services-on-fiverr-vs-owning-your-agent (margin math)
- ai-marketplace-fees-compared (who takes what cut — our 5%+2¢ floor is a good story)
- stammer-ai-vs-seldonframe-for-agencies / voiceflow-reseller-vs-owning-the-stack (seller twins of
  existing buyer pages; dedupe carefully)

### Wave 6 — MCP/technical rails (GEO)
- how-to-rent-out-an-ai-agent-via-mcp (signed keys, metering, revocation)
- byok-economics (how BYOK makes agents nearly free to run)
- how-ai-agents-get-paid (x402/agent payments — only if sources verify)
- agent-reliability-as-a-product (evals/guardrails/read-back — the never-lies manifesto for builders)

### Wave 7 — stats pages (citation magnets; refresh quarterly)
- ai-agent-economy-statistics · ai-agency-pricing-data (real survey, even n=20 from outreach) ·
  smb-ai-adoption-by-vertical. Every number primary-sourced or self-collected; no aggregator reblogs.

### Wave 8 — proof (GATED on real results; unlocks after the 10-close proof sprint)
- Case study per closed client ("I built and sold an AI front office to a plumber: full teardown").
  Highest-converting pages + the X/YouTube ammo. Do not fake, do not pre-write.

## Non-article follow-ups (separate slices, not this branch)
1. **/sell product hub** — marketing page targeting "sell AI agents", linking cluster + marketplace.
2. **Marketplace listing SEO hardening** — keyword-slugs, Product/Offer JSON-LD, eval-badge render,
   FAQ per listing, related-guides block (the Zapier-directory play).
3. **Demand→supply cross-link block** on agency-relevant demand pages.
4. **Stats-page data collection** (outreach survey) before Wave 7.

## Review log
- 2026-07-10: Wave 1 drafted (6 articles, subagent-written, maker≠checker gate run), cluster
  `sell-agents` added, strategy doc + Wave-2 commissions landed. PR #47 MERGED same day.
- 2026-07-10 (second batch, Max-directed "do all the waves"): Waves 2-7 drafted as 26 articles on
  `feat/seo-supply-waves-2-7` — Wave 2 (2, queue commissions flipped to shipped) · Wave 3 (8
  build-and-sell; shipped without the live-template gate per Max's direction — articles link the
  calculators, NOT nonexistent templates) · Wave 4 (6 agency; from-gohighlevel angle re-cut to
  smma-to-ai-agency to avoid the GHL demand-page collision; portals slug = client-portals-for-
  ai-agencies) · Wave 5 (5; stammer-vs replaced by voice-ai-reseller-programs — /compare +
  /alternative-to already own the stammer pair) · Wave 6 (4; byok-economics re-cut to what-is-byok-ai
  — run-client-ai-on-your-own-keys owns the GHL-BYOK intent) · Wave 7 REDUCED to 1
  (ai-agent-statistics, primary-source-only; the survey-based pricing-data page is IMPOSSIBLE
  honestly without collecting data first — still queued behind a data-collection follow-up).
  **Wave 8 NOT written:** case studies remain gated on real closed clients (never-lies) — the
  10-close proof sprint unlocks it.
