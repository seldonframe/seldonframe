# SeldonFrame Agent-Marketplace Distribution Research
### Taste-mode MCP directory listings + flagship bench strategy
Compiled 2026-07-03 · Deep-research harness (5 parallel search angles, adversarially verified)

---

## 0. Executive summary — read this first

**The plan survives contact with the evidence, with two real course-corrections.**

1. **The namespace split (platform-flagship-in-own-namespace vs. sellers-under-`io.github.<user>`) is not speculative — it is literally how the official MCP registry works today**, enforced at publish time via GitHub OAuth or DNS/HTTP domain proof (§3.1). This is the single most validated part of the plan.
2. **The GPT Store is a directly-on-point cautionary tale SF should study hard, not just cite.** OpenAI's flagship-adjacent behavior (opaque payout formula, no creator marketing tools, no organic ranking, US-only pilot, "OpenAI will clone what works" fear) is the closest real-world analog to "platform builds flagship agents in the same marketplace as sellers," and it is widely blamed for killing creator promotion (§2.1). SF's 95%-to-seller economics and open BYOK model already structurally avoid GPT Store's worst features, but the **discoverability/ranking-transparency** lesson transfers directly and is not yet addressed in the plan as described.
3. **The one number in the original brief that should NOT ship in demo copy is the "78% buy from whoever responds first" statistic** — it has no traceable primary source (§5, Contradictions). Use the Oldroyd/MIT or Velocify figures instead; both are stronger and still dramatic.
4. **Missed-call-text-back and review-requests — two agents on SF's own seed list — are the most search-validated by raw demand but are also the most commoditized/saturated categories in the entire candidate set**, including being a native, zero-cost toggle inside GoHighLevel, the dominant agency-in-a-box competitor (§4.2, §6). This doesn't rule them out, but it changes their role: supporting cast, not flagship differentiators.
5. **No MCP directory today publishes browse-to-install conversion data, and "instructions-payload-as-growth-lever" and "MCP GEO" are not established practices as of mid-2026** (§1.4) — this is genuine white space SF could define and own, not an established playbook to copy.

