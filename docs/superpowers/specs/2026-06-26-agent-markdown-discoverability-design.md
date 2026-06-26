# Agent-Markdown Discoverability (GEO) — Design

**Date:** 2026-06-26
**Status:** Approved (design) — Max requested
**Author:** brainstormed with Max

## Problem

Buyers increasingly discover services by **asking an AI** ("find me an AI receptionist for my plumbing business"), and coding/agent tools fetch URLs as `text/markdown`. SeldonFrame is a platform that **sells agents** — so its public surface (marketing site, the agent marketplace, the ~171 `/ai-agents` SEO pages) should be the *most* agent-legible site on the web. Today those pages are rich HTML (Claude-Design inline styles, lots of nav/script chrome) — an LLM pulling the page wastes tokens on markup and often gives up. We want **clean Markdown for agents, the beautiful UI for humans**, at the same URLs.

## First principle (from the field, honestly)

These are **emerging conventions, not committed standards** — no major provider has promised to crawl `llms.txt` or `.md` unprompted. We implement anyway because (a) the engineering cost is near zero, (b) the real, happening-now use cases are **humans pasting URLs into ChatGPT/Claude** and **coding agents fetching docs**, and (c) early standards adoption has a history of paying off. We ship the standards-based pieces, **skip the debunked ones**, and **measure** server-side (the only reliable signal).

## Scope — priority pages

1. **`/marketplace` + `/marketplace/[slug]`** — the catalog + each agent listing (the thing an AI reads when a buyer asks "what agents can I buy"). Highest value.
2. **`/ai-agents`, `/ai-agents/[job]`, `/ai-agents/[job]/for/[vertical]`** — the GEO landing pages.
3. **seldonframe.com** marketing root + key pages (home, pricing, how-it-works).

## Mechanism (Next.js — single source of truth, no drift)

The marketplace + ai-agents pages are **data-driven** (agent-listings, the job/vertical registries). So the Markdown renders from the **same data** the HTML uses — never a parallel content store (the article's #1 maintenance trap). A shared `renderListingMarkdown(listing)` / `renderAiAgentMarkdown(job, vertical)` produces clean Markdown from the same source the page component reads.

Six techniques, ordered by impact/effort:

0. **`robots.txt` audit + `Content-Signal:`** — confirm `GPTBot`/`ClaudeBot`/`PerplexityBot` aren't blocked; add Cloudflare's CC0 line `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (Max confirms the `ai-train` value — it's a policy choice). One-line edit.
1. **`/llms.txt`** — a curated Markdown map at the site root: H1 + blockquote summary + H2 sections of annotated links (the marketplace, the top agent categories, pricing, docs). A README for AI-mediated conversations, not a sitemap.
2. **`.md` routes** — `/<path>.md` serves the clean Markdown twin (`/marketplace.md`, `/marketplace/<slug>.md`, `/ai-agents/<job>.md`, `/index.md`). Rendered from the same data → no drift.
3. **`Accept: text/markdown` content negotiation** — the standards-based core (Claude Code/Cursor already send it). Same URL, Markdown when the client explicitly prefers it, HTML otherwise. The four non-negotiables: **compare q-values** (don't substring-match), **resolve ties to Markdown only when `text/markdown` is explicitly named** (so `Accept: */*` browsers still get HTML), **return `406`** when neither is acceptable (but not on an explicit `.md` URL), and set **`Vary: Accept`** + a `Link` header on both representations. Implemented in Next.js **middleware** (`proxy`/middleware) so one handler covers every page; `.md` URLs handled by a catch-all route or rewrite.
4. **`<link rel="alternate" type="text/markdown">` + HTTP `Link` header** — advertise the `.md` twin to DOM-parsing crawlers (the tag) and headless fetchers (the header). Both point at the `.md`; the `.md` points back at HTML.
5. **Visually-hidden Markdown pointer** — an `aria-hidden` `.visually-hidden` div on each page ("A Markdown version of this page is available at …") for the human-pastes-URL-into-ChatGPT flow.
6. **Analytics on the AI endpoints** — server-side log of `.md` / `llms.txt` fetches by `User-Agent` + referrer (`chatgpt.com`/`claude.ai`/`perplexity.ai`). AI crawlers don't run JS — must be server-side. This is how we know any of it works.

(Optional, low priority) `/llms-full.txt` → redirect to `/index.md` for the marketing site; for the marketplace, a concatenated catalog could be genuinely useful (an AI ingests the whole agent catalog in one fetch) — revisit after measuring.

## Anti-patterns — do NOT implement (debunked)

`ai.txt` / `.well-known/ai.txt`, `<meta name="ai-content-url">` / `<meta name="llms">`, HTML comments as AI hints, human/AI toggle buttons, **User-Agent sniffing to serve Markdown** (that's cloaking — use `Accept` negotiation), dedicated "AI info pages", and **JSON-LD/schema.org *for LLM visibility*** (controlled tests show ChatGPT/Claude/Perplexity ignore it — but keep existing schema.org for Google/Bing; just don't add it expecting LLM lift).

## Content beats infrastructure (the real lever)

The Princeton/IIT-Delhi GEO study: what actually moved AI visibility was **content** — direct quotations (+43%), in-text statistics (+33%), citing authoritative sources (+115% for low-ranked). So the marketplace/ai-agents Markdown should lead with concrete, quotable specifics (what the agent does, real numbers, named integrations), not metadata.

## Not cloaking

Same URL, same content, different representation, declared via `Vary: Accept` — exactly how `Accept: application/json` vs `text/html` has worked since 1997. Cloaking is serving bots a *different article*; we serve the *same* content as Markdown.

## Verification

Run `acceptmarkdown.com` (Accept/Vary/406/q-values) + `isitagentready.com` (robots/sitemap/Link/negotiation) until green. Failures are typically one-line fixes.

## Phasing

- **M1 (highest value):** `renderListingMarkdown` + `.md` routes for `/marketplace` + `/marketplace/[slug]` + `/llms.txt` + the `Accept` middleware (q-values, ties, 406, `Vary`, `Link`). *After M1: an AI asked "what agents can I buy on SeldonFrame" gets a clean, complete catalog.*
- **M2:** `.md` for the `/ai-agents/*` pages (render from the job/vertical data) + the `<link>`/hidden-pointer + `Content-Signal:` line.
- **M3:** marketing root `.md` (home/pricing/how-it-works) + server-side analytics on the AI endpoints + run the two scanners.

## Non-goals

- A full Markdown CMS — Markdown is *rendered from existing data*, never authored twice.
- `Web Bot Auth` / MCP server-cards / x402 agent-commerce on the public site (separate from pure content visibility; SF already exposes agents-as-MCP elsewhere).

## Related

- The agent marketplace ([[agent-marketplace]]) + `/ai-agents` SEO/GEO pages (the data the Markdown renders from).
- The unified agent model ([[unified-agent-model]]) — SF sells agents; this makes the storefront agent-native.
