# Agent Marketplace — Wire the World-Class Design to the Backend — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. **PAYMENT-adjacent + has a migration → branch `feature/agent-marketplace`, do NOT auto-merge; Max reviews.** The world-class UI reference (Claude Design output) is at `C:\Users\maxim\Downloads\sf-mkt-design\` — `SeldonFrame Marketplace.dc.html` + `screens/*.png` (browse / listing / ceremony / seller / mcp). It uses the MARKETING tokens (`#F6F2EA` paper · `#221D17` ink · `#00897B` green · `#1F2B24` dark · Hanken Grotesk + Newsreader italic) + per-category accent tints. **Match it.**

**Goal:** Builders list their Studio **agent-templates**; SMBs (and external humans/agents) **browse → install** (clone into their workspace) or **rent via MCP**. SeldonFrame takes 2% — shown ONLY to sellers, NEVER to buyers. Listings are SEO + GEO optimized (rank for humans, citable by AI).

**Architecture (from recon):** Reuse the existing `marketplaceListings` + soul purchase/install/Stripe/2% engine by adding a `kind:"agent"` discriminator + `agentBlueprint` jsonb. Mirror `export-soul.ts`/`install-soul.ts` for agents (`createAgentTemplate` clones the blueprint into the buyer's org; buyer runs it on their own BYOK). The public storefront moves to a unified, SEO-friendly `/marketplace` (legacy `/soul-marketplace` → redirect). Rent-via-MCP is a thin JSON-RPC bridge over the existing `executeTurn` (Phase 2). Real logo: `packages/crm/public/logo.svg` / the inline mark in `marketing-nav.tsx`.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test`+`tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc 0-new (~10 `.next/types` baseline); `bash scripts/check-use-server.sh src` (from `packages/crm`); TDD pure logic; commit per task. Migration via `pnpm drizzle-kit generate` (journals correctly — do NOT hand-number).

---

## PHASE 1 — Engine + storefront (this build)

### Task 1: Schema — agent listings (additive migration)
**Files:** `packages/crm/src/db/schema/marketplace.ts`; generate `drizzle/00NN_*.sql`.
- [ ] Add to `marketplaceListings` (additive, backwards-compatible): `kind text not null default 'soul'`, `agentBlueprint jsonb` (nullable — the `AgentBlueprint`), `agentType text` (nullable — `'voice_receptionist'|'chat_assistant'`). `soulPackage` stays nullable for agents.
- [ ] `pnpm drizzle-kit generate` → verify ONE additive migration (ALTER TABLE ADD COLUMN ×3) + journal append (0 orphans). Paste SQL in the commit. tsc 0-new. **Commit** `feat(marketplace): agent listings — kind/agentBlueprint/agentType (additive migration)`.

### Task 2: Engine — list / publish / install (pure + DI, TDD)
**Files:** Create `packages/crm/src/lib/marketplace/agent-listings.ts` (pure helpers) + extend `lib/marketplace/actions.ts`. Test the pure logic.
- [ ] **`mapTemplateToAgentListing(template, opts)`** (pure): a Studio `agent_templates` row + {price, niche, tags, slug} → the `marketplaceListings` insert (kind:'agent', agentBlueprint=template.blueprint, agentType=template.type, creatorOrgId, name, description). TDD.
- [ ] **`buildInstalledAgentTemplate(listing, buyerOrgId)`** (pure): a kind:'agent' listing → the `createAgentTemplate` args for the buyer (name, type=agentType, blueprint=agentBlueprint, status:'draft'). TDD.
- [ ] **`listMarketplaceAgents({ niche?, q?, featured? }, deps)`** (DI db): published kind='agent' listings, filtered + sorted (featured first, then installCount). TDD with a fake db.
- [ ] **`publishAgentTemplateAction({ templateId, priceCents, niche, tags })`** (`"use server"`): org-guard; load the template; `mapTemplateToAgentListing` → insert listing (isPublished per Stripe-connect readiness, mirror soul publish). Returns `{ slug }`.
- [ ] **`installAgentListingAction({ slug })`** (`"use server"`): org-guard; load listing; if free → `buildInstalledAgentTemplate` → `createAgentTemplate` in buyer org + increment installCount + record installed; if paid → reuse the soul Stripe-checkout path with a `kind:'agent'` branch in `finalizeSoulPurchaseFromWebhook` (the 2% already applies at the charge site). Returns `{ ok, templateId? , checkoutUrl? }`.
- [ ] TDD the pure mappers + the list filter. Cover the actions at the pure layer per repo convention. **Commit** `feat(marketplace): list/publish/install agent templates (TDD)`.

### Task 3: Browse storefront — `/marketplace` (world-class, match the design)
**Files:** Create `packages/crm/src/app/(public)/marketplace/page.tsx` + components under `components/marketplace/`. Redirect `/soul-marketplace` → `/marketplace?kind=soul`.
- [ ] Build to the design (`sf-mkt-design/SeldonFrame Marketplace.dc.html` + `screens/01-01-browse.png`, `02-browse-mid.png`): **nav** (REAL SeldonFrame logo + wordmark · Browse · Studio · Sell · Search agents), **editorial hero** (*"Hire an agent. It works 24/7, for pennies."* — the 2 hero variants the design explored — pick the stronger), **category tiles** (Receptionists · Reviews & reputation · Reactivation · Quoting · Support · Social, with the accent tints), **Featured** row, the **agent-card grid** (icon, name, one-line job, **surface pills** voice/chat/SMS/email, **install count + ⭐rating**, **Free / $X·mo**, **"built by [builder]"**), and the **footer** (*"The engine stays invisible; your agents do the talking."*). Wire to `listMarketplaceAgents`. **NO 2% anywhere on this buyer surface** (remove the design's footer "2% flat fee" line). SEO `<title>`/description/OG. Keep `"use client"` only where interactive (search/filter).
- [ ] tsc 0-new; route compiles. **Commit** `feat(marketplace): world-class /marketplace browse storefront (real logo, no buyer-facing fee)`.

### Task 4: Listing detail — `/marketplace/[slug]` + SEO/GEO + Install + Rent-via-MCP
**Files:** Create `packages/crm/src/app/(public)/marketplace/[slug]/page.tsx` + the install ceremony.
- [ ] Build to the design (`screens/01-listing.png`, `04-listing.png`, `mcp.png`, `ceremony*.png`): **what it does**, **surfaces + tools** it uses, a **live sample conversation**, **reviews** (credibility), **"more from [builder]"**, the **Install into my workspace** primary CTA (→ `installAgentListingAction`) + a **"Rent via MCP"** secondary that reveals the endpoint `https://app.seldonframe.com/api/v1/agents/[slug]/mcp` + a **copyable config snippet** (Phase 2 wires the endpoint; the UI ships now).
- [ ] **SEO/GEO (bake in):** semantic `<h1>`=agent name, `<h2>` sections; a visible **"built by [builder] · installed by N · ⭐rating"** block near the top; **schema.org `SoftwareApplication`** JSON-LD (name, description, aggregateRating, offers, author) via `dangerouslySetInnerHTML`; per-listing `generateMetadata` (title/description/OG image). Clean semantic markup so LLMs can cite it.
- [ ] **Install ceremony:** on install → the delightful *"Your [Agent] is moving in…"* animated moment → routes to the buyer's Studio (`/studio/agents/[id]`). Match `ceremony*.png`; one tasteful animated peak (the rest stays editorial-calm).
- [ ] **NO 2% on this buyer surface.** **Commit** `feat(marketplace): listing detail — SEO/GEO + schema.org + install ceremony + Rent-via-MCP UI`.

### Task 5: Verify Phase 1
- [ ] Suites green; `tsc` 0-new; `check-use-server` clean; migration journal append + 0 orphans.
- [ ] **Report:** the schema + engine + the 2 storefront pages (file:line), the real-logo usage, that NO buyer surface shows 2%, the SEO/GEO + schema.org coverage, the regression statement (soul/blocks marketplace + the existing 2% fee untouched; `kind` defaults to 'soul'), new-test count, and the honest gap — **DO NOT MERGE** (migration + Max review); live gate = browse → open a listing → Install → it lands in Studio.

---

## PHASE 2 — Rent-via-MCP (next build)
- [ ] `/api/v1/agents/[slug]/mcp` — JSON-RPC 2.0 bridge → `executeTurn` (reuse `/api/v1/public/agent/[slug]/turn` pattern) + a bearer rental key per listing (encrypted) + usage metering → the 2% on rentals. The copyable config snippet wires to this.

## PHASE 3 — Seller flow + earnings (next build)
- [ ] **"List on the marketplace"** from the Studio agent editor → `publishAgentTemplateAction` with a live listing preview (name/category/price-or-free). **Earnings dashboard** — installs · rentals · revenue, with the **2% shown transparently ("you keep 98%")** — the ONLY place the fee appears.

## Self-Review
- Coverage: agent listings via `kind` discriminator (T1) ✓; list/publish/install reusing the soul engine + 2% (T2) ✓; world-class browse + listing matching the design (T3/T4) ✓; SEO/GEO + schema.org (T4) ✓; real logo + 2%-seller-only (T3/T4/Phase3) ✓; MCP rental UI now / endpoint Phase 2 ✓.
- Risk: the migration (Max's gate, don't auto-merge); the `/soul-marketplace`→`/marketplace` route move (add a redirect, don't break existing soul links).