Jump to: [§1 MCP directory mechanics](#1-what-actually-converts-in-mcp-directories-2025-2026) · [§2 Marketplace seeding precedent](#2-marketplace-supply-side-seeding-precedent) · [§3 Namespace hygiene](#3-namespacereputation-hygiene-precedent) · [§4 Anti-patterns](#4-anti-patterns-that-get-vendors-flagged-or-removed) · [§5 Taste-mode funnel design](#5-try-before-you-buy-funnel-design) · [§6 Flagship bench ranking](#6-q2-the-flagship-bench) · [§7 Contradictions, loudest first](#7-findings-that-contradict-the-current-plan) · [Sources](#8-full-source-list)

---

## 1. What actually converts in MCP directories, 2025-2026

### 1.1 The single strongest, most-triangulated finding: quality score gates visibility, not just ranking

Two competing directories independently built the same mechanism and reached the same product decision:

- **Glama** runs a published "Tool Definition Quality Score" (TDQS): six weighted dimensions (Purpose Clarity 25%, Usage Guidelines 20%, Behavioral Transparency 20%, Parameter Semantics 15%, Conciseness & Structure 10%, Contextual Completeness 10%), scored per-tool, then rolled up as `60% × mean + 40% × minimum` — explicitly designed so "a single poorly described tool pulls the score down." Servers below a quality floor don't rank lower; **they don't appear in search, category listings, or recommendations at all** — the profile page is preserved but distribution is withheld. Letter grades A(≥3.5) through F(<1.0). [Glama, "Tool Definition Quality Score," 2026-04-03](https://glama.ai/blog/2026-04-03-tool-definition-quality-score-tdqs)
- **Smithery** runs an analogous, less-documented score where a server "sitting at 60/100 is functional — but largely invisible to the developers who could use it," driven by the same deficiency categories (vague descriptions, missing system prompts, thin metadata). [Medium/francofuji, 2026-03-10](https://medium.com/@francofuji/your-mcp-server-scores-60-100-on-smithery-what-it-means-and-how-to-hit-100-edd924758268) — secondary source restating Smithery's rubric, confidence MEDIUM on this specific writeup, but the underlying "score gates visibility" mechanic is corroborated by Glama's near-identical, better-documented model.

**Practical implication for SF**: a flagship agent's MCP listing is not evaluated once at submission — it is continuously auto-scored on description quality, and a mediocre description can make an otherwise-great agent invisible in-directory regardless of how good the underlying agent is.

### 1.2 Two independently-verified quantitative studies exist on description quality → agent behavior — everything else in this space is qualitative or volume-only

- **arXiv 2602.18914** ("From Docs to Descriptions: Smell-Aware Evaluation of MCP Server Descriptions"): in a controlled mutation-based study, standard-compliant tool descriptions reached **72% selection probability vs. a 20% baseline** in competitive settings with functionally-equivalent servers — a 260% relative lift. Functionality and accuracy defects had the largest negative effect on selection (+11.6% and +8.8% respectively when fixed, p<0.001). Description smells were pervasive: 73% of tools had repeated/duplicate names. **Directly fetched and confirmed** — HIGH confidence. [arxiv.org/abs/2602.18914](https://arxiv.org/abs/2602.18914)
- **arXiv 2602.14878** ("MCP Tool Descriptions Are Smelly!"): analyzed 856 tools across 103 servers (23 official, 80 community) and found **97.1% of tool descriptions contain at least one defect**; 56% specifically exhibit "Unclear Purpose." Fixing defects raised agent task success by a median of 5.85 percentage points, but — important caveat — execution steps rose 67.46% (median) and 16.67% of fixes actually regressed performance. Official and community servers showed the defects at similar rates, i.e. "producing high-quality tool descriptions is challenging for all types of practitioners," including platform-official ones. HIGH confidence, directly fetched. [arxiv.org/html/2602.14878v1](https://arxiv.org/html/2602.14878v1)

**Practical implication**: better descriptions aren't automatically free wins — over-elaboration can add tool-calling overhead. SF's flagship listings should target concision + the 4 specific dimensions studies flag (accuracy, functionality, completeness, conciseness), not maximal verbosity.

### 1.3 Anthropic's own guidance corroborates, with concrete tool-naming mechanics

- Anthropic's engineering blog: "Claude Sonnet 3.5 achieved state-of-the-art performance on SWE-bench Verified after we made precise refinements to tool descriptions" (exact percentage delta undisclosed, but the causal claim is primary-sourced). Concrete naming guidance: **namespace by service AND resource** (e.g. `asana_search`, `asana_projects_search` rather than a bare `search`), and note that prefix-vs-suffix namespacing style has "non-trivial effects on tool-use evaluations." Write descriptions "as if explaining to a new colleague," avoid ambiguous parameter names (`user_id` not `user`). HIGH confidence, primary source. [Anthropic, "Writing tools for agents," 2025-09-11](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Separately, Anthropic demonstrated that loading full tool definitions upfront is a major token cost at scale, and recommends progressive disclosure (name-only → name+description → full schema) — one worked example cut token usage from 150,000 to 2,000 (a 98.7% reduction). Directly relevant if SF's flagship bench eventually exposes many tools per agent. [Anthropic, "Code execution with MCP," 2025-11-04](https://www.anthropic.com/engineering/code-execution-with-mcp)

### 1.4 Two hypotheses in the original brief did NOT pan out — genuine white space, not a research failure

- **"MCP GEO"** (generative-engine-optimization specifically for getting an MCP server surfaced by an agent during tool discovery) is not an established term or documented practice on any directory operator's blog as of mid-2026. What exists under "GEO" labels is generic website-content optimization for AI search engines, sometimes delivered as an MCP-wrapped product (e.g. Frase, Glippy) — but the *target* of that optimization is the customer's website, never the MCP listing's own metadata. MEDIUM confidence (thorough negative search, but terminology elsewhere may differ).
- **"Instructions payload as a growth/demo hook"** — no directory or Anthropic source frames the MCP `instructions` field as a marketing/conversion lever. The closest verified analogues are the progressive-disclosure pattern (§1.3) and the generic "MCP prompts" primitive, neither framed as growth mechanics. MEDIUM confidence negative finding.
- **No directory publishes browse-to-install or funnel conversion rates.** Every "growth" number found (Smithery's "60k tool calls/month" example server, "97M+ monthly SDK downloads" ecosystem-wide) is an absolute volume, never a rate. This is a real gap in the public literature, confirmed across all three directories checked.

**Implication**: SF has room to define what "MCP listing optimization" means rather than follow an existing playbook — genuinely first-mover territory, but also means the "instructions payload hook" idea in the original brief should be treated as an experiment to run and measure, not a pattern to copy from elsewhere.

### 1.5 Directory fragmentation is real and large — don't over-index on any single directory's server count

Self-reported server counts for what is nominally the same ecosystem, checked at similar 2026 snapshots, spanned more than 7x: Smithery ~7,000-7,300, PulseMCP "20,100+ updated daily," Glama 36,950-50,845. This reflects different inclusion thresholds, not a single canonical "market size." PulseMCP explicitly markets itself as hand-curated/reviewed by its founder since MCP's launch week (excluding "low-quality implementations" by design), while Smithery and Glama add hosting/gateway infrastructure and optimize for catalog breadth. MEDIUM-HIGH confidence on the fragmentation itself (directly observed on each directory's live page); LOW confidence on any specific aggregator-cited count-and-date pairing (several such numbers circulating in SEO content could not be independently pinned down and should not be cited as fact). [PulseMCP](https://www.pulsemcp.com/servers), [Glama](https://glama.ai/mcp/servers), [Smithery](https://smithery.ai/servers), comparison analysis at [TrueFoundry](https://www.truefoundry.com/blog/best-mcp-registries)

Separately, **PulseMCP already runs a live "official-providers" vs. "community" classification facet** on its directory (`pulsemcp.com/servers?classification[]=official-providers`) — a working, shipped precedent for almost exactly SF's proposed platform/seller split, though this was inferred from URL/facet structure rather than an explicit PulseMCP policy statement (MEDIUM confidence, recommend a direct follow-up fetch before treating as definitive).

### 1.6 Remote/hosted, no-auth servers reduce friction — directionally strong, not quantified

Cloudflare and Smithery both frame "zero-install, remote MCP endpoint" as the single biggest adoption lever (Smithery: "you can use a server without installing or operating it"; Cloudflare's authless Workers template connects instantly via the AI Playground). This directly validates SF's plan to host all flagship AND seller endpoints remotely. However, no source quantifies a conversion-rate uplift — only absolute usage examples for already-popular servers (~60k and ~30k tool calls/month). MEDIUM confidence on the qualitative claim, LOW on any implied magnitude. [Smithery docs](https://smithery.ai/docs/build), [Cloudflare remote MCP guide](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)

---

## 2. Marketplace supply-side seeding precedent

### 2.1 OpenAI GPT Store — the closest real-world analog to SF's exact situation, and a clear list of what NOT to repeat

GPT Store launched January 10, 2024 with revenue sharing explicitly promised as "coming soon," not built into launch. [OpenAI launch post](https://openai.com/index/introducing-the-gpt-store/); [VentureBeat, 2024-01-10](https://venturebeat.com/ai/openai-launches-gpt-store-but-revenue-sharing-is-still-to-come/)

Documented, dated failure points, in order of relevance to SF:
- **No creator marketing tools, no organic ranking system, no ratings/reviews.** A dated UX audit found discovery was keyword-search-only with irrelevant results surfacing, no way for a creator to drive traffic to their own listing. [Nick Babich, "GPT Store is a UX disaster," 2024-01-12](https://babich.biz/blog/gpt-store/)
- **The revenue-share program remained an invite-only, US-only pilot with an undisclosed formula, long past its own promised Q1 2024 deadline** — creator community threads as recent as this research pass still describe it as opaque and non-expanding. [OpenAI Developer Community thread](https://community.openai.com/t/what-is-the-status-with-gpt-store-revenue-share/839172)
- **The specific, named fear that killed self-promotion**: builders describe the Store as "just OpenAI's way of finding the best use cases that they will take and replicate" — i.e., creators stopped promoting winning GPTs because they expected OpenAI itself to clone them. [Gino Zambe, Medium, 2024-01-31](https://medium.com/@ginozambe/was-the-gpt-store-a-failure-d2a2379fdfc1)
- Of over 3 million custom GPTs created, only an estimated ~159,000 (~5.3%) are even public in the Store — most builder output never reaches the discoverability layer at all, first-party or third-party. MEDIUM confidence (third-party aggregation of the public count, not an OpenAI-published figure). [seo.ai aggregation](https://seo.ai/blog/gpt-store-statistics-facts)

**Why this matters most for SF**: SF's 95%-to-seller split, transparent GMV-fee model, and BYOK structure already avoid GPT Store's worst feature (an opaque, capped, centrally-gated payout pool). But the *discoverability transparency* and *"will the platform clone my winning agent"* fears transfer directly to a flagship-bench model and are not yet addressed by anything in the plan as described — this is the single highest-priority gap to close before launch (see §7).

### 2.2 Poe — first-party official bots coexist with creator bots by DESIGN, because Poe doesn't own the underlying models

Poe runs OpenAI/Anthropic/Google/Meta official bots on the same "Explore" surface as creator-built bots, but structurally Poe pays these labs for inference (a COGS line), unlike OpenAI's GPT Store where OpenAI both hosts the marketplace and owns the flagship model — a materially different competitive dynamic. [help.poe.com](https://help.poe.com/hc/en-us/articles/19944206309524)

Poe's creator monetization is aggressive and specifically designed to reward *promotion*, not just usage: 100% of a new subscriber's first monthly payment (or 50% of first annual payment) goes to the converting creator, plus historically up to **$20 per new Poe subscriber** a creator's bot converts — paid via Stripe, $10 minimum payout. [Poe Creator Monetization FAQs](https://help.poe.com/hc/en-us/articles/21921312368020-Poe-Creator-Monetization-FAQs); [TechCrunch, 2023-10-31](https://techcrunch.com/2023/10/31/quoras-poe-introduces-an-ai-chatbot-creator-economy/)

A targeted search for "Poe creators feel crowded out by official bots" returned no dated complaints — flagged explicitly as an absence-of-evidence, not proof the coexistence model is loved (LOW confidence either way).

### 2.3 ElevenLabs — the clearest "separate surface" precedent found in this entire research pass

ElevenLabs' open creator **Voice Marketplace** paid out $11M to creators as of November 2025, doubling to **$22M by May 22, 2026** — 10,400+ creators earning across 32 languages, fully creator-controlled (creators set licensing terms, can restrict use cases, can pull their voice). [ElevenLabs, 2026-05-22, confirmed via direct fetch](https://elevenlabs.io/blog/22-million-earned-by-voice-creators-on-elevenlabs)

Separately, ElevenLabs runs a distinct **"Iconic Marketplace"** (announced Nov 11-12, 2025) individually licensing celebrity/estate voices (Michael Caine, Matthew McConaughey, 25+ figures including the Maya Angelou and Alan Turing estates) — **architecturally segregated from the open creator Voice Library**, not mixed into the same ranking/discovery surface as ordinary creators. [TechCrunch, 2025-11-12](https://techcrunch.com/2025/11/12/elevenlabs-strike-deals-with-celebs-to-create-ai-audio/); [Variety, 2025-11-11](https://variety.com/2025/digital/news/matthew-mcconaughey-michael-caine-ai-voice-elevenlabs-1236574041/)

**This is the strongest direct precedent for SF's "flagship bench in its own lane" instinct** — ElevenLabs' most prestigious, platform-curated inventory does not compete in the same browse/ranking surface as ordinary creator supply. HIGH confidence, directly dated, named.

### 2.4 Coze and Dify — contest/leaderboard and affiliate-tracked mechanics beat flat revenue share for motivating promotion

Dify's plugin architecture (v1.0.0, Feb 2025) is the most rigorous "eat your own dog food" precedent found: Dify migrated its OWN previously-built-in models and tools into the identical plugin format that third parties use, formally separated into `dify-official-plugins` vs. `dify-plugins` GitHub repos — first-party tools compete in the same listing mechanism as third-party ones rather than being privileged as silent defaults. [Dify Blog](https://dify.ai/blog/dify-v1-0-building-a-vibrant-plugin-ecosystem); verifiable directly via [github.com/langgenius/dify-official-plugins](https://github.com/langgenius/dify-official-plugins) — HIGH confidence.

Dify's Creator Center pays via PartnerStack-style affiliate commissions tied to subscriptions driven by a creator's own published template links — a trackable, creator-attributable loop, not just a revenue pool. [Dify Blog](https://dify.ai/blog/dify-creator-center-template-marketplace-share-your-workflows) — HIGH confidence.

Coze's contest/leaderboard mechanic (winners get algorithmic promotion + higher rate limits, not necessarily cash) is corroborated only by secondary tech-blog aggregation, not a primary ByteDance release — MEDIUM confidence.

### 2.5 Classic marketplace precedent — the Airbnb case is the best model for how a "flagship bench" should function; Amazon/Apple show what to avoid

- **Airbnb (best precedent for "flagship as investment IN sellers, not competition WITH them")**: founders personally shot professional photos door-to-door for NYC hosts pre-scale; listings with professional photos saw 2-3x more bookings and doubled city revenue within a month, scaling to 2,000+ contracted photographers and 13,000+ photos by 2012. This was first-party *effort invested into* third-party supply quality — the opposite mechanic from a first-party product that competes with sellers. **Directly analogous to SF's stated goal of the flagship bench "modeling the playbook for sellers."** [Fast Company](https://www.fastcompany.com/1786980/airbnbs-small-army-photographers-are-making-you-and-them-look-good) — HIGH confidence.
- **Apple's "Sherlocking"**: repeated pattern of first-party OS features cloning popular 3P apps (TapeACall made obsolete by a free call-recording OS feature, among others). A former Apple employee confirmed to NPR fielding "regular complaints from small app developers about Apple copying their services," and developers describe it as "too risky to speak out" for fear of App Store retaliation. **The chilling effect isn't just about lost revenue — it's about the platform being simultaneously your host and your potential competitor.** [NPR, 2024-06-17](https://www.npr.org/2024/06/17/g-s1-4912/apple-app-store-obsolete-sherlocked-tapeacall-watson-copy) — HIGH confidence, named apps and named source.
- **Amazon**: the House Judiciary Antitrust Subcommittee's 2020 report concluded Amazon's dual role as marketplace operator + first-party seller "creates an inherent conflict of interest," alleging Amazon used 3P seller data to inform its own private-label products — escalating in 2022 to a formal DOJ referral over alleged false Congressional testimony. [GeekWire](https://www.geekwire.com/2020/analysis-read-antitrust-case-amazon-key-takeaways/); [The Markup, 2022-03-09](https://themarkup.org/amazons-advantage/2022/03/09/house-antitrust-committee-accuses-amazon-of-lying-to-congress-asks-doj-to-investigate) — HIGH confidence, though one independent 2024 study found Amazon's own-brand products were actually ranked ~50% *less* favorably than comparable 3P brands in at least one dataset, so the self-preferencing narrative isn't uncontested. [The Regulatory Review, 2024-02-27](https://www.theregreview.org/2024/02/27/phillips-how-fair-are-online-retail-recommendations/) — MEDIUM confidence, single study.
- **Uber (the inverse lesson)**: 2010 launch used a small first-party-adjacent fleet, but survival required Uber to legally and structurally commit to NOT owning supply — arguing to regulators it was "merely an intermediary" (like Kayak), not a fleet operator, after a cease-and-desist threatening $5,000/ride + 90 days jail per day of continued operation. MEDIUM confidence on exact figures (consistent across secondary sources, no single definitive primary account reached).

**Cross-case synthesis (my own synthesis across the individually-sourced claims above)**: every platform with documented creator backlash (OpenAI, Apple, Amazon) shares one trait — creators cannot tell, in real time, whether the platform is investing in them or about to replace them, and have no dashboard/leaderboard/affiliate mechanism making their own promotion effort visible and compensated. Every platform with less-documented backlash (Poe, Dify, ElevenLabs) ties payout to a *trackable, creator-attributable* action (a converting subscriber, an affiliate link, a licensed voice) rather than an opaque platform-decided pool. **This is the actionable design lesson, not "flagships are good/bad."**

*(One fabricated-looking statistic was caught and discarded during this research: a specific-sounding "Fiverr disclosed synthetic-profile seeding contributed 23% of cold-start GMV" claim traced back to a source that itself admits no Fiverr filing, earnings call, or press release supports it. Excluded — flagging here so it doesn't resurface elsewhere.)*

---

## 3. Namespace/reputation hygiene precedent

### 3.1 The MCP registry's actual namespace mechanics — confirmed, not just conventional

Fetched directly from the official docs: **"Which authentication method you choose determines the namespace of your server's name."** If GitHub-based auth is chosen, the server's `server.json` name **MUST** be of the form `io.github.username/*` (or `io.github.orgname/*`); if domain-based auth is chosen, it **MUST** be `com.example.*/*`. This is a hard validation rule enforced at publish time, not a soft convention. [modelcontextprotocol.io/registry/authentication](https://modelcontextprotocol.io/registry/authentication) — HIGH confidence, directly fetched primary source.

Domain-based namespaces require actual cryptographic proof of ownership: generate an Ed25519 or ECDSA P-384 keypair, publish a DNS TXT record (`v=MCPv1; k=ed25519; p=${PUBLIC_KEY}`) or host a `/.well-known/mcp-registry-auth` file, then sign a login challenge via the `mcp-publisher` CLI. **This directly validates SF's plan**: a platform could claim `com.seldonframe.*` only by proving DNS control of seldonframe.com — sellers without that domain structurally cannot spoof it. Same source, HIGH confidence.

The registry additionally enforces package-ownership verification and restricts package sources to a fixed allow-list (`registry.npmjs.org`, `pypi.org`, `api.nuget.org`, named container registries) — arbitrary/self-hosted registries are rejected, a second independent anti-impersonation layer. [Glama, 2026-01-24](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements) — HIGH confidence.

**Caveat**: the registry is explicitly labeled "currently in preview... breaking changes or data resets may occur before general availability" — treat today's mechanics as directionally validated, but subject to change before GA.

### 3.2 npm scoping — the closest software-registry precedent, and its documented failure mode is the key lesson

npm's `@org/package` scoping exists explicitly to prevent a package that "looks legit but actually has harmful code" from squatting a trusted name. [npm docs](https://docs.npmjs.com/about-organization-scopes-and-packages/) — but the sharpest cautionary tale found in this entire research project is a 2026 incident on a package host called ClawHub: **23 code-executing plugins were found squatting the `@openclaw` and `@clawhub` org scopes**, because — per Manifold Security's June 22, 2026 writeup — "ClawHub documented the rule requiring scopes to match owners but did not comprehensively enforce it in practice" (only 557 of 1,508 total plugins were scoped, inconsistently). Direct quote: **"When code with that level of capability wears an `@openclaw` or `@clawhub` badge it did not earn, the scope stops being a trust signal and starts being a liability."** ClawHub added a dispute process and unlisted the plugins by June 19, 2026, following a June 17 report. [Manifold Security](https://www.manifold.security/blog/scope-squatting-clawhub-plugins) — HIGH confidence.

**This is the single most important namespace-hygiene finding for SF's plan**: a namespace convention is worthless without an automated, always-enforced ownership check at every publish event — which is exactly what the MCP registry's GitHub-OAuth/DNS challenge is designed to guarantee, *provided it is never bypassed or made optional for convenience*.

### 3.3 Docker Official Images — the closest structural analogy to a two-tier platform/seller namespace

Docker's "Official Images" live under the bare `library/` namespace (`docker pull nginx`, not `docker pull someuser/nginx`), display a distinct verification badge, and undergo continuous CVE scanning in collaboration with the upstream project — while all other images use a user/org-prefixed namespace. [github.com/docker-library/official-images](https://github.com/docker-library/official-images); [Docker Trusted Content docs](https://docs.docker.com/docker-hub/image-library/trusted-content/) — HIGH confidence. This maps almost exactly onto SF's plan: platform flagships could occupy a no-prefix, badge-marked tier while independent sellers use `io.github.<user>/*`.

### 3.4 VS Code Marketplace — precedent for a REVOCABLE trust badge, not a one-time check

The verified-publisher badge requires ≥6 months of extension listing history, a domain ≥6 months old with DNS TXT + HTTPS support — and critically, **"any future Terms of Use or validation violations from the publisher will revoke the verified badge."** [code.visualstudio.com](https://code.visualstudio.com/api/working-with-extensions/publishing-extension); [github.com/microsoft/vscode/issues/127825](https://github.com/microsoft/vscode/issues/127825) — HIGH confidence. Relevant if SF wants a "platform-verified seller" badge that can be pulled on policy violation, not just granted once.

### 3.5 Shopify — runs a genuine dual system worth copying: a first-party-only category PLUS a merit badge open to anyone

Shopify maintains both (a) a distinct "Apps made by Shopify" listing/category exclusively for Shopify-built apps, AND (b) a separate "Built for Shopify" quality badge available to **any** third-party developer who passes rigorous testing, re-reviewed annually and revocable if standards lapse. MEDIUM confidence (WebSearch-sourced, not independently re-fetched from shopify.dev in this pass) — but if confirmed, this two-layer model (identity badge + merit badge, independent of each other) is a genuinely useful refinement SF could adopt: flagships get the identity badge, but any seller — including sellers — can also earn the merit badge.

### 3.6 Zapier is actually a partial counter-example, not a clean confirmation

Zapier's help documentation states integrations "built by Zapier Trusted App Developers are on equal footing with every other app when they are globally activated" — i.e., Zapier deliberately makes "who built this integration" invisible to end users post-launch, which is the *opposite* of a permanent visible platform-vs-seller badge split. Zapier's actual partner tiers are based on "bug reports, feature requests, integration health, and usage" — a performance/reputation signal, not an ownership signal. MEDIUM confidence (secondary help-center source). **This means the namespace-split precedent is stronger in package registries (npm, Docker, the MCP registry itself) than in integration marketplaces (Zapier) — worth knowing SF's plan has more support from one category of precedent than the other.**

---

## 4. Anti-patterns that get vendors flagged or removed

MCP-specific security research has named and dated three attack classes that any directory (including SF's own future one) must screen for, since they are actively exploited today:

- **Tool Poisoning Attack (TPA)**: hidden malicious instructions embedded in a tool's description — invisible to the user, read and obeyed by the model. Invariant Labs disclosed this April 1, 2025 and demonstrated it against a real WhatsApp MCP integration (a "fact of the day" tool secretly rerouting message exfiltration). [Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) — HIGH confidence.
- **Rug Pull / Tool Shadowing**: a server silently swaps a tool's description *after* a user has already approved it, or a malicious server overrides a trusted server's tool behavior via injected text. Same source — HIGH confidence. Direct policy implication: tool descriptions should be treated as immutable post-publish, or any change should trigger re-review.
- **Line Jumping**: malicious instructions execute at `tools/list` time — *before* any user consents to using a tool — discovered by Trail of Bits, published April 21, 2025. [Trail of Bits](https://blog.trailofbits.com/2025/04/21/jumping-the-line-how-mcp-servers-can-attack-you-before-you-ever-use-them/) — HIGH confidence. This means simply *browsing a directory listing* (which returns the tool list) is already an attack surface, not just installing.

Real, disclosed infrastructure failures directly relevant since SF plans to host both flagship and seller endpoints:
- **Smithery.ai suffered a real path-traversal vulnerability exposing 3,000+ hosted MCP servers' credentials** (disclosed June 13, 2025, fixed within ~48 hours, no evidence of pre-patch malicious exploitation). Root cause: an unvalidated Docker build-path parameter let an attacker set the build context to a parent directory and exfiltrate Docker auth credentials. [GitGuardian](https://blog.gitguardian.com/breaking-mcp-server-hosting/); corroborated by [SC World](https://www.scworld.com/news/smithery-ai-fixes-path-traversal-flaw-that-exposed-3000-mcp-servers) — HIGH confidence.
- Independent security scans found malicious/vulnerable MCP servers passing directory listing without rejection at multiple directories — one informal scan reported "22 of 100 Smithery servers came back with security findings." MEDIUM confidence (informal dev.to source, but corroborated by academic literature on MCP ecosystem attack surfaces). **Takeaway: today's largest third-party MCP directories do not reliably pre-screen for malicious code before listing** — a gap SF's plan (platform-hosted-only, cryptographically-namespaced) is well-positioned to close, but only if it actually implements pre-publish scanning that these findings show others apply inconsistently.
- Chrome Web Store's documented removal grounds — "Deceptive Behavior" (false/misleading listing metadata) and "Remote Code Execution" (banning extensions that load and execute JS from external servers) — map structurally onto the MCP tool-poisoning/rug-pull problem (server-controlled, post-install-mutable behavior is exactly what both policies exist to prevent). [Chrome policy update, 2025-01-22](https://developer.chrome.com/blog/cws-policy-updates-2025) — HIGH confidence.
- The npm ecosystem's September 2025 "Shai-Hulud" self-replicating worm compromised 500+ packages (18 packages with 2.6B combined weekly downloads via a single phishing attack on one maintainer) and was live roughly 2 hours before detection/removal. Even the most mature package registry relies on rapid detection-and-removal, not pure prevention — SF's directory strategy should budget for the same reactive posture, not assume prevention alone suffices. [The Hacker News](https://thehackernews.com/2025/09/40-npm-packages-compromised-in-supply.html); [CISA advisory, 2025-09-23](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem) — HIGH confidence.

Glama's TDQS methodology (§1.1) doubles as a graduated anti-pattern filter: low scores suppress distribution without an outright ban — a useful middle ground between "list everything" and "binary reject," worth considering as a complementary layer to hard security screening.

---

## 5. Try-before-you-buy funnel design

### 5.1 The core, well-corroborated design lesson: ration scope/volume, never ration the QUALITY of the free experience

This is the single strongest, most-repeated pattern across HIGH-confidence sources:

- **AI products cannot use classic "free forever" SaaS freemium because marginal cost per free user is non-zero** — "every time a free user hits 'Enter,' your GPUs fire, and your cash burns." [Lenny's Newsletter / Kyle Poyar](https://www.lennysnewsletter.com/p/why-saas-freemium-playbooks-dont-work-in-ai) — HIGH confidence, and directly matches SF's instinct to have the seller (not the platform) pay for taste calls as their own CAC.
- A too-generous free tier can backfire on the QUALITY axis, not the volume axis: Google's own users reportedly asked "why should I pay $20/month when the free version is already smarter than I am?" Google's fix was three specific levers: (a) gate usage *intensity* (tiered call/token allowances), (b) gate *outcomes*/workflow-collapsing features, (c) gate compute-heavy modalities — but never degrade the underlying model quality of what IS free. Same source — HIGH confidence. **Directly actionable**: SF's taste-mode should gate on *N calls* (intensity), while each of those N calls should be full-strength, not a dumbed-down preview.
- Twilio's free trial is generous in *volume* ($15.15 credit ≈ 1,400 SMS or ~1,000 call-minutes, no card required) but restrictive in *scope* (only reaches manually-verified numbers) — the constraint is an abuse/trust boundary, not stinginess. [Twilio docs](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account) — HIGH confidence. **Direct analog for SF**: scope taste-mode calls to "only this visitor's own domain" rather than shrinking call depth — same shape of constraint.
- Intercom's Fin AI agent removes metering *entirely* during its 14-day trial ("unlimited access to Fin outcomes... no limits on usage") rather than shrinking it, then imposes a hard usage floor at conversion. [Fin AI pricing](https://fin.ai/pricing); [Intercom Help](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained) — HIGH confidence. A useful contrast case: Intercom bets the CAC of unmetered trial usage is worth the "aha," which is structurally the same bet SF is asking sellers to make with their taste-mode budget.
- Even OpenAI has repeatedly tightened ChatGPT's free-tier message limits over time — evidence that free-tier size is a live dial under margin pressure industry-wide, not a fixed decision made once. MEDIUM confidence (direction corroborated by multiple secondary sources, exact current numbers not independently pinned down). **Implication**: build the seller-configurable N (0-10 calls) as a live-adjustable config value from day one, exactly matching what even the largest AI labs do in practice.

### 5.2 Personalized, zero-signup grounding on the visitor's own data measurably lifts conversion — this is exactly SF's mechanic

- A vendor case study (Trainual, via the interactive-demo-software ecosystem) reports a **+450% lift in free-trial signups** and **+175% lift in trial-to-paid conversion** when an interactive product demo was shown before signup; separately, "prospects who explore the product before starting a trial activate at 1.8-2x the rate of cold signups." MEDIUM confidence — vendor-reported, not independently audited, but directionally exactly matches SF's "ground on the visitor's own business website before any signup" mechanic.
- No primary source in this research pass provided a controlled experiment specifically on "optimal N free API calls" — this is a genuine, disclosed gap in the public literature (not a search failure). **SF's planned 0-10 seller-configurable range is not contradicted by any evidence found, but it is also not validated by a specific number from outside research — an internal A/B test (e.g., 3 vs. 10) would be original data, not something shortcut-able from existing literature.**

### 5.3 Numbers that are folklore-adjacent — flagged, not hidden

- "7-14 day trials outperform 30-day trials" is repeated across several secondary sources but could not be traced to one verifiable primary document — LOW-MEDIUM confidence, treat as directionally plausible, not settled fact.
- Freemium converts roughly 1/3 as well as free-trial by pure conversion rate (freemium ~5% of signups convert vs. ~17% for free-trial, per a 450+-company OpenView/Amplitude survey), but freemium converts 25% more often *without sales involvement* (62% self-serve vs. 45% for trials). [OpenView Partners](https://openviewpartners.com/blog/freemium-vs-free-trial/) — HIGH confidence, named survey and sample size. Relevant context for SF: the taste-mode/fork-or-deploy funnel is closer to a "reverse trial" (full-strength taste, no signup, then a hard fork/deploy door) than either pure model — Airtable's reverse-trial framing ("You build up trust with a user over many months, but you can lose them in one conversion conversation" — Airtable Head of Growth Lauryn Isford) is the closest qualitative match. [OpenView, "Reverse Trials"](https://openviewpartners.com/blog/your-guide-to-reverse-trials/) — MEDIUM confidence (strong case study, no exact reverse-trial percentage benchmark given).

---

## 6. Q2: The flagship bench

### 6.1 Ranked candidates with taste-mode wow score (1-5) and reasoning

| Rank | Agent | Taste-wow (1-5) | One-line why | Saturation |
|---|---|---|---|---|
| **1** | **Website chat + booking agent** | **5** | Grounds instantly on any public site (services/hours/pricing), produces a live, multi-turn conversation in a single anonymous session — the only candidate where the *entire* demo happens inside the taste-mode call itself, no external event needed. | Low-medium as an AI-agent SKU (Intercom/Drift dominate enterprise chat, but SMB-grade *booking-integrated* chat agents are less commoditized) |
| **2** | **Quote follow-up / estimate-chaser** | **5** | No dedicated AI-agent incumbent found anywhere in this research (§6.3) — genuinely under-served; produces one grounded artifact (a draft follow-up SMS referencing the business's real service/price) in a single tool call, with no phone infrastructure or real customer event required. | Lowest of all 8 candidates |
| **3** | **Speed-to-lead SMS responder** | **4** | Carries the single best-verified "killer statistic" of the bench (Oldroyd/MIT: 5-min response = 100x more likely to make contact, 21x more likely to qualify, n=15,000+ leads) and is demoable as a grounded draft-SMS artifact. | Low-medium as a discrete SKU (bundled into CRMs like LeadAngel/Kixie rather than sold standalone — this is actually an *advantage* for a marketplace entrant) |
| **4** | **After-hours triage / emergency dispatch** | **3** | Strong money story (a missed emergency call is a lost high-ticket job) but the demo mechanically wants a live call, which is the hardest thing to fake convincingly anonymously in a directory. | High (decades-old human-staffed answering-service incumbents: AnswerFirst, Nexa, Anserve, all AI-wrapping now) |
| **5** | **Missed-call text-back** | **3** | Best-verified demand stat (62% of SMB calls go unanswered, 411 Locals study n=85 businesses) but is a **native, zero-cost toggle already inside GoHighLevel**, the dominant agency-in-a-box competitor — weak differentiation even though the pain is real. | Highest of the reactive-event agents (Podium, Birdeye, Weave, Chekkit, Broadly, GHL-native) |
| **6** | **Review-request agent** | **2** | Long ago commoditized into pure trigger→delay→send-templated-link automation — no LLM needed for the core mechanic, so it demos as a mail-merge, not an "agent." | Most saturated category on the entire bench (Birdeye 3,980 G2 reviews/150k+ customers, Podium 2,024 G2 reviews, NiceJob, Grade.us all mature) |
| **7** | **Appointment reminder / no-show reducer** | **2** | Real ROI (no-show reduction figures cluster 22-65% depending on study) but is bundled as a feature of nearly every vertical SaaS (dental PMS, salon software, Calendly-likes) rather than sold as a standalone agent — hard to differentiate. | High as a bundled feature, low as a discrete AI-agent SKU |
| **8** | **24/7 AI phone receptionist** *(already exists in SF)* | **2 as a taste-mode candidate specifically** *(product itself is strong — this score is about anonymous async demo-ability only)* | Deepest incumbent field of the whole bench (Smith.ai, Ruby, Abby Connect, Rosie, Synthflow, PhoneRuby, Goodcall all ranked in a single 2026 comparison) and the hardest to demo anonymously/asynchronously — needs a live phone call, which is the one thing a directory-embedded taste mode can't easily simulate. | Highest incumbent depth of any category researched |

### 6.2 Recommended launch order for the first 4

**1. Website chat + booking agent → 2. Quote follow-up/estimate-chaser → 3. Speed-to-lead SMS responder → 4. After-hours triage**

Reasoning: the first two are the only candidates where the taste-mode demo is *mechanically* zero-friction (no live call, no real customer event, pure grounding + single tool call) — they should launch first specifically to prove the taste-mode mechanic itself works well before spending flagship-build effort on categories with harder demo mechanics. Speed-to-lead earns 3rd by combining the strongest verified statistic in the whole research set with real (if bundled) demand. After-hours triage rounds out the first four because its money story is the clearest ("a missed emergency call is a lost job") even though its demo is weaker — it can lean on grounded example transcripts rather than a live call for the taste mode. Missed-call-text-back and review-requests, despite highest raw demand signals, are recommended as **fast-follow adds once the bench is established**, not launch agents — their commoditization (especially the GoHighLevel-native overlap) makes them weak flagship differentiators even though they're worth having in the catalog for completeness and cross-sell.

### 6.3 Supporting evidence for the ranking

- **Quote-follow-up has no dedicated AI-agent incumbent**: targeted searches surfaced only feature-modules inside broader field-service CRMs (Housecall Pro, Estimate Rocket, BuildOps) — none market a standalone AI follow-up agent. Absence-of-evidence from a specifically-targeted search is itself informative here. HIGH confidence on the absence; the closest available demo-hook statistic ("80% of sales require 5 follow-ups") could not be traced to a primary study — LOW confidence, use as color only, not as a headline claim.
- **Missed-call text-back saturation, quantified**: GoHighLevel offers it as a native, zero-config Settings-menu toggle used across its entire agency reseller base; it's also cross-sold as a named feature by Podium, Birdeye, Weave, Chekkit, Emitrr, Broadly, MessageDesk, SalesCaptain. [GoHighLevel help docs](https://help.gohighlevel.com/support/solutions/articles/48001239140) — HIGH confidence, direct vendor documentation.
- **Review-request saturation, quantified**: Birdeye (3,980 G2 reviews, 4.7/5, 150,000+ customers claimed), Podium (2,024 G2 reviews, 4.5/5), NiceJob (410 G2 reviews), Grade.us (244 Capterra reviews) — G2/Capterra review counts pulled directly as a market-size proxy. [G2 Birdeye](https://www.g2.com/products/birdeye/reviews), [G2 Podium](https://www.g2.com/products/podium/reviews) — HIGH confidence.
- **AI receptionist incumbent depth, quantified**: a single 2026 comparison roundup scores AIRA 24/25, Rosie 21/25, Smith.ai and Abby Connect tied at 19/25, Ruby 14/25, with pricing $49-99+/month across the field. [getaira.io comparison](https://www.getaira.io/blog/best-ai-receptionist) — HIGH confidence (internally consistent, direct comparison content), though this specific source has a commercial interest in its own product ranking highest, so treat the *relative depth of the field* as the reliable signal, not the exact rank order.
- **After-hours/emergency dispatch overlaps a decades-old human-staffed industry**: AnswerFirst, The Perfect Answer, AnswerOne of Texas, Anserve, Responsive Answering, Nexa all explicitly serve plumber/HVAC/electrician verticals with 24/7 live-operator dispatch from $29/month — an AI-wrapping opportunity on an old category, not greenfield. [nexa.com/home-services](https://www.nexa.com/home-services) — HIGH confidence.

### 6.4 On the demand-side statistics — use with the caveats attached

- **Speed-to-lead**: the rigorous, traceable figure is the **Oldroyd/InsideSales.com/MIT Lead Response Management Study** (n=15,000+ leads): responding within 5 minutes makes a lead 100x more likely to be contacted and 21x more likely to qualify. A second reasonably-traceable figure is the **Velocify/Ellie Mae study** (n=3.5M leads): calling within 1 minute vs. 2+ minutes increases conversion 391%. **Both are stronger and more defensible than the "78% buy from first responder" figure**, which could not be traced to any primary document across multiple searches and different phrasings — see §7 for why this matters.
- **Missed calls**: 62% of SMB calls go unanswered, per a 411 Locals study of 85 businesses across 58 industries (37.8% answered live + voicemail, 24.3% no response at all — the 62.2% is voicemail+no-response combined). MEDIUM confidence — a real, named study, but n=85 is modest for a claim this broadly cited. The oft-repeated "$126,000/year lost revenue" figure is a single vendor estimate (AMBS Call Center) recycled across many SEO pages with no disclosed methodology — LOW confidence as a hard number, fine as a directional hook only.
- **No-show reduction**: figures cluster around 22-65% depending on channel/industry, with one oddly-precise claim ("22.95% reduction across 1,604,184 appointments at 64 dental practices") suggesting a real underlying study behind a vendor-blog citation — MEDIUM confidence on that specific number, LOW on the higher vendor-claimed ranges (40-90%).

---

## 7. Findings that CONTRADICT the current plan

Called out loudest, in priority order:

1. **The "78% buy from whoever responds first" statistic (used implicitly in the brief's framing of speed-to-lead) has no traceable primary source across multiple independent searches and rewordings.** It is variously attributed to McKinsey, InsideSales, Forrester, or "a Lead Connect study" depending on which SEO blog repeats it, with no source linking to an original document or methodology. **Do not put this number in demo copy or marketing.** Use the Oldroyd/MIT figure (100x more likely to contact within 5 minutes, n=15,000+ leads) or the Velocify figure (391% conversion lift calling within 1 minute, n=3.5M leads) instead — both are more defensible and, if anything, more dramatic.

2. **The GPT Store — the single closest real-world precedent for "platform builds flagship inventory in the same marketplace as third-party sellers" — is widely blamed by its own creator community for killing third-party promotion, specifically because of opaque discoverability and the fear that the platform will clone what works.** SF's plan as described does not yet specify how flagship-bench visibility/ranking will be kept transparent to sellers, or how SF will publicly commit to NOT cloning a seller's breakout hit into the flagship namespace. This is not a reason to abandon the flagship-bench idea — Dify's "our own tools compete in the same plugin format as everyone else's" model and ElevenLabs' "separate surface for our most prestigious inventory" model are both healthier precedents SF could point to — but it is a real gap between the plan as described and what the evidence says is necessary for seller trust.

3. **Two of the eight seed-list agents SF is treating as ordinary bench candidates — missed-call text-back and review-requests — are also the two most search-demand-validated in raw terms, which could tempt prioritizing them first. The evidence says the opposite: both are the most commoditized categories found in this entire research pass**, including missed-call text-back being a literal free, zero-config toggle inside GoHighLevel, the dominant agency-in-a-box competitor. Leading the flagship launch with either risks the flagship bench looking like "a worse version of a feature GoHighLevel already gives away," which undercuts the entire "model the playbook for sellers" goal — sellers watching the flagship bench should see SF demonstrate differentiated, non-commodity agents, not race an incumbent's free feature.

4. **A quality-score-gates-visibility mechanism (Glama, Smithery) means a technically-correct flagship agent can still be invisible in directories due to weak tool/description writing** — this is a real, verified risk to the "list flagship agents in directories" half of the plan that has nothing to do with the agent's actual quality, and should be budgeted as its own workstream (description QA per the 4 studied dimensions: accuracy, functionality, completeness, conciseness) rather than assumed to be free with a good agent.

5. **"Instructions-payload-as-a-growth-hook" and "MCP GEO" — both named explicitly in the original brief's research questions — are not established practices anywhere in the current MCP ecosystem discourse as of mid-2026.** This is not a contradiction of the plan so much as a correction to an assumption embedded in the brief: there is no existing playbook to follow here. If SF wants to use the `instructions` field or GEO-style optimization as a growth lever, it will be inventing the practice, not adopting a known one — worth treating as a deliberate experiment with its own measurement plan, not a known lever to pull.

6. **No MCP directory publishes browse-to-install conversion data of any kind.** Any internal SF projection of "N% of directory browsers will try the taste mode, M% of those will fork/deploy" is not grounded in any published external benchmark — it would be a genuinely novel data point, and SF should plan to instrument and publish this itself (which, per finding 5, could become a differentiator).

---

## 8. Full source list

**MCP directory mechanics & registry**
- [modelcontextprotocol.io/registry/authentication](https://modelcontextprotocol.io/registry/authentication) — official namespace/auth mechanics
- [glama.ai/blog/2026-04-03-tool-definition-quality-score-tdqs](https://glama.ai/blog/2026-04-03-tool-definition-quality-score-tdqs) — TDQS methodology
- [glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements) — registry package-ownership rules
- [arxiv.org/abs/2602.18914](https://arxiv.org/abs/2602.18914) — "From Docs to Descriptions" (72% vs 20% baseline selection study)
- [arxiv.org/html/2602.14878v1](https://arxiv.org/html/2602.14878v1) — "MCP Tool Descriptions Are Smelly!" (97.1% defect rate study)
- [anthropic.com/engineering/writing-tools-for-agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — 2025-09-11
- [anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp) — 2025-11-04
- [medium.com/@francofuji — Smithery scoring](https://medium.com/@francofuji/your-mcp-server-scores-60-100-on-smithery-what-it-means-and-how-to-hit-100-edd924758268) — 2026-03-10
- [pulsemcp.com/servers](https://www.pulsemcp.com/servers), [glama.ai/mcp/servers](https://glama.ai/mcp/servers), [smithery.ai/servers](https://smithery.ai/servers) — directory server counts
- [truefoundry.com/blog/best-mcp-registries](https://www.truefoundry.com/blog/best-mcp-registries) — directory comparison
- [smithery.ai/docs/build](https://smithery.ai/docs/build), [developers.cloudflare.com/agents/guides/remote-mcp-server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/) — remote/hosted MCP friction

**MCP security & anti-patterns**
- [invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) — 2025-04-01
- [blog.trailofbits.com/2025/04/21/jumping-the-line](https://blog.trailofbits.com/2025/04/21/jumping-the-line-how-mcp-servers-can-attack-you-before-you-ever-use-them/) — line jumping, 2025-04-21
- [blog.gitguardian.com/breaking-mcp-server-hosting](https://blog.gitguardian.com/breaking-mcp-server-hosting/) — Smithery path traversal
- [thehackernews.com/2025/09 — npm Shai-Hulud worm](https://thehackernews.com/2025/09/40-npm-packages-compromised-in-supply.html); [cisa.gov advisory 2025-09-23](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [developer.chrome.com/blog/cws-policy-updates-2025](https://developer.chrome.com/blog/cws-policy-updates-2025) — 2025-01-22

**Namespace precedent**
- [docs.npmjs.com/about-organization-scopes-and-packages](https://docs.npmjs.com/about-organization-scopes-and-packages/)
- [manifold.security/blog/scope-squatting-clawhub-plugins](https://www.manifold.security/blog/scope-squatting-clawhub-plugins) — 2026-06-22
- [github.com/docker-library/official-images](https://github.com/docker-library/official-images); [docs.docker.com/docker-hub/image-library/trusted-content](https://docs.docker.com/docker-hub/image-library/trusted-content/)
- [code.visualstudio.com/api/working-with-extensions/publishing-extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension); [github.com/microsoft/vscode/issues/127825](https://github.com/microsoft/vscode/issues/127825)
- [help.zapier.com — Trusted App Developer](https://help.zapier.com/hc/en-us/articles/8496275663501-Request-to-add-a-new-app-to-Zapier); [zapier.com/developer-platform/partner-program](https://zapier.com/developer-platform/partner-program)

**Marketplace seeding precedent**
- [openai.com/index/introducing-the-gpt-store](https://openai.com/index/introducing-the-gpt-store/); [venturebeat.com 2024-01-10](https://venturebeat.com/ai/openai-launches-gpt-store-but-revenue-sharing-is-still-to-come/)
- [community.openai.com — revenue share status thread](https://community.openai.com/t/what-is-the-status-with-gpt-store-revenue-share/839172)
- [babich.biz/blog/gpt-store — UX audit](https://babich.biz/blog/gpt-store/) — 2024-01-12
- [medium.com/@ginozambe — "Was the GPT Store a Failure?"](https://medium.com/@ginozambe/was-the-gpt-store-a-failure-d2a2379fdfc1) — 2024-01-31
- [help.poe.com — Creator Monetization FAQs](https://help.poe.com/hc/en-us/articles/21921312368020-Poe-Creator-Monetization-FAQs); [techcrunch.com 2023-10-31](https://techcrunch.com/2023/10/31/quoras-poe-introduces-an-ai-chatbot-creator-economy/)
- [elevenlabs.io/blog/22-million-earned-by-voice-creators-on-elevenlabs](https://elevenlabs.io/blog/22-million-earned-by-voice-creators-on-elevenlabs) — 2026-05-22, directly verified
- [techcrunch.com/2025/11/12 — ElevenLabs Iconic Marketplace](https://techcrunch.com/2025/11/12/elevenlabs-strike-deals-with-celebs-to-create-ai-audio/); [variety.com 2025-11-11](https://variety.com/2025/digital/news/matthew-mcconaughey-michael-caine-ai-voice-elevenlabs-1236574041/)
- [dify.ai/blog/dify-v1-0-building-a-vibrant-plugin-ecosystem](https://dify.ai/blog/dify-v1-0-building-a-vibrant-plugin-ecosystem); [github.com/langgenius/dify-official-plugins](https://github.com/langgenius/dify-official-plugins)
- [dify.ai/blog/dify-creator-center-template-marketplace-share-your-workflows](https://dify.ai/blog/dify-creator-center-template-marketplace-share-your-workflows)
- [geekwire.com — Amazon antitrust analysis](https://www.geekwire.com/2020/analysis-read-antitrust-case-amazon-key-takeaways/); [cnbc.com 2020-10-06](https://www.cnbc.com/2020/10/06/amazon-bullies-partners-and-vendors-says-antitrust-subcommittee.html)
- [themarkup.org 2022-03-09](https://themarkup.org/amazons-advantage/2022/03/09/house-antitrust-committee-accuses-amazon-of-lying-to-congress-asks-doj-to-investigate)
- [theregreview.org 2024-02-27](https://www.theregreview.org/2024/02/27/phillips-how-fair-are-online-retail-recommendations/) — counter-evidence on Amazon self-preferencing
- [fastcompany.com — Airbnb photographers](https://www.fastcompany.com/1786980/airbnbs-small-army-photographers-are-making-you-and-them-look-good)
- [npr.org/2024/06/17 — Apple Sherlocking](https://www.npr.org/2024/06/17/g-s1-4912/apple-app-store-obsolete-sherlocked-tapeacall-watson-copy)

**Freemium/PLG funnel design**
- [openviewpartners.com/blog/freemium-vs-free-trial](https://openviewpartners.com/blog/freemium-vs-free-trial/); [openviewpartners.com — PLG benchmarks](https://openviewpartners.com/blog/your-guide-to-product-led-growth-benchmarks/)
- [openviewpartners.com/blog/your-guide-to-reverse-trials](https://openviewpartners.com/blog/your-guide-to-reverse-trials/) — Airtable case
- [lennysnewsletter.com/p/why-saas-freemium-playbooks-dont-work-in-ai](https://www.lennysnewsletter.com/p/why-saas-freemium-playbooks-dont-work-in-ai) — Kyle Poyar
- [twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account); [help.twilio.com](https://help.twilio.com/articles/223136107-How-does-Twilio-s-Free-Trial-work)
- [fin.ai/pricing](https://fin.ai/pricing); [intercom.com/help — Fin plans explained](https://www.intercom.com/help/en/articles/9061614-fin-and-intercom-plans-explained)
- [help.openai.com — ChatGPT Free Tier FAQ](https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq)

**SMB agent demand & saturation**
- [leadresponse.co/blog/speed-to-lead-statistics](https://leadresponse.co/blog/speed-to-lead-statistics) — 2026 (Oldroyd/MIT and Velocify figures; also site of the unverifiable "78%" claim)
- [getaira.io/blog/missed-business-calls-statistics](https://www.getaira.io/blog/missed-business-calls-statistics) — 411 Locals study citation
- [help.gohighlevel.com — missed call text back](https://help.gohighlevel.com/support/solutions/articles/48001239140); [blog.gohighlevel.com](https://blog.gohighlevel.com/quick-easy-wins-with-highlevel-missed-call-text-back/)
- [community.n8n.io — missed call text-back template](https://community.n8n.io/t/auto-text-missed-callers-within-60-seconds-n8n-workflow-for-service-businesses-full-json/300980)
- [g2.com/products/birdeye/reviews](https://www.g2.com/products/birdeye/reviews); [g2.com/products/podium/reviews](https://www.g2.com/products/podium/reviews)
- [inshalytics.com — dental no-show study citation](https://inshalytics.com/blogs/dental-automated-appointment-reminders); [etisia.com/no-show-statistics](https://www.etisia.com/no-show-statistics)
- [getaira.io/blog/best-ai-receptionist](https://www.getaira.io/blog/best-ai-receptionist) — 2026 comparison roundup
- [nexa.com/home-services](https://www.nexa.com/home-services); [anserve.com/hvac-answering-service](https://www.anserve.com/hvac-answering-service/)
- [quotechaser.online/estimate-follow-up-software](https://quotechaser.online/estimate-follow-up-software/); [buildops.com/resources/contractor-quote-tool](https://buildops.com/resources/contractor-quote-tool/)

---

*Methodology note: this report was produced via a 5-angle parallel search fan-out, each angle returning 8-20 falsifiable claims with source/date/quote/confidence, followed by a targeted adversarial verification pass on the highest-stakes and most-repeated claims (the speed-to-lead statistic, the MCP registry namespace mechanics, the GPT Store revenue-share status, the ElevenLabs marketplace structure, and the arXiv tool-selection study) via independent re-fetch. One fabricated-sounding statistic (a purported Fiverr cold-start GMV disclosure) was caught during the research process itself and is explicitly excluded rather than silently omitted. Confidence levels (HIGH/MEDIUM/LOW) are preserved per-claim throughout rather than flattened, per the brief's request to be skeptical of listicles.*
