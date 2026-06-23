# Programmatic SEO/GEO Agent-Page Engine — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. No migration (static pages + a data registry).

**Goal:** The Zapier-playbook growth engine — generate hundreds of **public, SEO + GEO-optimized** agent pages targeting what people search on Google *and* ask LLMs, each ending in the **dual CTA** (Deploy for my business / Rent via MCP). Tier-1 (job) + Tier-2 (job×vertical) first, ~160 pages.

**Research-grounded (verified):** single-dimension pages out-pull pairs (Zapier: Gmail 60k/mo vs a pair ~800/mo) → build **job** + **job×vertical** first. **GEO ≠ keyword SEO** — citing **sources/quotes/stats** lifts LLM-answer visibility +30–40% (Princeton GEO); keyword-stuffing does nothing. So pages must be **citable, stat-backed answers** with `schema.org` + FAQ markup. The SeldonFrame edge over Zapier: every page ends in a **working agent** ("Deploy in 60 seconds"), not a how-to.

**Architecture:** A pure **data registry** (jobs × verticals + per-combo copy + the canonical agent each maps to) → Next.js `(public)` routes with `generateStaticParams` → a world-class GEO template (the marketing system) → `sitemap.xml` + `llms.txt`. Canonical jobs map to the starter pack (`lib/agent-templates/starter-pack.ts`: ai-phone-receptionist, website-support-chat, lead-qualifier-intake, booking-concierge, quote-estimate-assistant, social-content-assistant) + the `/automations` archetypes (review-requester, missed-call-text-back, speed-to-lead, win-back).

**Tech Stack:** Next.js 16 / React 19. Conventions: tests `cd packages/crm && node --import tsx --test`; tsc 0-new (~14 `.next/types` baseline ok); `bash scripts/check-use-server.sh src`; marketing palette (`#F6F2EA`/`#221D17`/`#00897B`) + Hanken/Newsreader. **No migration.**

---

## Task 1: The data registry (pure, TDD)
**Files:** Create `lib/seo/agent-pages.ts` + `…/verticals.ts`; Test `…/agent-pages.spec.ts`.
- [ ] `AGENT_JOBS` (~10): each `{ slug, name, h1, oneLiner, painStat (cited: text+source), whatItDoes[], faq[{q,a}], surfaces[], canonicalAgentSlug (starter id or archetype), mcpToolHint }`. E.g. `ai-receptionist` → "62% of calls to small businesses go unanswered" (cite the source) → maps to `ai-phone-receptionist`.
- [ ] `VERTICALS` (~16): `{ slug, name, plural, painHook }` — plumbers, hvac, roofers, electricians, landscapers, garage-door, dentists, med-spas, chiropractors, law-firms, real-estate, salons, barbers, auto-repair, restaurants, cleaning, pet-services, fitness.
- [ ] Pure helpers: `getJob(slug)`, `getVertical(slug)`, `allJobVerticalPairs()`, `composePageCopy(job, vertical?)` → `{ title, h1, metaDescription, intro, faq[] }` (vertical-aware: "AI Receptionist for Plumbers — never miss a service call").
- [ ] TDD: every job has a cited stat + ≥3 FAQ + a valid canonicalAgentSlug; pair composition tailors the vertical; unknown slug throws. **Commit** `feat(seo): agent-page data registry (jobs × verticals, cited stats, TDD)`.

## Task 2: Routes + static params
**Files:** Create `app/(public)/agents/[job]/page.tsx` + `app/(public)/agents/[job]/for/[vertical]/page.tsx`.
- [ ] `generateStaticParams` from the registry (Tier-1: all jobs; Tier-2: all job×vertical pairs). `generateMetadata` per page (title/description/canonical/OG). Public, no auth.
- [ ] tsc 0-new. **Commit** `feat(seo): /agents/[job] + /agents/[job]/for/[vertical] static routes`.

## Task 3: The GEO page template (world-class + schema.org)
**Files:** Create `components/seo/agent-page.tsx` (+ a dual-CTA component).
- [ ] Sections: editorial **hero** (h1 = the composed headline, the cited pain stat prominent), **what it does**, **how it works (3 steps)**, **surfaces** (voice/chat/SMS/email pills), a **FAQ** (real `<details>` or accordion), **"more agents for [vertical]"** cross-links (the flywheel), and the **dual CTA** block.
- [ ] **GEO baked in:** semantic `<h1>`/`<h2>`; **cited statistics** rendered with the source; `schema.org` **`SoftwareApplication` + `FAQPage`** JSON-LD via `dangerouslySetInnerHTML` (FAQPage built from the registry FAQ); clean, answer-shaped prose (no keyword stuffing).
- [ ] **Dual CTA:** **"Deploy it for my business →"** (primary) + **"Rent via MCP"** (secondary, reveals the endpoint pattern + a copyable snippet). Match the marketplace design. **Commit** `feat(seo): world-class GEO agent-page template (schema.org + FAQ + dual CTA)`.

## Task 4: CTA wiring (Deploy → magic build · Rent → MCP)
**Files:** the CTA component + the deploy target.
- [ ] **Deploy CTA** → route to the magic-first-run build flow **carrying the agent** (e.g. `/clients/new?agent=<canonicalAgentSlug>&intent=build` — reuse the existing keyless/anonymous build; the agent is instantiated post-build via the starter-pack `instantiateStarter`/install path so the user lands with *that* agent, Soul-grounded). If the build flow doesn't yet accept an `agent` param, thread it minimally (note exactly what you wired).
- [ ] **Rent CTA** → if a live marketplace listing exists for the canonical agent, link to `/marketplace/[slug]` + show its MCP endpoint/config; else show the generic rent-via-MCP how-to. **Commit** `feat(seo): dual-CTA wiring — deploy carries the agent, rent links MCP`.

## Task 5: Discovery — sitemap + llms.txt + flywheel link
**Files:** `app/sitemap.ts` (or extend), `app/llms.txt/route.ts` (or a static `public/llms.txt`).
- [ ] `sitemap.xml` includes every `/agents/*` page (+ the marketplace pages). `llms.txt` lists the agent pages with one-line descriptions (the GEO map for LLMs). Each programmatic page links to the matching live `/marketplace/[slug]` (and vice-versa where feasible). **Commit** `feat(seo): sitemap + llms.txt + programmatic↔marketplace links`.

## Task 6: Verify
- [ ] Suites green; tsc 0-new; `check-use-server` clean; the `(public)/agents` routes compile + `generateStaticParams` yields ~160+ pages.
- [ ] **Report:** the registry counts (jobs/verticals/pages), the GEO coverage (schema.org + cited stats + FAQ), the dual-CTA wiring (what the deploy param does + the rent link), sitemap/llms.txt, the regression statement (additive public routes; no migration; marketplace untouched), new-test count, and the honest gap — live: load `/agents/ai-receptionist/for/plumbers`, read it as a cold plumber, click Deploy.

## Self-Review
- Coverage: registry (T1) ✓; routes (T2) ✓; world-class GEO template + schema.org (T3) ✓; dual-CTA → magic build / MCP (T4) ✓; sitemap+llms.txt+flywheel (T5) ✓; Tier-1+2 ~160 pages ✓.
- Deferred: Tier-3 job×tool + Tier-4 tool×tool (the long tail — same engine, more registry rows, with a keyword tool); per-page OG image generation.
