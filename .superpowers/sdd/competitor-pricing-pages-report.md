# Competitor Pricing Pages — build report

## Files changed

All paths relative to `packages/crm/` inside worktree `.claude/worktrees/ghl-seo` (branch `feature/ghl-seo-engine`). No file outside this list was touched. No commits were made (per instructions).

- `src/lib/seo/competitor-pricing.ts` (new) — the `PRICING` registry, 25 entries
- `src/lib/seo/competitor-pricing-markdown.ts` (new) — `renderCompetitorPricingMarkdown(slug)`
- `src/components/seo/pricing-page.tsx` (new) — `CompetitorPricingPage({ slug })` template + exported pure helpers `startsAtLabel`, `composePricingFaq`
- `tests/unit/seo/competitor-pricing.spec.ts` (new) — 194 assertions
- 25 page folders: `src/app/(public)/<slug>-pricing/page.tsx`
- 25 md-twin route folders: `src/app/<slug>-pricing.md/route.ts`

Slugs (25, exact match to `alternative-pages.ts` COMPETITORS minus `claude-projects`, which has no vendor pricing page): gohighlevel, activecampaign, hubspot, clickfunnels, keap, linktree, kartra, sharpspring, klaviyo, zoho, salesforce, vapi, retell-ai, synthflow, chatbase, botpress, stammer-ai, podium, vendasta, goodcall, voiceflow, lindy, durable, my-ai-front-desk, smith-ai.

## What changed, per file

**`competitor-pricing.ts`** — `CompetitorPricing` type (slug, pricingUrl, verified, quoteGated, freeTier?, annualNote?, plans[], stacks[], bottomLine) plus `PRICING`, `getCompetitorPricing(slug)` (throws on miss), `allPricingSlugs()`. Every fact traces to `docs/superpowers/specs/2026-07-08-competitor-pricing-facts.md`; ✅ facts stated plainly, 🔶 facts hedged with "listed at ~"/"reported"/"third-party sources say", ❌ (quote-gated) facts marked `quoteGated: true` with "talk to sales"/"contact sales"/"quote-gated" language in the plan/bottomLine text (not an invented number). Goodcall and My AI Front Desk use the newer 2026 repriced numbers per the facts file's drift note ($79/$129/$249/agent and $20/$99 respectively).

**`competitor-pricing-markdown.ts`** — `renderCompetitorPricingMarkdown(slug)`, a pure string-builder mirroring `alternative-markdown.ts`'s style (short version → plans table → what-stacks-on-top → free tier/annual → bottom line → SF comparison → FAQ → sources → get-started). Deliberately does NOT import from `pricing-page.tsx` (kept the lib layer self-contained, matching how `alternative-markdown.ts` doesn't import from `alternative-page.tsx` — small local `startsAt`/`buildFaq` helpers instead of cross-layer coupling).

**`pricing-page.tsx`** — server component `CompetitorPricingPage({ slug })` following the `alternative-page.tsx`/`seldonframe-vs-page.tsx` visual language: MKT tokens, `TldrBox`, `emphasize()`, `MarkdownPointer`, FAQPage JSON-LD, `MarketplaceNav`/`MarketplaceFooter` chrome, scoped `<style>` media query for mobile. Sections: breadcrumb → hero (kicker "Pricing breakdown · checked `<verified>`", H1 "`<Name>` Pricing (2026): What You'll Actually Pay") → TldrBox (💰 Starts at / 📈 What stacks on top / 🪙 SeldonFrame comparison) → plan cards grid → "What stacks on top" (red-accented cards, one per `stacks[]` entry — the section the mission calls out as "nobody else writes honestly") → freeTier/annualNote lines → "How this compares to SeldonFrame" (2 sentences + links to `/compare/seldonframe-vs-<slug>` and `/alternative-to-<slug>`) → FAQ (3 items via `composePricingFaq`) → sources row (outbound link, `rel="nofollow noopener"`, opens new tab) → dark CTA band → cross-links to 3 other `-pricing` pages. No og:image URLs added anywhere (left to the agent that owns the OG system, per instructions).

**25 page folders** — each `page.tsx` sets `SLUG`, computes title/description/canonical from the registry + `getCompetitor`, sets `alternates.canonical` + `alternates.types["text/markdown"]`, `openGraph`/`twitter` metadata (no image fields), renders `<CompetitorPricingPage slug={SLUG} />`.

**25 md-twin route folders** — each `route.ts` calls `logMarkdownFetch` then returns `renderCompetitorPricingMarkdown(slug)` as `text/markdown`, with `Link: rel="alternate"` back to the HTML page and a 5-min/1-hr cache header, matching `alternative-to-gohighlevel.md/route.ts` exactly.

## Deviations from the plan and why

1. **Markdown surface value**: the mission asked me to check `md-analytics.ts`'s `MarkdownSurface` union for a fitting value before falling back to `"alternative_page"`. I checked — no `"pricing_page"` value exists (union has `marketplace_index/listing`, `ai_agents_index/listing`, `index`, `home`, `llms_txt`, `robots_txt`, `alternative_page`, `compare_page`, `sf_vs_page`, `best_page`). **I used `"alternative_page"`** for all 25 md routes, per the mission's own fallback instruction. Flagging here per instructions so the coordinator can add a dedicated `"pricing_page"` surface value to the union and repoint these 25 routes' `surface:` argument in one small follow-up — I did not touch `md-analytics.ts` since it wasn't in my file list.
2. **`competitor-pricing-markdown.ts` does not import from `pricing-page.tsx`**: the spec draft I inferred implied reuse, but I found `alternative-markdown.ts` deliberately does NOT import from `alternative-page.tsx` (kept lib/ pure and independent of components/). I matched that existing convention rather than introducing a components→lib-consumed-by-route.ts coupling. `startsAtLabel`/`composePricingFaq` are still exported from `pricing-page.tsx` for any future reuse/tests, but the markdown renderer has its own small local equivalents.
3. **Generation tooling artifact**: I generated the 50 page/route files via a one-off Node script for consistency; a first pass wrote to `/tmp` instead of the worktree due to a `__dirname` vs `cwd` mismatch, caught immediately by verification (files didn't appear where expected), corrected by copying into the correct worktree paths, and the temp script + output were deleted. Final state verified clean (UTF-8, no BOM, LF; tsc clean; tests green) — noting this only because it's a real thing that happened, not because it affected the deliverable.
4. **`sharpspring` pricingUrl**: the facts file's URL (`constantcontact.com/pricing/lead-gen-crm`) 403's to automated fetches per the facts doc itself; I kept the URL as-is (per mission: pricingUrl is a "real outbound link" — it's real, just gated/possibly discontinued) and the `bottomLine`/`quoteGated: true` text says so plainly rather than inventing a working canonical URL.

## Test results (verbatim tail)

```
$ node --import tsx --test tests/unit/seo/competitor-pricing.spec.ts
✔ renderCompetitorPricingMarkdown('smith-ai') includes the sources line with the real pricingUrl (0.025ms)
✔ renderCompetitorPricingMarkdown throws for an unknown slug (0.0895ms)
ℹ tests 194
ℹ suites 0
ℹ pass 194
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 286.5434
```

```
$ npx tsc --noEmit -p .
(grep for competitor-pricing|pricing-page.tsx|-pricing/page.tsx|-pricing.md/route.ts against full output: 0 matches)
```
Pre-existing baseline tsc errors unrelated to this task remain (missing `zod`/`@testing-library/react` type declarations in unrelated spec files) — none touch any file in this deliverable.

```
$ pnpm check:use-server
✓ All 'use server' files export only async functions / types.
```

Encoding check (custom script, all 54 new files): UTF-8, no BOM, LF-only. 0 bad files.

## Heaviest hedging (3-4 competitors)

1. **SharpSpring / Constant Contact Lead Gen & CRM** — the shakiest entry in the whole facts file: page 403's to automated fetch, quote-gated, product reportedly discontinued/folded into Constant Contact's main suite. All pricing is framed as "historically anchored," unverified for 2026.
2. **Synthflow** — pricing model changed to enterprise-first sometime in 2026; the live page now shows only a ~$30k/yr custom tier. Older self-serve per-minute rates and the $2,000/mo whitelabel add-on are reported from third-party sources only and explicitly flagged as unconfirmed against the live page.
3. **Botpress** — page 403'd during research; Plus/Team dollar figures conflict across sources ($79 vs $89–150/mo; $446 vs $495/mo). Quoted as "listed at ~$79/mo" with the conflict noted in `stacks[]`.
4. **Podium / Smith.ai** (tied) — both are fully quote-gated with pricing pages that are sales-lead forms; every number in both entries is third-party-reported and hedged accordingly ("reported ~$399/mo — unverified against Podium directly", etc.).

## Open risks

- The `"pricing_page"` md-analytics surface gap noted above (deviation #1) — cosmetic (analytics grouping), not functional; the routes work correctly today under `"alternative_page"`.
- `sitemap.xml`/`llms.txt` entries for these 50 new URLs are explicitly out of scope (coordinator owns those per the mission) — these pages will not be discovered by crawlers until that's wired.
- OG image URLs are intentionally absent from all 25 pages' metadata per instructions; another agent must wire `pricingOgUrl`-equivalent when the OG system is ready, mirroring `alternativeOgUrl`.
- I did not independently re-verify any pricing figure against a live browser fetch — all data traces to the pre-researched facts file as instructed (my only fact source).
